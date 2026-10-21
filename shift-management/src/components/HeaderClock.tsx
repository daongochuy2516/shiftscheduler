import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { useServerClock, type ClockSource } from '../data/useServerClock'
import { useI18n } from '../i18n/I18nContext'
import { toDateKey } from '../lib/time'
import { dateParam } from '../lib/urlParams'
import { Calendar } from './Calendar'
import { useExitAnimation } from './useExitAnimation'

/**
 * Đồng hồ nhỏ trên header PC, kiểu đồng hồ taskbar Windows: giờ ở trên, ngày
 * ở dưới. Chạy theo giờ máy chủ — đồng hồ mà luật điểm danh dùng.
 *
 * Bấm để mở bảng giờ + lịch tháng, bấm lần nữa / bấm ra ngoài / Esc để đóng.
 * Rê chuột không bật gì, và con trỏ giữ mũi tên như trên taskbar thay vì bàn
 * tay của các nút khác.
 */
export function HeaderClock() {
  const { now, source } = useServerClock()
  const { dateLocale } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  /**
   * Ngày đang xem (Lịch, Tổng kết đặt `?date=`), để mở lại bảng là thấy ngày
   * vừa bấm được tô. Trang không có ngày, hay đang xem hôm nay: tô hôm nay.
   */
  const selected = dateParam(params.get('date')) ?? toDateKey(now)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative hidden sm:block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={`flex cursor-default flex-col items-end rounded-md px-1.5 py-0.5 leading-tight tabular-nums outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
          open ? 'bg-slate-100' : ''
        }`}
      >
        <time
          dateTime={format(now, "yyyy-MM-dd'T'HH:mm:ss")}
          className="flex items-center gap-1 text-xs font-medium whitespace-nowrap text-slate-700"
        >
          {/* Chưa lấy được giờ máy chủ: chấm vàng để không ai tưởng là đúng. */}
          {source === 'device' && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          )}
          {format(now, 'HH:mm:ss')}
        </time>
        <span className="text-[11px] text-slate-500">
          {format(now, 'dd/MM/yyyy')}
        </span>
      </button>

      {open && (
        <ClockPanel
          id={panelId}
          panelRef={panelRef}
          label={format(now, 'PPPP', { locale: dateLocale })}
          now={now}
          source={source}
          selected={selected}
          onPickDay={(key) => {
            setOpen(false)
            navigate(key === toDateKey(new Date()) ? '/' : `/?date=${key}`)
          }}
        />
      )}
    </div>
  )
}

/**
 * Tách riêng để có hiệu ứng: mount là xổ ra (`tooltip-panel` trong
 * index.css), gỡ thì useExitAnimation để lại bản sao mờ dần.
 *
 * Như bảng đồng hồ của Windows: giờ to, ngày đầy đủ, rồi lịch tháng để xem
 * nhanh thứ của một ngày. Bấm một ngày là mở trang Lịch ngày đó — để ô ngày
 * không bấm vô ích.
 */
function ClockPanel({
  id,
  panelRef,
  label,
  now,
  source,
  selected,
  onPickDay,
}: {
  id: string
  panelRef: RefObject<HTMLDivElement | null>
  label: string
  now: Date
  source: ClockSource
  /** `yyyy-MM-dd` được tô trên lịch; lịch cũng mở đúng tháng của ngày này. */
  selected: string
  onPickDay: (date: string) => void
}) {
  const { t } = useI18n()
  useExitAnimation(panelRef, 160, { freezePosition: true })

  return (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={label}
      // nowrap: lúc đóng, bản sao của useExitAnimation bị ghim bề rộng bằng
      // offsetWidth (làm tròn xuống) — hụt một phần pixel là dòng ngày xuống hàng.
      className="tooltip-panel absolute top-full right-0 z-50 mt-2 w-max cursor-default rounded-xl bg-white px-3.5 py-2.5 text-left whitespace-nowrap shadow-lg ring-1 ring-slate-900/10"
    >
      <p className="text-xl font-semibold text-slate-900 tabular-nums">
        {format(now, 'HH:mm:ss')}
      </p>
      <p className="text-sm text-slate-600 first-letter:uppercase">{label}</p>
      {/* Ô tô đặc là ngày đang xem; hôm nay (nếu khác) có viền. */}
      <div className="mt-2.5 border-t border-slate-100 pt-2">
        <Calendar value={selected} onChange={onPickDay} />
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 border-t border-slate-100 pt-1.5 text-xs text-slate-500">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            source === 'server' ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
        />
        {t(source === 'server' ? 'clock.server' : 'clock.device')}
      </p>
    </div>
  )
}
