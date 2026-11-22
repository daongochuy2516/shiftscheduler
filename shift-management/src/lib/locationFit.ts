import { textWidth } from './textWidth'

/** Cách hiện một nhãn nơi trực — khớp `ChipVariant` của LocationChip. */
export type LocationVariant = 'full' | 'short' | 'dot'

export interface LocationFit {
  /** Dòng đặt nhãn trong khối ca: dòng giờ hay dòng tên ca. */
  row: 'time' | 'title'
  variant: LocationVariant
}

// Kích thước của LocationChip size "xs" — phải khớp class trong
// LocationChip.tsx: `px-1.5` chữ 10px đậm 500, chấm `h-2 w-2`, `gap-1`.
const GAP_PX = 4
const CHIP_PAD_PX = 12
const DOT_PX = 8
/** Đo bằng canvas có thể lệch vài phần px so với DOM. */
const SAFETY_PX = 2

/**
 * Chọn cách hiện nhãn nơi trực vừa một khối ca có hai dòng (tên ca, giờ):
 * tên đủ → tên tắt → chấm màu; mỗi mức thử dòng giờ trước rồi dòng tên ca
 * (tên ca thường ngắn, dòng đó hay còn chỗ). `null` = đến chấm cũng không vừa.
 *
 * `innerPx` là bề rộng nội dung của khối (đã trừ padding, viền); `titlePx` /
 * `timePx` là phần đã bị chiếm trên từng dòng (kể cả icon trước tên ca).
 */
export function pickLocationFit({
  innerPx,
  titlePx,
  timePx,
  full,
  short,
}: {
  innerPx: number
  titlePx: number
  timePx: number
  full: readonly string[]
  short: readonly string[]
}): LocationFit | null {
  if (full.length === 0) return null
  const free = {
    time: innerPx - timePx - GAP_PX - SAFETY_PX,
    title: innerPx - titlePx - GAP_PX - SAFETY_PX,
  }
  const gaps = GAP_PX * (full.length - 1)
  const labels = (list: readonly string[]) =>
    list.reduce((sum, l) => sum + textWidth(l, 10, 500) + CHIP_PAD_PX, 0) + gaps
  const options: [LocationVariant, number][] = [
    ['full', labels(full)],
    ['short', labels(short)],
    ['dot', DOT_PX * full.length + gaps],
  ]
  for (const [variant, need] of options) {
    for (const row of ['time', 'title'] as const) {
      if (need <= free[row]) return { row, variant }
    }
  }
  return null
}
