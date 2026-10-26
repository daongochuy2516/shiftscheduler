import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { format, formatDistanceStrict } from 'date-fns'
import {
  Check,
  Cloud,
  CloudOff,
  Database,
  Download,
  ExternalLink,
  Globe,
  HardDrive,
  KeyRound,
  RotateCw,
  Smartphone,
  Trash2,
  UserRound,
  Network,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { IS_MOCK_BACKEND } from '../data'
import { FixedLang, useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { supabaseHost } from '../lib/supabaseClient'
import {
  probeSupabase,
  type ProbeResult,
  type SupabaseStatus,
} from '../lib/supabaseStatus'
import { probeCloudflare, type CloudflareStatus } from '../lib/cloudflareStatus'
import { probeNetlify, type NetlifyStatus } from '../lib/netlifyStatus'
import type { StatuspageSummary } from '../lib/statuspage'
import { Avatar } from '../components/Avatar'
import {
  offlineStats,
  resetOfflineData,
  type OfflineKind,
  type OfflineStats,
} from '../data/offlineCache'
import { useNetworkStatus, useOfflineMetrics } from '../data/networkStatus'
import { useNotify } from '../notifications/NotificationContext'
import { useTwoStep } from '../components/useTwoStep'
import { promptInstall, useInstallState } from '../pwa/install'
import { InstallHelpModal } from '../components/InstallHelpModal'
import {
  connectionInfo,
  precacheInfo,
  storageInfo,
  type PrecacheInfo,
  type StorageInfo,
} from '../pwa/storage'
import {
  applyUpdate,
  checkForUpdate,
  useServiceWorker,
} from '../pwa/serviceWorker'

const RECHECK_MS = 30_000
/** Dưới mức này là tốt; tới SLOW_MS là chậm; trên nữa coi như có vấn đề. */
const FAST_MS = 500
const SLOW_MS = 1500
const EXPIRING_MS = 5 * 60_000
const MAX_INCIDENTS = 3

type Tone = 'ok' | 'warn' | 'error' | 'idle'

const DOT: Record<Tone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  error: 'bg-rose-500',
  idle: 'bg-slate-300',
}

const PILL: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  error: 'bg-rose-50 text-rose-700 ring-rose-200',
  idle: 'bg-slate-100 text-slate-600 ring-slate-200',
}

const OVERALL_LABEL: Record<Tone, TranslationKey> = {
  ok: 'status.ok',
  warn: 'status.degraded',
  error: 'status.down',
  idle: 'status.checking',
}

function msTone(ms: number): Tone {
  if (ms > SLOW_MS) return 'error'
  return ms > FAST_MS ? 'warn' : 'ok'
}

function probeTone(probe: ProbeResult): Tone {
  return probe.ok ? msTone(probe.ms) : 'error'
}

function supabaseTone(status: SupabaseStatus): Tone {
  const tones = [probeTone(status.auth), probeTone(status.database)]
  if (tones.includes('error')) return 'error'
  if (tones.includes('warn') || !status.realtime.connected) return 'warn'
  return 'ok'
}

/** Chỉ số Statuspage: none | minor | major | critical | maintenance. */
function summaryTone(summary: StatuspageSummary): Tone {
  if (summary.indicator === 'none') return 'ok'
  if (summary.indicator === 'major' || summary.indicator === 'critical') {
    return 'error'
  }
  return 'warn'
}

/**
 * Ô tổng của thẻ Cloudflare/Netlify. Khi app đang được nhà cung cấp đó phục
 * vụ, ô theo chính phản hồi của app: trạng thái chung của họ gần như lúc nào
 * cũng có sự cố nhỏ ở đâu đó trên thế giới, để nó quyết định thì ô luôn vàng.
 * Không đi qua họ (localhost, hay host của nhà cung cấp kia) thì ô xám
 * "Inactive", bất kể trạng thái chung: nhà cung cấp không dính tới bản đang
 * mở, sự cố của họ không ảnh hưởng gì. Trạng thái chung vẫn hiện ở dòng dưới.
 */
function providerBadge(
  loaded: boolean,
  servedMs: number | null,
): { tone: Tone; label: TranslationKey } {
  if (!loaded) return { tone: 'idle', label: 'status.checking' }
  if (servedMs === null) return { tone: 'idle', label: 'status.provider.inactive' }
  const tone = msTone(servedMs)
  return { tone, label: OVERALL_LABEL[tone] }
}

