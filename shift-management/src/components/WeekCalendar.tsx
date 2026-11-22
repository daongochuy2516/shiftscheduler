import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import { CalendarOff, Clock3 } from 'lucide-react'
import type { UUID } from '../types'
import { useI18n } from '../i18n/I18nContext'
import { useSchedule } from '../data/ScheduleContext'
import { personColor } from '../lib/colors'
import { formatRange, normalizeTime, toDateKey } from '../lib/time'
import { locationLabels, locationsById, sortLocationIds } from '../lib/locations'
import { chipBlockHeight, chipLines, pickLocationFit } from '../lib/locationFit'
import { textWidth } from '../lib/textWidth'
import {
  countOutsideRange,
  layoutDay,
  type HourRange,
  type LaidOutItem,
} from '../lib/weekLayout'
import { LocationChip, type ChipVariant } from './LocationChip'

/** Một khối trên lịch tuần: một lượt phân công (hoặc một lượt đã ghi nhận). */
export interface WeekCalendarItem {
  /** Khoá React, duy nhất trong cả tuần (ví dụ id lượt phân công). */
  key: string
  /** yyyy-MM-dd theo giờ máy. */
  date: string
  /** "HH:mm" (nhận cả "HH:mm:ss"). */
  start: string
  end: string
  /** Màu khối = màu ảnh đại diện của người này (`personColor`). */
  personId: UUID
  personName: string
  /** Tên ca — dòng thứ ba, chỉ khi khối đủ cao; luôn có trong tooltip. */
  title: string
  locationIds: UUID[]
  /** Chờ xác nhận: viền nét đứt + đồng hồ. */
  pending?: boolean
  /** Đè tooltip mặc định (tên ca · người · giờ · nơi trực · chờ xác nhận). */
  tooltip?: string
}

export interface WeekCalendarProps<T extends WeekCalendarItem> {
  /** Các ngày hiển thị, theo thứ tự cột (thường 7 ngày từ thứ Hai). */
  days: Date[]
  /** Khối của các ngày trên; khối có `date` ngoài `days` bị bỏ qua. */
  items: T[]
  /** Khung giờ của trục dọc. */
  range: HourRange
  /** Bấm một khối. Không truyền = chỉ xem: khối là `div`, không bấm được. */
  onSelectItem?: (item: T) => void
  /** Bấm tiêu đề ngày (ví dụ mở chế độ Ngày). Không truyền = không bấm được. */
  onSelectDay?: (day: Date) => void
  /** Dòng nhỏ dưới số ngày ở tiêu đề cột (ví dụ tổng giờ của ngày). */
  dayCaption?: (day: Date) => ReactNode
  /** Hiện dưới tiêu đề khi tuần không có khối nào. */
  emptyMessage?: ReactNode
  /**
   * Hiện dòng nhắc vàng khi có khối nằm trọn ngoài khung giờ
   * (`timeline.clipped`, gợi ý chọn "Cả ngày"). Mặc định: có.
   */
  showClippedNote?: boolean
}

const HOUR_PX = 48
const AXIS_W = 56
/** Khoảng trống trên / dưới vùng giờ để nhãn giờ ở hai mép không bị cắt. */
const PAD_Y = 8
/** Lề trái / phải trong cột ngày, và khe giữa hai khối cạnh nhau. */
const INSET_LEFT = 2
const INSET_RIGHT = 4
const LANE_GAP = 2
/** Khe dọc giữa hai khối nối tiếp nhau. */
const BLOCK_VGAP = 1
/**
 * Khối ngắn (15 phút) vẫn đủ cao cho một dòng chữ: 22 − BLOCK_CHROME_Y (6)
 * = 16px = `leading-4` của dòng đơn.
 */
const MIN_BLOCK_PX = 22
const MIN_BLOCK_MINUTES = (MIN_BLOCK_PX / HOUR_PX) * 60

// Khớp class của khối bên dưới: `px-1.5` + viền 1px hai bên; `py-0.5` +
// viền 1px trên dưới; đồng hồ `h-2.5 w-2.5` + `gap-1`.
const BLOCK_CHROME_X = 12 + 2
const BLOCK_CHROME_Y = 4 + 2
const CLOCK_PX = 10
const GAP_PX = 4
// Chiều cao dòng: tên `leading-4`, giờ và tên ca `leading-[14px]`.
const NAME_LINE = 16
const SMALL_LINE = 14
/** `mt-0.5` phía trên khối nhãn xếp dòng riêng. */
const STACK_GAP = 2

/** Bề rộng đoán trước khi đo được cột thật. */
const DEFAULT_COL_PX = 120

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

