import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, GraduationCap, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { TOURS, stepsFor, type TourId, type TourStep } from './tours'

interface TourContextValue {
  start: (id: TourId) => void
}

const TourContext = createContext<TourContextValue | null>(null)

interface Running {
  id: TourId
  steps: TourStep[]
  index: number
}

/** Hết ngần này mà chưa thấy phần tử thì thôi chờ, hiện thẻ ở giữa màn hình. */
const FIND_TIMEOUT_MS = 2000
/** Khoảng nghỉ giữa hai lần bấm hộ (mở menu, mở ca…) để giao diện kịp hiện ra. */
const ENSURE_GAP_MS = 450

/**
 * Wizard hướng dẫn "cầm tay chỉ việc": chạy một bài trong tours.ts — chuyển
 * trang, bấm hộ những thứ cần mở, làm tối màn hình trừ đúng phần tử cần chỉ,
 * và hiện thẻ giải thích cạnh nó.
 *
 * Kèm lời mời xem bài "Làm quen giao diện" ở lần đăng nhập đầu tiên (mỗi tài
 * khoản một lần, nhớ trong localStorage).
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState<Running | null>(null)
  const { user } = useAuth()
  const welcomeKey = user ? `scheduler.help.welcomed.${user.id}` : null
  const [welcomed, setWelcomed] = useState(() => {
    try {
      return !welcomeKey || localStorage.getItem(welcomeKey) === '1'
    } catch {
      return true
    }
  })

  const markWelcomed = useCallback(() => {
    setWelcomed(true)
    try {
      if (welcomeKey) localStorage.setItem(welcomeKey, '1')
    } catch {
      // Không lưu được thì lần sau hỏi lại, không sao.
    }
  }, [welcomeKey])

  const start = useCallback(
    (id: TourId) => {
      // Bước dành riêng PC / điện thoại: lọc một lần lúc bắt đầu.
      const steps = stepsFor(id)
      markWelcomed()
      setRunning({ id, steps, index: 0 })
    },
    [markWelcomed],
  )

  const value = useMemo(() => ({ start }), [start])

  return (
    <TourContext.Provider value={value}>
      {children}
      {running && (
        <TourStepView
          // key theo bước: mỗi bước có state "đang tìm" riêng, bắt đầu từ đầu.
          key={`${running.id}-${running.index}`}
          tourId={running.id}
          step={running.steps[running.index]}
          index={running.index}
          count={running.steps.length}
          onBack={() =>
            setRunning((r) => (r && r.index > 0 ? { ...r, index: r.index - 1 } : r))
          }
          onNext={() =>
            setRunning((r) =>
              r && r.index < r.steps.length - 1 ? { ...r, index: r.index + 1 } : null,
            )
          }
          onClose={() => setRunning(null)}
        />
      )}
      {!running && !welcomed && (
        <WelcomeCard onStart={() => start('basics')} onDismiss={markWelcomed} />
      )}
    </TourContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used inside <TourProvider>')
  return ctx
}

/** Phần tử đầu tiên đang thật sự hiện trên trang, theo thứ tự ưu tiên. */
function findVisible(ids: string[]): HTMLElement | null {
  for (const id of ids) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)) {
      // Bỏ qua bản sao đang chạy hiệu ứng đóng (useExitAnimation).
      if (el.closest('.is-leaving')) continue
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) return el
    }
  }
  return null
}

interface Box {
  top: number
  left: number
  width: number
  height: number
}