export function StatusPage() {
  // Tiêu đề, dòng mô tả và nút Kiểm tra lại theo ngôn ngữ của web; mọi thứ
  // trong các thẻ luôn tiếng Anh (StatusCards, bọc trong FixedLang).
  const { t } = useI18n()
  const [status, setStatus] = useState<SupabaseStatus | null>(null)
  const [cf, setCf] = useState<CloudflareStatus | null>(null)
  const [nf, setNf] = useState<NetlifyStatus | null>(null)
  // Lần đầu kiểm tra ngay khi mở trang nên bắt đầu ở trạng thái "đang kiểm tra".
  const [checking, setChecking] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const lastProbeRef = useRef(0)

  /**
   * `providers`: hỏi cả Cloudflare / Netlify. Chỉ lúc mở trang và khi bấm
   * Kiểm tra lại — lượt tự kiểm tra chỉ làm mới Supabase: trạng thái chung của
   * nhà cung cấp hiếm khi đổi trong vài chục giây, hỏi liên tục chỉ thêm dịp
   * gặp lỗi mạng vặt.
   */
  const probe = useCallback(async (providers: boolean) => {
    lastProbeRef.current = Date.now()
    try {
      await Promise.all([
        IS_MOCK_BACKEND ? null : probeSupabase().then(setStatus),
        providers ? probeCloudflare().then(setCf) : null,
        providers ? probeNetlify().then(setNf) : null,
      ])
    } finally {
      setChecking(false)
    }
  }, [])

  // Các lần tự kiểm tra định kỳ chạy ngầm; chỉ bấm tay mới hiện vòng quay.
  // Tab đang ẩn thì không hỏi: không ai xem, và lượt chạy ngay lúc máy vừa
  // thức dậy (mạng chưa kịp nối lại) chỉ ra lỗi giả. Quay lại tab mà đã quá
  // một nhịp thì kiểm tra luôn.
  useEffect(() => {
    void probe(true)
    const id = setInterval(() => {
      if (!document.hidden) void probe(false)
    }, RECHECK_MS)
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastProbeRef.current >= RECHECK_MS) void probe(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [probe])

  function recheck() {
    setChecking(true)
    void probe(true)
  }

  // Đồng hồ cho "x giây trước" và đếm ngược hạn token.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Network className="h-5 w-5 shrink-0 text-slate-400" />
            {t('status.title')}
          </h1>
          <p className="text-sm text-slate-500">{t('status.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={recheck}
          disabled={checking}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RotateCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
          {t('status.recheck')}
        </button>
      </div>

      <FixedLang lang="en">
        <StatusCards status={status} cf={cf} nf={nf} now={now} />
      </FixedLang>
    </div>
  )
}

/**
 * Sáu thẻ của trang. Luôn tiếng Anh, ở mọi ngôn ngữ của web: tên dịch vụ,
 * trạng thái và số liệu kỹ thuật đọc chuẩn nhất bằng thuật ngữ gốc. Chuỗi vẫn
 * qua `t()` (khoá `status.*` chỉ có ở `en`, xem `EnglishOnlyKey`).
 */
function StatusCards({
  status,
  cf,
  nf,
  now,
}: {
  status: SupabaseStatus | null
  cf: CloudflareStatus | null
  nf: NetlifyStatus | null
  now: number
}) {
  const { t, dateLocale } = useI18n()
  const { user } = useAuth()

  // `now` chỉ nhích mỗi giây: mốc vừa ghi có thể muộn hơn nó vài trăm ms,
  // không kẹp lại thì ra "0 giây nữa".
  const ago = (at: number) =>
    formatDistanceStrict(Math.min(at, now), now, {
      addSuffix: true,
      locale: dateLocale,
    })

  const session = status?.session ?? null
  const sessionTone: Tone = IS_MOCK_BACKEND
    ? 'ok'
    : !status
      ? 'idle'
      : !session
        ? 'error'
        : session.expiresAt === null
          ? 'ok'
          : session.expiresAt <= now
            ? 'error'
            : session.expiresAt - now < EXPIRING_MS
              ? 'warn'
              : 'ok'
  const sessionLabel: TranslationKey = IS_MOCK_BACKEND
    ? 'status.sessionValid'
    : !status
      ? 'status.checking'
      : !session
        ? 'status.sessionNone'
        : sessionTone === 'error'
          ? 'status.sessionExpired'
          : sessionTone === 'warn'
            ? 'status.sessionExpiring'
            : 'status.sessionValid'

  const cfBadge = providerBadge(cf !== null, cf?.edge?.ms ?? null)
  const nfBadge = providerBadge(nf !== null, nf?.origin?.ms ?? null)

  return (
    <div lang="en" className="grid gap-4 lg:grid-cols-2">
      {/* ---- Database (Supabase) ---- */}
      <Card
        icon={Database}
        title={t('status.supabase')}
        tone={IS_MOCK_BACKEND || !status ? 'idle' : supabaseTone(status)}
        label={
          IS_MOCK_BACKEND
            ? t('status.mockShort')
            : t(status ? OVERALL_LABEL[supabaseTone(status)] : 'status.checking')
        }
      >
        {IS_MOCK_BACKEND ? (
          <Note>{t('status.mock')}</Note>
        ) : (
          <dl className="divide-y divide-slate-100">
            <Row label={t('status.host')}>
              <span className="font-mono text-xs">{supabaseHost ?? '—'}</span>
            </Row>
            <Row label={t('status.auth')}>
              <Probe probe={status?.auth} />
            </Row>
            <Row label={t('status.database')}>
              <Probe probe={status?.database} />
            </Row>
            <Row label={t('status.realtime')}>
              {status ? (
                <Indicator tone={status.realtime.connected ? 'ok' : 'warn'}>
                  {status.realtime.connected
                    ? t('status.realtimeConnected', {
                        joined: status.realtime.channels.filter(
                          (c) => c.state === 'joined',
                        ).length,
                        total: status.realtime.channels.length,
                      })
                    : t('status.realtimeDisconnected')}
                </Indicator>
              ) : (
                <Pending />
              )}
            </Row>
            <Row label={t('status.lastChecked')}>
              {status ? ago(status.checkedAt) : <Pending />}
            </Row>
          </dl>
        )}
      </Card>

      {/* ---- Phiên đăng nhập ---- */}
      <Card
        icon={KeyRound}
        title={t('status.session')}
        tone={sessionTone}
        label={t(sessionLabel)}
      >
        <dl className="divide-y divide-slate-100">
          <Row label={t('status.account')}>
            {user ? (
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={user.display_name} seed={user.id} size="sm" />
                <span className="min-w-0 text-right">
                  <span className="block truncate font-medium text-slate-900">
                    {user.display_name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {user.email}
                  </span>
                </span>
              </span>
            ) : (
              <UserRound className="h-4 w-4 text-slate-400" />
            )}
          </Row>

          {!IS_MOCK_BACKEND && (
            <>
              <Row
                label={t('status.expiresAt')}
                hint={session?.expiresAt ? t('status.autoRefreshHint') : undefined}
              >
                {!status ? (
                  <Pending />
                ) : session?.expiresAt ? (
                  <span className="text-right">
                    <span className="block tabular-nums">
                      {format(session.expiresAt, 'HH:mm:ss · dd/MM')}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {session.expiresAt > now
                        ? t('status.expiresIn', {
                            time: formatDistanceStrict(session.expiresAt, now, {
                              locale: dateLocale,
                            }),
                          })
                        : ago(session.expiresAt)}
                    </span>
                  </span>
                ) : (
                  '—'
                )}
              </Row>
              <Row label={t('status.lastSignIn')}>
                {!status ? (
                  <Pending />
                ) : session?.lastSignInAt ? (
                  <span className="tabular-nums">
                    {format(new Date(session.lastSignInAt), 'HH:mm · dd/MM/yyyy')}
                  </span>
                ) : (
                  '—'
                )}
              </Row>
              <Row label={t('status.userId')}>
                <span className="truncate font-mono text-xs">
                  {session?.userId ?? user?.id ?? '—'}
                </span>
              </Row>
            </>
          )}
        </dl>
        {IS_MOCK_BACKEND && (
          <Note bordered>{t('status.mockSession')}</Note>
        )}
      </Card>

      {/* ---- Ứng dụng (PWA, offline) ---- */}
      <AppCard />
      <OfflineCard now={now} ago={ago} />

      {/* ---- Cloudflare ---- */}
      <Card
        icon={Cloud}
        title="Cloudflare"
        tone={cfBadge.tone}
        label={t(cfBadge.label)}
      >
        <dl className="divide-y divide-slate-100">
          <Row label={t('status.provider.edge')}>
            {!cf ? (
              <Pending />
            ) : cf.edge ? (
              <Indicator tone={msTone(cf.edge.ms)}>
                <span className="font-mono text-xs">{cf.edge.colo}</span>
                {cf.edge.loc && (
                  <span className="text-slate-500"> · {cf.edge.loc}</span>
                )}
              </Indicator>
            ) : (
              <NotServed name="Cloudflare" />
            )}
          </Row>
          {cf?.edge && (
            <>
              <Row label={t('status.provider.latency')}>
                <span className="tabular-nums">{cf.edge.ms} ms</span>
              </Row>
              <Row label={t('status.cf.protocol')}>
                <span className="font-mono text-xs">
                  {[cf.edge.http, cf.edge.tls].filter(Boolean).join(' · ') || '—'}
                </span>
              </Row>
            </>
          )}
          <SummaryRows
            name="Cloudflare"
            host="cloudflarestatus.com"
            loaded={cf !== null}
            summary={cf?.global ?? null}
            error={cf?.globalError ?? null}
          />
        </dl>
        <IncidentList summary={cf?.global ?? null} />
      </Card>

      {/* ---- Netlify ---- */}
      <Card
        icon={Globe}
        title="Netlify"
        tone={nfBadge.tone}
        label={t(nfBadge.label)}
      >
        <dl className="divide-y divide-slate-100">
          <Row label={t('status.provider.edge')}>
            {!nf ? (
              <Pending />
            ) : nf.origin ? (
              <Indicator tone={msTone(nf.origin.ms)}>
                <span className="font-mono text-xs">
                  {nf.origin.dc ?? 'Netlify'}
                </span>
              </Indicator>
            ) : (
              <NotServed name="Netlify" />
            )}
          </Row>
          {nf?.origin && (
            <>
              <Row label={t('status.provider.latency')}>
                <span className="tabular-nums">{nf.origin.ms} ms</span>
              </Row>
              <Row label={t('status.nf.cache')}>
                <span className="font-mono text-xs">{nf.origin.cache ?? '—'}</span>
              </Row>
            </>
          )}
          <SummaryRows
            name="Netlify"
            host="netlifystatus.com"
            loaded={nf !== null}
            summary={nf?.global ?? null}
            error={nf?.globalError ?? null}
          />
        </dl>
        <IncidentList summary={nf?.global ?? null} />
      </Card>
    </div>
  )
}

/** Byte → "953 KB", "1,2 MB" theo ngôn ngữ đang dùng. */
function formatBytes(n: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = n
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  const digits = i > 0 && value < 10 ? 1 : 0
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${units[i]}`
}

/** Nút nhỏ ở chân thẻ. `danger`: màu đỏ, `armed`: đang chờ bấm lần hai. */
function FooterButton({
  icon: Icon,
  onClick,
  disabled,
  tone = 'default',
  spinning = false,
  children,
}: {
  icon: typeof Network
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'primary' | 'ghost' | 'danger' | 'armed'
  spinning?: boolean
  children: ReactNode
}) {
  const toneClass = {
    default: 'border border-slate-300 bg-white text-slate-700 shadow-xs hover:bg-slate-50',
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
    danger: 'text-rose-600 hover:bg-rose-50',
    armed: 'bg-rose-600 text-white',
  }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition disabled:opacity-60 ${toneClass}`}
    >
      <Icon className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} />
      {children}
    </button>
  )
}

