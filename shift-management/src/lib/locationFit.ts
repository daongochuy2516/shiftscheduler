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

/** Bề rộng một chip size "xs" có nhãn `label`. */
export function chipWidth(label: string): number {
  return textWidth(label, 10, 500) + CHIP_PAD_PX
}

/** Chip "xs" cao 14px (`py-0.5` + chữ 10px `leading-none`), dòng cách 2px. */
export const CHIP_LINE_PX = 14
export const CHIP_ROW_GAP_PX = 2

/**
 * Số dòng cần để xếp các chip (`flex-wrap`, `gap-x-1`) trong bề rộng
 * `innerPx`. `null` = có chip rộng hơn cả khối (xuống dòng cũng không vừa).
 */
export function chipLines(labels: readonly string[], innerPx: number): number | null {
  const avail = innerPx - SAFETY_PX
  let lines = 0
  let used = 0
  for (const label of labels) {
    const w = chipWidth(label)
    if (w > avail) return null
    if (lines === 0 || used + GAP_PX + w > avail) {
      lines += 1
      used = w
    } else {
      used += GAP_PX + w
    }
  }
  return lines
}

/** Chiều cao của `lines` dòng chip. */
export function chipBlockHeight(lines: number): number {
  return lines <= 0 ? 0 : lines * CHIP_LINE_PX + (lines - 1) * CHIP_ROW_GAP_PX
}

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