function TourStepView({
  tourId,
  step,
  index,
  count,
  onBack,
  onNext,
  onClose,
}: {
  tourId: TourId
  step: TourStep
  index: number
  count: number
  onBack: () => void
  onNext: () => void
  onClose: () => void
}) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [box, setBox] = useState<Box | null>(null)
  const [missing, setMissing] = useState(false)
  const text = step.text[lang]
  const last = index === count - 1

  const here = location.pathname + location.search
  const needsRoute = step.route !== undefined && location.pathname !== step.route.split('?')[0]

  useEffect(() => {
    if (needsRoute && step.route && here !== step.route) navigate(step.route)
  }, [needsRoute, step.route, here, navigate])

  // Tìm phần tử (bấm hộ nếu cần), cuộn tới, rồi bám theo vị trí của nó mỗi
  // khung hình — trang cuộn, form mở, cửa sổ đổi cỡ thì khung sáng đi theo.
  useEffect(() => {
    if (!step.targets?.length) return
    const targets = step.targets
    const began = performance.now()
    let lastEnsure = 0
    let ensureClicks = 0
    let scrolled = false
    let raf = 0
    let prev = ''

    const tick = () => {
      const now = performance.now()
      const el = findVisible(targets)
      if (el) {
        if (!scrolled) {
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
          scrolled = true
        }
        const r = el.getBoundingClientRect()
        const key = `${Math.round(r.top)}|${Math.round(r.left)}|${Math.round(r.width)}|${Math.round(r.height)}`
        if (key !== prev) {
          prev = key
          setBox({ top: r.top, left: r.left, width: r.width, height: r.height })
          setMissing(false)
        }
      } else {
        if (prev !== 'missing' && prev !== '') {
          prev = ''
          setBox(null)
        }
        // Bấm hộ thứ "sâu" nhất đang có: đã mở form rồi thì chỉ bấm chế độ
        // Đơn giản, chưa mở thì mới bấm vào khối ca.
        if (step.ensure && ensureClicks < 4 && now - lastEnsure > ENSURE_GAP_MS) {
          for (let i = step.ensure.length - 1; i >= 0; i--) {
            const opener = findVisible([step.ensure[i]])
            if (opener) {
              opener.click()
              lastEnsure = now
              ensureClicks++
              break
            }
          }
        }
        if (now - began > FIND_TIMEOUT_MS && prev !== 'missing') {
          prev = 'missing'
          setMissing(true)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [step])

  // Phím: → / Enter tiếp, ← lùi, Esc thoát. Bắt ở pha capture và chặn lại,
  // để Esc không đóng luôn hộp thoại đang được chỉ vào.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') onNext()
      else if (e.key === 'ArrowLeft') onBack()
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onBack, onNext, onClose])

  const pad = 6
  const vw = window.innerWidth
  const vh = window.innerHeight
  const mobile = vw < 640
  const cardWidth = Math.min(360, vw - 24)
  const hasTarget = box !== null

  // Vị trí thẻ: dưới phần tử nếu đủ chỗ, không thì phía trên. Không có phần
  // tử (bước giới thiệu, hay không tìm thấy) thì ở giữa màn hình.
  let cardStyle: CSSProperties
  if (!hasTarget) {
    cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: cardWidth }
  } else if (mobile) {
    const centerY = box.top + box.height / 2
    cardStyle =
      centerY > vh / 2
        ? { top: 12, left: 12, right: 12 }
        : { bottom: 12, left: 12, right: 12 }
  } else {
    const left = Math.min(
      Math.max(12, box.left + box.width / 2 - cardWidth / 2),
      vw - cardWidth - 12,
    )
    const below = box.top + box.height + pad + 12
    cardStyle =
      below + 230 < vh
        ? { top: below, left, width: cardWidth }
        : { bottom: vh - box.top + pad + 12, left, width: cardWidth }
  }

  return (
    <div
      data-tour-overlay
      className="fixed inset-0 z-[70]"
      // Chặn bấm xuống trang trong lúc hướng dẫn: wizard tự bấm hộ những gì
      // cần mở, người dùng chỉ cần Tiếp / Quay lại.
      onMouseDown={(e) => e.preventDefault()}
    >
      {hasTarget ? (
        <div
          aria-hidden="true"
          className="tour-spotlight pointer-events-none absolute rounded-xl"
          style={{
            top: box.top - pad,
            left: box.left - pad,
            width: box.width + pad * 2,
            height: box.height + pad * 2,
          }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-slate-950/60" />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label={TOURS[tourId].title[lang]}
        className="tour-card absolute rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-900/10"
        style={cardStyle}
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold text-indigo-600">
            {TOURS[tourId].title[lang]} · {index + 1}/{count}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('tour.skip')}
            title={t('tour.skip')}
            className="-m-1.5 ml-auto flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 className="text-base font-semibold text-slate-900">{text.title}</h3>
        <p className="mt-1 text-sm text-pretty text-slate-600">
          {missing && text.missing ? text.missing : text.body}
        </p>

        <div className="mt-3 flex items-center gap-1">
          {Array.from({ length: count }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-4 bg-indigo-600' : 'w-1.5 bg-slate-300'
              }`}
            />
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            {index > 0 && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-10 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 sm:min-h-0 sm:py-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('tour.back')}
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={onNext}
              className="inline-flex min-h-10 items-center gap-1 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-500 sm:min-h-0 sm:py-1.5"
            >
              {last ? (
                <>
                  <Check className="h-4 w-4" />
                  {t('tour.done')}
                </>
              ) : (
                <>
                  {t('tour.next')}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Lời mời ở lần đăng nhập đầu: góc dưới trái (mobile: ngay trên thanh dưới). */
function WelcomeCard({
  onStart,
  onDismiss,
}: {
  onStart: () => void
  onDismiss: () => void
}) {
  const { t } = useI18n()
  return (
    <div
      role="dialog"
      aria-label={t('tour.welcomeTitle')}
      className="tour-card fixed inset-x-4 bottom-[calc(var(--bottom-nav-h)+var(--safe-b)+5.5rem)] z-[45] rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-900/10 sm:inset-x-auto sm:bottom-5 sm:left-5 sm:w-80"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
          <GraduationCap className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{t('tour.welcomeTitle')}</p>
          <p className="mt-0.5 text-sm text-slate-600">{t('tour.welcomeBody')}</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-10 rounded-md px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 sm:min-h-0 sm:py-1.5"
        >
          {t('tour.later')}
        </button>
        <button
          type="button"
          onClick={onStart}
          className="min-h-10 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-500 sm:min-h-0 sm:py-1.5"
        >
          {t('tour.start')}
        </button>
      </div>
    </div>
  )
}