/**
 * Lịch tuần kiểu Google Calendar (chỉ desktop): mỗi ngày một cột, trục giờ
 * dọc bên trái, mỗi lượt là một khối đặt theo giờ của chính nó, màu theo
 * người. Khối chồng giờ trong một ngày nằm cạnh nhau (`layoutDay`).
 * Cao cố định `HOUR_PX` mỗi giờ, cuộn theo trang — không cuộn riêng.
 */
export function WeekCalendar<T extends WeekCalendarItem>({
  days,
  items,
  range,
  onSelectItem,
  onSelectDay,
  dayCaption,
  emptyMessage,
  showClippedNote = true,
}: WeekCalendarProps<T>) {
  const { t, dateLocale } = useI18n()
  const { locations } = useSchedule()
  const locationById = useMemo(() => locationsById(locations), [locations])

  const rangeStart = range.startHour * 60
  const hours = Math.max(1, range.endHour - range.startHour)
  const bodyHeight = hours * HOUR_PX + PAD_Y * 2
  const gridTemplate = `${AXIS_W}px repeat(${days.length}, minmax(0, 1fr))`

  // Cột ngày co giãn nên phải đo lúc chạy để biết nhãn nơi trực vừa tới đâu.
  // Callback ref + ResizeObserver: setState nằm trong callback của observer,
  // không chạy đồng bộ trong effect (như WeekGrid).
  const [dayColumn, setDayColumn] = useState<HTMLElement | null>(null)
  const [colWidth, setColWidth] = useState(DEFAULT_COL_PX)
  useEffect(() => {
    if (!dayColumn || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      // clientWidth = trong viền: khối `absolute` tính % theo phần đó, còn
      // getBoundingClientRect gồm cả `border-l` 1px của cột.
      setColWidth(dayColumn.clientWidth)
    })
    observer.observe(dayColumn)
    return () => observer.disconnect()
  }, [dayColumn])

  // Vạch "bây giờ" và cột hôm nay, làm mới mỗi phút (như Timeline) — qua
  // nửa đêm thì cột hôm nay tự chuyển.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  const todayKey = toDateKey(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const showNow =
    nowMinutes >= rangeStart && nowMinutes <= range.endHour * 60

  const dayKeys = useMemo(() => days.map(toDateKey), [days])

  /** date key → khối đã xếp làn của ngày đó. */
  const laidOut = useMemo(() => {
    const byDay = new Map<string, T[]>()
    for (const key of dayKeys) byDay.set(key, [])
    for (const item of items) byDay.get(item.date)?.push(item)
    const result = new Map<string, LaidOutItem<T>[]>()
    for (const [key, list] of byDay) {
      result.set(key, layoutDay(list, range, MIN_BLOCK_MINUTES))
    }
    return result
  }, [dayKeys, items, range])

  const clippedCount = useMemo(() => {
    const shown = new Set(dayKeys)
    return countOutsideRange(
      items.filter((item) => shown.has(item.date)),
      range,
    )
  }, [dayKeys, items, range])

  const hasItems = useMemo(() => {
    const shown = new Set(dayKeys)
    return items.some((item) => shown.has(item.date))
  }, [dayKeys, items])

  /** "Fanpage, Discord" cho tooltip (tên đầy đủ khi nhãn bị thu gọn). */
  function locationText(ids: UUID[]): string {
    return ids.map((id) => locationById.get(id)?.name ?? t('loc.unknown')).join(', ')
  }

  function renderBlock(entry: LaidOutItem<T>) {
    const { item, startMin, endMin, lane, lanes, span } = entry
    const color = personColor(item.personId)
    const pending = item.pending === true
    const start = normalizeTime(item.start)
    const end = normalizeTime(item.end)
    const timeText = `${start}–${end}`
    const ids = sortLocationIds(item.locationIds, locationById)
    const where = locationText(ids)
    const tooltip =
      item.tooltip ??
      `${item.title} · ${item.personName} · ${formatRange(start, end)}${
        where ? ` · ${where}` : ''
      }${pending ? ` · ${t('status.pending')}` : ''}`

    // ---- vị trí ----
    const top = PAD_Y + ((startMin - rangeStart) / 60) * HOUR_PX
    const height = Math.max(
      MIN_BLOCK_PX,
      ((endMin - startMin) / 60) * HOUR_PX - BLOCK_VGAP,
    )
    const reachesRight = lane + span >= lanes
    const gap = reachesRight ? 0 : LANE_GAP
    const insets = INSET_LEFT + INSET_RIGHT
    const left = `calc(${INSET_LEFT}px + (100% - ${insets}px) * ${lane / lanes})`
    const width = `calc((100% - ${insets}px) * ${span / lanes} - ${gap}px)`
    const widthPx = ((colWidth - insets) * span) / lanes - gap

    // ---- nội dung theo chiều cao ----
    const innerH = height - BLOCK_CHROME_Y
    const twoRows = innerH >= NAME_LINE + SMALL_LINE
    const showTitle = innerH >= NAME_LINE + SMALL_LINE * 2
    const clockPx = pending ? CLOCK_PX + GAP_PX : 0
    const nameW = textWidth(item.personName, 11, 600)
    const timeW = textWidth(timeText, 10)
    // Như dòng thời gian: tên đủ → tên tắt → chấm màu, dòng giờ trước rồi
    // dòng tên người. Khối một dòng (tên + giờ) chỉ còn chỗ cuối dòng đó.
    const innerW = widthPx - BLOCK_CHROME_X
    const labels = locationLabels(ids, locationById, t('loc.unknown'))
    const inline = pickLocationFit({
      innerPx: innerW,
      titlePx: twoRows ? clockPx + nameW : clockPx + nameW + GAP_PX + timeW,
      timePx: twoRows ? timeW : Infinity,
      ...labels,
    })
    // Khối cao (ca dài) mà hẹp: nhãn xuống dòng riêng dưới dòng giờ, tự xuống
    // thêm dòng — giữ được tên đầy đủ thay vì thu thành tên tắt / chấm. Thứ
    // tự: đủ cùng dòng → đủ dòng riêng → tắt cùng dòng → tắt dòng riêng → chấm.
    // Đọc từ trên xuống: tên người, giờ, tên ca, rồi nhãn xếp riêng ở dưới
    // cùng. Không đủ cao cho cả tên ca lẫn nhãn đầy đủ thì bỏ tên ca (vẫn có
    // trong tooltip) chứ không thu nhãn.
    const roomBelow = twoRows ? innerH - NAME_LINE - SMALL_LINE - STACK_GAP : 0
    const stackFits = (list: readonly string[], withTitle: boolean) => {
      if (withTitle && !showTitle) return null
      const lines = ids.length > 0 ? chipLines(list, innerW) : null
      const room = roomBelow - (withTitle ? SMALL_LINE : 0)
      return lines !== null && chipBlockHeight(lines) <= room ? lines : null
    }
    type Fit = {
      row: 'title' | 'time' | 'stack'
      variant: ChipVariant
      /** Còn hiện dòng tên ca không. */
      title: boolean
    }
    const stacked = (variant: 'full' | 'short'): Fit | null => {
      const list = variant === 'full' ? labels.full : labels.short
      if (stackFits(list, true) !== null) return { row: 'stack', variant, title: true }
      if (stackFits(list, false) !== null) return { row: 'stack', variant, title: false }
      return null
    }
    let fit: Fit | null = null
    if (inline?.variant === 'full') {
      fit = { ...inline, title: showTitle }
    } else {
      fit =
        stacked('full') ??
        (inline?.variant === 'short' ? { ...inline, title: showTitle } : null) ??
        stacked('short') ??
        (inline ? { ...inline, title: showTitle } : null)
    }
    const chipList = (variant: ChipVariant) =>
      ids.map((id) => (
        <LocationChip
          key={id}
          location={locationById.get(id) ?? null}
          size="xs"
          variant={variant}
        />
      ))
    const chips = fit && fit.row !== 'stack' && (
      <span className="flex shrink-0 items-center gap-1">{chipList(fit.variant)}</span>
    )
    const titleFits = fit ? fit.title : showTitle

    const content = twoRows ? (
      <>
        {/* shrink-0: lỡ đo canvas lệch so với DOM thì phần dưới cùng bị cắt
            (overflow-hidden), không bóp dẹt các dòng chữ phía trên. */}
        <span className="flex min-w-0 shrink-0 items-center gap-1 text-[11px] leading-4 font-medium">
          {pending && <Clock3 className="h-2.5 w-2.5 shrink-0 opacity-70" />}
          <span className="min-w-0 truncate">{item.personName}</span>
          {fit?.row === 'title' && chips}
        </span>
        <span className="flex min-w-0 shrink-0 items-center gap-1 overflow-hidden">
          <span className="shrink-0 text-[11px] leading-[14px] opacity-75">
            {timeText}
          </span>
          {fit?.row === 'time' && chips}
        </span>
        {titleFits && (
          <span className="block shrink-0 truncate text-[11px] leading-[14px] opacity-75">
            {item.title}
          </span>
        )}
        {fit?.row === 'stack' && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5">
            {chipList(fit.variant)}
          </span>
        )}
      </>
    ) : (
      <span className="flex min-w-0 items-center gap-1">
        {pending && <Clock3 className="h-2.5 w-2.5 shrink-0 opacity-70" />}
        <span className="min-w-0 truncate text-[11px] leading-4">
          <span className="font-medium">{item.personName}</span>{' '}
          <span className="text-[11px] opacity-75">{timeText}</span>
        </span>
        {chips}
      </span>
    )

    const className = `absolute z-10 flex flex-col overflow-hidden rounded-md border px-1.5 py-0.5 text-left ${
      color.block
    } ${pending ? 'border-dashed' : ''}`
    const style = { top, height, left, width }

    return onSelectItem ? (
      <button
        key={item.key}
        type="button"
        onClick={() => onSelectItem(item)}
        data-tooltip={tooltip}
        // Trình đọc màn hình không đọc data-tooltip: tên ca / chờ xác nhận /
        // nơi trực (kiểu chấm) chỉ nằm ở đó.
        aria-label={tooltip}
        className={`${className} transition focus:z-20 focus:ring-2 focus:ring-indigo-500 focus:outline-none`}
        style={style}
      >
        {content}
      </button>
    ) : (
      <div key={item.key} data-tooltip={tooltip} className={className} style={style}>
        {content}
      </div>
    )
  }

  return (
    // `overflow-clip` (không phải `hidden`) để bo góc mà tiêu đề ngày vẫn
    // dính được theo khung cuộn của trang (#app-scroll).
    <div className="overflow-clip rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
      {/* ---- tiêu đề ngày ---- */}
      <div
        className="sticky top-0 z-30 grid border-b border-slate-200 bg-white"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <div />
        {days.map((day, i) => {
          const isToday = dayKeys[i] === todayKey
          const inner = (
            <>
              <span
                className={`block text-[11px] font-medium capitalize ${
                  isToday ? 'text-indigo-600' : 'text-slate-500'
                }`}
              >
                {format(day, 'EEE', { locale: dateLocale })}
              </span>
              <span
                className={`mx-auto mt-0.5 flex h-9 w-9 items-center justify-center rounded-full text-lg font-medium tabular-nums transition ${
                  isToday
                    ? 'bg-indigo-600 text-white'
                    : onSelectDay
                      ? 'text-slate-800 group-hover:bg-slate-100'
                      : 'text-slate-800'
                }`}
              >
                {format(day, 'd')}
              </span>
              {dayCaption && (
                <span className="mt-0.5 block truncate text-[11px] text-slate-500 tabular-nums">
                  {dayCaption(day)}
                </span>
              )}
            </>
          )
          const cellClass = 'min-w-0 border-l border-slate-100 px-1 py-2 text-center'
          return onSelectDay ? (
            <button
              key={dayKeys[i]}
              type="button"
              onClick={() => onSelectDay(day)}
              data-tooltip={t('timeline.openDay')}
              aria-label={`${format(day, 'EEEE, d MMMM', { locale: dateLocale })} · ${t(
                'timeline.openDay',
              )}`}
              className={`group ${cellClass} focus:ring-2 focus:ring-indigo-500 focus:outline-none focus:ring-inset`}
            >
              {inner}
            </button>
          ) : (
            <div key={dayKeys[i]} className={cellClass}>
              {inner}
            </div>
          )
        })}
      </div>

      {!hasItems && emptyMessage && (
        <div className="flex items-center justify-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm text-slate-500">
          <CalendarOff className="h-4 w-4 shrink-0 text-slate-400" />
          <span>{emptyMessage}</span>
        </div>
      )}

      {/* ---- trục giờ + cột ngày ---- */}
      <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
        <div className="relative" style={{ height: bodyHeight }}>
          {Array.from({ length: hours + 1 }, (_, i) => (
            <span
              key={i}
              className="absolute right-2 -translate-y-1/2 text-[11px] text-slate-500 tabular-nums"
              style={{ top: PAD_Y + i * HOUR_PX }}
            >
              {hourLabel(range.startHour + i)}
            </span>
          ))}
        </div>

        {dayKeys.map((key, i) => {
          const isToday = key === todayKey
          return (
            <div
              key={key}
              // Bảy cột ngày rộng bằng nhau: đo một cột là đủ.
              ref={i === 0 ? setDayColumn : undefined}
              className={`relative min-w-0 border-l border-slate-100 ${
                isToday ? 'bg-indigo-50/30' : ''
              }`}
              style={{ height: bodyHeight }}
            >
              {/* vạch giờ */}
              {Array.from({ length: hours + 1 }, (_, h) => (
                <div
                  key={h}
                  className="pointer-events-none absolute inset-x-0 border-t border-slate-100"
                  style={{ top: PAD_Y + h * HOUR_PX }}
                />
              ))}

              {(laidOut.get(key) ?? []).map(renderBlock)}

              {isToday && showNow && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-20"
                  style={{
                    top: PAD_Y + ((nowMinutes - rangeStart) / 60) * HOUR_PX,
                  }}
                >
                  <div className="h-0.5 -translate-y-1/2 bg-rose-500" />
                  <div className="absolute -top-[5px] -left-[5px] h-2.5 w-2.5 rounded-full bg-rose-500" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showClippedNote && clippedCount > 0 && (
        <p className="border-t border-slate-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          {t('timeline.clipped', { count: clippedCount })}
        </p>
      )}
    </div>
  )
}
