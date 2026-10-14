import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { format } from 'date-fns'
import { useServerClock, type ClockSource } from '../data/useServerClock'
import { useI18n } from '../i18n/I18nContext'
import { useExitAnimation } from './useExitAnimation'

/** Rê chuột qua nhanh thì không bật — giống tooltip của hệ điều hành. */
const OPEN_DELAY_MS = 250
/** Dừng chuột giữa đường (trong vùng tam giác) quá ngần này thì đóng. */
const REST_MS = 300

interface Point {
  x: number
  y: number
}

/** Điểm `p` có nằm trong (hoặc trên cạnh) tam giác abc không. */
function inTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const cross = (u: Point, v: Point, w: Point) =>
    (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x)
  const d1 = cross(a, b, p)
  const d2 = cross(b, c, p)
  const d3 = cross(c, a, p)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

/**
 * Đồng hồ nhỏ trên header PC, kiểu đồng hồ taskbar Windows: giờ ở trên, ngày
 * ở dưới. Chạy theo giờ máy chủ — đồng hồ mà luật điểm danh dùng.
 *
 * Tooltip tự vẽ thay cho `title`: `title` hiện chậm, không có hiệu ứng, và
 * đứng yên trong khi đồng hồ vẫn chạy.
 */
export function HeaderClock() {
  const { now, source } = useServerClock()
  const [open, setOpen] = useState(false)
  const openTimer = useRef(0)
  const stopTracking = useRef<(() => void) | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const tooltipId = useId()

  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current)
      stopTracking.current?.()
    },
    [],
  )

  function untrack() {
    stopTracking.current?.()
    stopTracking.current = null
  }
  function show(delay: number) {
    untrack()
    window.clearTimeout(openTimer.current)
    if (open) return
    openTimer.current = window.setTimeout(() => setOpen(true), delay)
  }
  function hide() {
    untrack()
    window.clearTimeout(openTimer.current)
    setOpen(false)
  }

  /**
   * Quy luật tam giác: rời đồng hồ để đi xuống tooltip thì chuột phải băng
   * qua khe giữa hai cái. Còn đi trong tam giác nối từ điểm rời tới hai góc
   * trên của tooltip là đang hướng về nó — giữ mở. Lệch ra ngoài, hay dừng
   * lại giữa đường, thì đóng. Vào tới tooltip là `mouseenter` của khung ngoài
   * (tooltip là con của nó) huỷ việc theo dõi.
   */
  function onLeave(e: React.MouseEvent) {
    const panel = panelRef.current
    if (!open || !panel) {
      hide()
      return
    }
    const apex = { x: e.clientX, y: e.clientY }
    const r = panel.getBoundingClientRect()
    const clock = e.currentTarget.getBoundingClientRect()
    const left = { x: r.left, y: r.top }
    const right = { x: r.right, y: r.top }

    let rest = window.setTimeout(hide, REST_MS)
    const onMove = (ev: PointerEvent) => {
      const p = { x: ev.clientX, y: ev.clientY }
      const inPanel =
        p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom
      // Cột của đồng hồ cùng khe bên dưới: rời tooltip đi ngược lên thì tam
      // giác bẹp thành một đường, phải có vùng này mới không chớp tắt.
      const inBridge =
        p.x >= clock.left &&
        p.x <= clock.right &&
        p.y >= clock.top &&
        p.y <= r.top
      if (inPanel || inBridge || inTriangle(p, apex, left, right)) {
        window.clearTimeout(rest)
        rest = window.setTimeout(hide, REST_MS)
        return
      }
      hide()
    }
    document.addEventListener('pointermove', onMove)
    untrack()
    stopTracking.current = () => {
      document.removeEventListener('pointermove', onMove)
      window.clearTimeout(rest)
    }
  }

  return (
    <div
      tabIndex={0}
      aria-describedby={open ? tooltipId : undefined}
      onMouseEnter={() => show(OPEN_DELAY_MS)}
      onMouseLeave={onLeave}
      onFocus={() => show(0)}
      onBlur={(e) => {
        // Tab vào nút trong tooltip vẫn là ở trong đồng hồ.
        if (!e.currentTarget.contains(e.relatedTarget)) hide()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') hide()
      }}
      className="relative hidden flex-col items-end rounded-md px-1.5 py-0.5 leading-tight tabular-nums outline-none select-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500/40 sm:flex"
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

      {open && (
        <ClockTooltip
          id={tooltipId}
          panelRef={panelRef}
          now={now}
          source={source}
        />
      )}
    </div>
  )
}

/**
 * Tách riêng để có hiệu ứng: mount là xổ ra (`tooltip-panel` trong
 * index.css), gỡ thì useExitAnimation để lại bản sao mờ dần.
 */
function ClockTooltip({
  id,
  panelRef,
  now,
  source,
}: {
  id: string
  panelRef: RefObject<HTMLDivElement | null>
  now: Date
  source: ClockSource
}) {
  const { t, dateLocale } = useI18n()
  useExitAnimation(panelRef, 160, { freezePosition: true })

  return (
    <div
      ref={panelRef}
      id={id}
      role="tooltip"
      // nowrap: lúc đóng, bản sao của useExitAnimation bị ghim bề rộng bằng
      // offsetWidth (làm tròn xuống) — hụt một phần pixel là dòng ngày xuống hàng.
      className="tooltip-panel absolute top-full right-0 z-50 mt-2 w-max cursor-default rounded-xl bg-white px-3.5 py-2.5 text-left whitespace-nowrap shadow-lg ring-1 ring-slate-900/10"
    >
      <p className="text-xl font-semibold text-slate-900 tabular-nums">
        {format(now, 'HH:mm:ss')}
      </p>
      <p className="text-sm text-slate-600 first-letter:uppercase">
        {format(now, 'PPPP', { locale: dateLocale })}
      </p>
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
