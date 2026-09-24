import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { format, formatDistanceStrict } from 'date-fns'
import {
  Activity,
  Cloud,
  Database,
  ExternalLink,
  Globe,
  KeyRound,
  RotateCw,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { IS_MOCK_BACKEND } from '../data'
import { useI18n } from '../i18n/I18nContext'
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
 * Không đi qua họ (localhost) thì mới lấy trạng thái chung.
 */
function providerBadge(
  loaded: boolean,
  servedMs: number | null,
  summary: StatuspageSummary | null,
): { tone: Tone; label: TranslationKey } {
  if (!loaded) return { tone: 'idle', label: 'status.checking' }
  if (servedMs !== null) {
    const tone = msTone(servedMs)
    return { tone, label: OVERALL_LABEL[tone] }
  }
  if (!summary) return { tone: 'idle', label: 'status.unknown' }
  const tone = summaryTone(summary)
  return {
    tone,
    label:
      tone === 'ok'
        ? 'status.ok'
        : tone === 'error'
          ? 'status.provider.major'
          : summary.indicator === 'maintenance'
            ? 'status.provider.maintenance'
            : 'status.provider.minor',
  }
}

export function StatusPage() {
  const { t, dateLocale } = useI18n()
  const { user } = useAuth()
  const [status, setStatus] = useState<SupabaseStatus | null>(null)
  const [cf, setCf] = useState<CloudflareStatus | null>(null)
  const [nf, setNf] = useState<NetlifyStatus | null>(null)
  // Lần đầu kiểm tra ngay khi mở trang nên bắt đầu ở trạng thái "đang kiểm tra".
  const [checking, setChecking] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  const probe = useCallback(async () => {
    try {
      await Promise.all([
        IS_MOCK_BACKEND ? null : probeSupabase().then(setStatus),
        probeCloudflare().then(setCf),
        probeNetlify().then(setNf),
      ])
    } finally {
      setChecking(false)
    }
  }, [])

  // Các lần tự kiểm tra định kỳ chạy ngầm; chỉ bấm tay mới hiện vòng quay.
  useEffect(() => {
    void probe()
    const id = setInterval(() => void probe(), RECHECK_MS)
    return () => clearInterval(id)
  }, [probe])

  function recheck() {
    setChecking(true)
    void probe()
  }

  // Đồng hồ cho "x giây trước" và đếm ngược hạn token.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const ago = (at: number) =>
    formatDistanceStrict(at, now, { addSuffix: true, locale: dateLocale })

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

  const cfBadge = providerBadge(cf !== null, cf?.edge?.ms ?? null, cf?.global ?? null)
  const nfBadge = providerBadge(nf !== null, nf?.origin?.ms ?? null, nf?.global ?? null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Activity className="h-5 w-5 shrink-0 text-slate-400" />
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

      <div className="grid gap-4 lg:grid-cols-2">
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
              <Row label={t('status.lastChecked')} hint={t('status.autoRecheck')}>
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
    </div>
  )
}

function Card({
  icon: Icon,
  title,
  tone,
  label,
  children,
}: {
  icon: typeof Activity
  title: string
  tone: Tone
  label: string
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
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
    </section>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-2.5 text-sm">
      <dt className="shrink-0">
        <span className="block text-slate-600">{label}</span>
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </dt>
      <dd className="ml-auto flex min-w-0 justify-end text-slate-800">{children}</dd>
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
        <span className="text-rose-700" title={probe.error ?? undefined}>
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
          <span className="text-rose-700" title={error ?? undefined}>
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