/**
 * Cài như app và service worker: vỏ ứng dụng đã lưu sẵn để mở khi offline,
 * phiên bản đang chạy, bản mới.
 */
function AppCard() {
  const { t, lang } = useI18n()
  const sw = useServiceWorker()
  const install = useInstallState()
  const { online } = useNetworkStatus()
  const notify = useNotify()
  // undefined: đang đọc; null: chưa có vỏ ứng dụng nào được lưu.
  const [shell, setShell] = useState<PrecacheInfo | null | undefined>(undefined)
  const [installing, setInstalling] = useState(false)
  const [installHelpOpen, setInstallHelpOpen] = useState(false)
  // Vừa kiểm tra xong mà không có bản mới: nút nói vậy một lúc rồi trở lại.
  const [upToDate, setUpToDate] = useState(false)

  useEffect(() => {
    if (!upToDate) return
    const id = setTimeout(() => setUpToDate(false), 3000)
    return () => clearTimeout(id)
  }, [upToDate])

  async function handleCheck() {
    setUpToDate((await checkForUpdate()) === false)
  }

  /** Cùng hành vi với mục "Cài ứng dụng" trong nút lưới (AppLayout). */
  async function handleInstall() {
    if (install.manualIos) {
      setInstallHelpOpen(true)
      return
    }
    setInstalling(true)
    const accepted = await promptInstall()
    setInstalling(false)
    if (accepted) notify.success('notif.pwa.installed')
  }

  // Đọc lại khi worker vừa cài xong hay vừa có bản mới.
  useEffect(() => {
    if (!sw.supported) return
    let alive = true
    const load = () =>
      void precacheInfo().then((next) => {
        if (alive) setShell(next)
      })
    load()
    const id = setInterval(load, RECHECK_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [sw.supported, sw.ready, sw.needRefresh])

  const tone: Tone = sw.needRefresh ? 'warn' : sw.ready ? 'ok' : 'idle'
  const label: TranslationKey = sw.needRefresh
    ? 'status.app.updateAvailable'
    : sw.ready
      ? 'status.app.ready'
      : !sw.supported
        ? import.meta.env.PROD
          ? 'status.app.unsupported'
          : 'status.app.devOff'
        : 'status.app.settingUp'
  const build = format(new Date(__APP_BUILD__), 'HH:mm · dd/MM/yyyy')

  return (
    <Card
      icon={Smartphone}
      title={t('status.app')}
      tone={tone}
      label={t(label)}
      footer={
        <>
          <span className="text-xs text-slate-500">
            {t('status.app.versionHint')}{' '}
            <span className="text-slate-700 tabular-nums select-text">{build}</span>
          </span>
          {sw.supported && (
            <span className="ml-auto">
              {sw.needRefresh ? (
                <FooterButton icon={RotateCw} tone="primary" onClick={applyUpdate}>
                  {t('status.app.update')}
                </FooterButton>
              ) : (
                <FooterButton
                  icon={upToDate ? Check : RotateCw}
                  tone="ghost"
                  spinning={sw.checking}
                  onClick={() => void handleCheck()}
                  disabled={sw.checking || !online}
                >
                  {sw.checking
                    ? t('status.app.checking')
                    : upToDate
                      ? t('status.app.upToDate')
                      : t('status.app.check')}
                </FooterButton>
              )}
            </span>
          )}
        </>
      }
    >
      <dl className="divide-y divide-slate-100">
        <Row nowrap label={t('status.app.mode')}>
          {install.standalone ? t('status.app.standalone') : t('status.app.browser')}
        </Row>
        {sw.supported && (
          <>
            <Row label={t('status.app.sw')}>
              <Indicator tone={tone}>
                {t(
                  sw.needRefresh
                    ? 'status.app.sw.waiting'
                    : sw.ready
                      ? 'status.app.sw.active'
                      : 'status.app.settingUp',
                )}
              </Indicator>
            </Row>
            <Row nowrap label={t('status.app.shell')} hint={t('status.app.shellHint')}>
              {shell === undefined ? (
                <Pending />
              ) : shell === null ? (
                t('status.app.settingUp')
              ) : (
                <span className="tabular-nums">
                  {t('status.app.shellValue', {
                    count: shell.files,
                    size: formatBytes(shell.bytes, lang),
                  })}
                </span>
              )}
            </Row>
          </>
        )}
        <Row
          nowrap
          label={t('status.app.install')}
          hint={
            install.standalone
              ? undefined
              : install.canPrompt
                ? t('status.app.installHint')
                : install.manualIos
                  ? t('status.app.installIosHint')
                  : !import.meta.env.PROD
                    ? undefined
                    : install.promptSupported
                      ? t('status.app.installNotOfferedHint')
                      : t('status.app.installOtherHint')
          }
        >
          {install.standalone ? (
            <Indicator tone="ok">{t('status.app.installed')}</Indicator>
          ) : install.canPrompt || install.manualIos ? (
            <FooterButton
              icon={Download}
              tone="primary"
              onClick={() => void handleInstall()}
              disabled={installing}
            >
              {install.canPrompt ? t('status.app.installNow') : t('status.app.installHow')}
            </FooterButton>
          ) : (
            // Dev không có manifest nên trình duyệt không bao giờ mời cài.
            // Chrome / Edge không mời khi app đã cài trên máy (mở bằng tab
            // thường): đừng báo "không hỗ trợ" trên chính trình duyệt hỗ trợ.
            t(
              !import.meta.env.PROD
                ? 'status.app.devOff'
                : install.promptSupported
                  ? 'status.app.installNotOffered'
                  : 'status.app.installUnsupported',
            )
          )}
        </Row>
      </dl>
      {installHelpOpen && <InstallHelpModal onClose={() => setInstallHelpOpen(false)} />}
      {/* Không có service worker thì các dòng về nó chỉ toàn "—": nói lý do
          một lần, căn giữa phần còn lại của thẻ (thẻ bên cạnh cao hơn). */}
      {!sw.supported && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 border-t border-slate-100 px-6 py-6 text-center">
          <CloudOff className="h-6 w-6 text-slate-300" />
          <p className="max-w-sm text-sm text-slate-500 select-text">
            {t(import.meta.env.PROD ? 'status.app.unsupportedNote' : 'status.app.devNote')}
          </p>
        </div>
      )}
    </Card>
  )
}

const OFFLINE_KINDS: readonly OfflineKind[] = ['shifts', 'bounds', 'logs', 'profiles', 'templates', 'accounts']
const KIND_LABEL: Record<OfflineKind, TranslationKey> = {
  shifts: 'status.offline.kind.shifts',
  bounds: 'status.offline.kind.bounds',
  logs: 'status.offline.kind.logs',
  profiles: 'status.offline.kind.profiles',
  templates: 'status.offline.kind.templates',
  accounts: 'status.offline.kind.accounts',
}

/** Một ô số trong dải số đếm của phiên. */
function Stat({
  label,
  value,
  sub,
  warn = false,
}: {
  label: string
  value: number
  sub?: string
  warn?: boolean
}) {
  return (
    <div className="min-w-0 px-4 py-2.5">
      <p className={`text-lg leading-6 font-semibold tabular-nums ${warn ? 'text-amber-600' : 'text-slate-900'}`}>
        {value}
      </p>
      <p className="truncate text-xs text-slate-500">{label}</p>
      {sub && <p className="truncate text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}

/**
 * Mạng và bản lưu để xem offline: phiên này đọc từ máy chủ hay từ bản lưu
 * bao nhiêu lần, mất mạng mấy lần, bản lưu gồm những gì, trình duyệt có giữ
 * nó lâu dài không. Số đếm của phiên nằm trong bộ nhớ (networkStatus.ts),
 * tải lại trang là về 0.
 */
function OfflineCard({ now, ago }: { now: number; ago: (at: number) => string }) {
  const { t, lang, dateLocale } = useI18n()
  const notify = useNotify()
  const { online, staleSince } = useNetworkStatus()
  const m = useOfflineMetrics()
  const conn = connectionInfo()
  // undefined: đang đọc; null: trình duyệt không có API tương ứng.
  const [stats, setStats] = useState<OfflineStats | null | undefined>(undefined)
  const [storage, setStorage] = useState<StorageInfo | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  // Đọc lại định kỳ, và mỗi khi phiên vừa đọc thêm (bản lưu vừa đổi).
  useEffect(() => {
    let alive = true
    const run = () =>
      void Promise.all([offlineStats(), storageInfo()]).then(([nextStats, nextStorage]) => {
        if (!alive) return
        setStats(nextStats)
        setStorage(nextStorage)
      })
    run()
    const id = setInterval(run, RECHECK_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [m.networkReads, m.cacheReads, reloadToken])

  const clearStep = useTwoStep(() => {
    setBusy(true)
    void resetOfflineData()
      .then(() => notify.success('notif.offline.cleared'))
      .finally(() => {
        setBusy(false)
        setReloadToken((n) => n + 1)
      })
  })

  const tone: Tone = !online ? 'error' : staleSince !== null ? 'warn' : 'ok'
  const label: TranslationKey = !online
    ? 'status.app.offline'
    : staleSince !== null
      ? 'status.offline.stale'
      : 'status.app.online'

  const offlineTotal =
    m.offlineMs + (m.offlineSince !== null ? Math.max(0, now - m.offlineSince) : 0)
  const kinds = stats ? OFFLINE_KINDS.filter((k) => stats.byKind[k] > 0) : []
  const connDetail =
    online && conn
      ? [
          // Không hiện `effectiveType` ("4g"): đó là ước lượng của trình duyệt
          // theo tốc độ, gần như mạng nào cũng ra 4g nên không nói lên gì.
          conn.rtt !== null ? `${conn.rtt} ms` : null,
          conn.downlink !== null
            ? `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(conn.downlink)} Mbps`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : ''
  const hasSaved = Boolean(stats && stats.count > 0)

  return (
    <Card
      icon={HardDrive}
      title={t('status.offline')}
      tone={tone}
      label={t(label)}
      footer={
        // Đối xứng với thẻ Ứng dụng: con số bên trái (thay cho một dòng), nút bên phải.
        <>
          {storage && (
            <span
              className="text-xs text-slate-500"
              data-tooltip={t('status.offline.storageHint')}
            >
              {t('status.offline.storage')}{' '}
              <span className="text-slate-700 tabular-nums select-text">
                {t('status.offline.storageValue', {
                  used: formatBytes(storage.usage, lang),
                  quota: formatBytes(storage.quota, lang),
                })}
              </span>
            </span>
          )}
          {/* Bấm hai lần: xoá rồi thì offline không xem lại được cho tới khi
              mở lại lúc có mạng. */}
          {hasSaved && (
            <span className="ml-auto">
              <FooterButton
                icon={Trash2}
                tone={clearStep.armed ? 'armed' : 'danger'}
                onClick={clearStep.press}
                disabled={busy}
              >
                {clearStep.armed ? t('status.offline.clearAgain') : t('status.offline.clear')}
              </FooterButton>
            </span>
          )}
        </>
      }
    >
      <dl className="divide-y divide-slate-100">
        <Row
          label={t('status.app.network')}
          hint={conn?.saveData ? t('status.offline.saveData') : undefined}
        >
          <Indicator tone={online ? 'ok' : 'error'}>
            {online ? t('status.app.online') : t('status.app.offline')}
            {connDetail && (
              <span className="text-slate-500 tabular-nums"> · {connDetail}</span>
            )}
          </Indicator>
        </Row>
      </dl>

      {/* Số đếm của phiên: một dải ô số thay cho bốn dòng. */}
      <div className="border-t border-slate-100">
        <p className="px-4 pt-2.5 text-xs text-slate-400">{t('status.offline.session')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4">
          <Stat label={t('status.offline.stat.server')} value={m.networkReads} />
          <Stat
            label={t('status.offline.stat.cache')}
            value={m.cacheReads}
            sub={
              m.slowFallbacks > 0
                ? t('status.offline.stat.slow', { count: m.slowFallbacks })
                : undefined
            }
          />
          <Stat
            label={t('status.offline.stat.offline')}
            value={m.offlineCount}
            sub={
              m.offlineCount > 0
                ? t('status.offline.stat.offlineTotal', {
                    time: formatDistanceStrict(0, offlineTotal, { locale: dateLocale }),
                  })
                : undefined
            }
          />
          <Stat
            label={t('status.offline.stat.blocked')}
            value={m.blockedWrites}
            warn={m.blockedWrites > 0}
          />
        </div>
      </div>

      <dl className="divide-y divide-slate-100 border-t border-slate-100">
        <Row
          nowrap
          label={t('status.app.saved')}
          hint={
            stats && kinds.length > 0
              ? kinds.map((k) => `${t(KIND_LABEL[k])} ${stats.byKind[k]}`).join(' · ')
              : t('status.app.savedHint')
          }
        >
          {stats === undefined ? (
            <Pending />
          ) : stats === null ? (
            t('status.app.noStorage')
          ) : stats.count === 0 || stats.lastSavedAt === null ? (
            t('status.app.savedNone')
          ) : (
            <span className="text-right tabular-nums">
              <span className="block">
                {t('status.offline.savedValue', {
                  count: stats.count,
                  size: formatBytes(stats.bytes, lang),
                })}
              </span>
              <span className="block text-xs text-slate-500">
                {t('status.offline.savedLast', { time: ago(stats.lastSavedAt) })}
              </span>
            </span>
          )}
        </Row>
      </dl>
    </Card>
  )
}

function Card({
  icon: Icon,
  title,
  tone,
  label,
  footer,
  children,
}: {
  icon: typeof Network
  title: string
  tone: Tone
  label: string
  /**
   * Chân thẻ (nút, mốc build). Luôn dính đáy: lưới kéo hai thẻ cạnh nhau
   * cao bằng nhau, phần dư nằm trên chân thẻ thay vì thành khoảng trống
   * cuối thẻ.
   */
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
      <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <Icon className="h-4 w-4 text-slate-400" />
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <span
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${PILL[tone]}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />
          {label}
        </span>
      </header>
      {children}
      {footer && (
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
          {footer}
        </div>
      )}
    </section>
  )
}

function Row({
  label,
  hint,
  nowrap = false,
  children,
}: {
  label: string
  hint?: string
  /**
   * Giá trị ngắn ("749 KB", "3 phút trước") giữ trên một dòng; chỗ hẹp thì
   * chú thích bên trái xuống dòng thay vì bẻ đôi giá trị.
   */
  nowrap?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-2.5 text-sm">
      <dt className={nowrap ? 'min-w-0' : 'shrink-0'}>
        <span className="block text-slate-600">{label}</span>
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </dt>
      <dd
        className={`ml-auto flex justify-end text-slate-800 select-text ${
          nowrap ? 'shrink-0 whitespace-nowrap' : 'min-w-0'
        }`}
      >
        {children}
      </dd>
    </div>
  )
}

function Note({ bordered, children }: { bordered?: boolean; children: ReactNode }) {
  return (
    <p
      className={`px-4 py-3 text-sm text-slate-600 ${
        bordered ? 'border-t border-slate-100' : ''
      }`}
    >
      {children}
    </p>
  )
}

function Indicator({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

function Probe({ probe }: { probe: ProbeResult | undefined }) {
  if (!probe) return <Pending />
  return (
    <Indicator tone={probeTone(probe)}>
      {probe.ok ? (
        <span className="tabular-nums">{probe.ms} ms</span>
      ) : (
        <span className="text-rose-700" data-tooltip={probe.error ?? undefined}>
          {probe.error}
        </span>
      )}
    </Indicator>
  )
}

function NotServed({ name }: { name: string }) {
  const { t } = useI18n()
  return (
    <Indicator tone="idle">
      <span className="text-slate-500">{t('status.provider.notServed', { name })}</span>
    </Indicator>
  )
}

/** Hai dòng trạng thái chung lấy từ trang Statuspage của nhà cung cấp. */
function SummaryRows({
  name,
  host,
  loaded,
  summary,
  error,
}: {
  name: string
  host: string
  loaded: boolean
  summary: StatuspageSummary | null
  error: string | null
}) {
  const { t } = useI18n()
  return (
    <>
      <Row label={t('status.provider.network', { name })}>
        {!loaded ? (
          <Pending />
        ) : summary ? (
          <Indicator tone={summaryTone(summary)}>{summary.description}</Indicator>
        ) : (
          <span className="text-rose-700" data-tooltip={error ?? undefined}>
            {t('status.provider.unreachable', { host })}
          </span>
        )}
      </Row>
      {summary && (
        <Row label={t('status.provider.incidents')}>
          {summary.incidents.length === 0 ? (
            t('status.provider.noIncidents')
          ) : (
            <span className="tabular-nums">{summary.incidents.length}</span>
          )}
        </Row>
      )}
    </>
  )
}

function IncidentList({ summary }: { summary: StatuspageSummary | null }) {
  const { t } = useI18n()
  if (!summary || summary.incidents.length === 0) return null
  const extra = summary.incidents.length - MAX_INCIDENTS
  return (
    <ul className="space-y-1 border-t border-slate-100 px-4 py-2.5">
      {summary.incidents.slice(0, MAX_INCIDENTS).map((incident) => (
        <li key={incident.url} className="text-xs">
          <a
            href={incident.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 text-slate-600 transition hover:text-slate-900"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                DOT[
                  incident.impact === 'major' || incident.impact === 'critical'
                    ? 'error'
                    : 'warn'
                ]
              }`}
            />
            <span className="truncate">{incident.name}</span>
            <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
          </a>
        </li>
      ))}
      {extra > 0 && (
        <li className="text-xs text-slate-500">
          {t('timeline.moreCount', { count: extra })}
        </li>
      )}
    </ul>
  )
}

function Pending() {
  return <span className="h-3 w-16 animate-pulse rounded bg-slate-100" />
}
