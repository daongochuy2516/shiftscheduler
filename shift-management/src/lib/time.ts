import { format, parse } from 'date-fns'

/** Minutes since midnight from "HH:mm" or "HH:mm:ss". Returns 0 on garbage. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':')
  const hours = Number(h)
  const minutes = Number(m)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0
  return hours * 60 + minutes
}

/** "HH:mm" from minutes since midnight, clamped to a single day. */
export function fromMinutes(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(minutes)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Postgres returns "HH:mm:ss" — the UI and <input type="time"> want "HH:mm". */
export function normalizeTime(time: string | null | undefined): string {
  if (!time) return '00:00'
  const [h = '00', m = '00'] = time.split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

/** "08:00" → "8:00 AM"-ish compact label used inside blocks and lists. */
export function formatTimeLabel(time: string): string {
  return normalizeTime(time)
}

export function formatRange(start: string, end: string): string {
  return `${normalizeTime(start)} – ${normalizeTime(end)}`
}

/**
 * "6/10/2026 · 16:00 – 22:00" — chi tiết của một thông báo. Không có tên thứ
 * nên không phụ thuộc ngôn ngữ: thông báo đã lưu đọc được cả khi đổi ngôn ngữ.
 */
export function formatShiftWhen(date: string, start: string, end: string): string {
  return `${format(fromDateKey(date), 'd/M/yyyy')} · ${formatRange(start, end)}`
}

/** 210 → "3h 30m" */
export function formatMinutesDuration(total: number): string {
  const mins = Math.max(0, Math.round(total))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Length of a time range, e.g. "08:00"–"11:30" → "3h 30m". */
export function formatDuration(start: string, end: string): string {
  return formatMinutesDuration(toMinutes(end) - toMinutes(start))
}

/** yyyy-MM-dd for a Date, in local time (never UTC — avoids off-by-one days). */
export function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** Parses a yyyy-MM-dd key back into a local Date at midnight. */
export function fromDateKey(key: string): Date {
  return parse(key, 'yyyy-MM-dd', new Date())
}

/** True when `end` is at or before `start` — used for validation. */
export function isInvalidRange(start: string, end: string): boolean {
  return toMinutes(end) <= toMinutes(start)
}

/** True when the two [start,end) ranges overlap. */
export function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd)
}
