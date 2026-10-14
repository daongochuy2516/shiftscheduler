/**
 * Vị trí của một bảng nổi (danh sách của Select, lịch của DateInput) vẽ vào
 * `document.body` và đặt `fixed` theo ô bấm: không bị khung cuộn của hộp
 * thoại cắt mất.
 */
export interface Placement {
  left: number
  /** Bề rộng của ô bấm — bảng ít nhất rộng bằng ô. */
  width: number
  top?: number
  bottom?: number
  /** Mở lên trên ô (ô nằm sát đáy màn hình). */
  up: boolean
}

const GAP = 4
/** Chừa mép màn hình, để bảng không dính sát cạnh. */
const EDGE = 8

/**
 * `panelHeight`: chiều cao (tối đa) của bảng, để quyết định mở xuống hay lên.
 * `panelWidth`: bề rộng cố định của bảng nếu có — để đẩy bảng vào trong khi ô
 * nằm sát mép phải màn hình.
 */
export function placePopover(
  trigger: HTMLElement,
  panelHeight: number,
  panelWidth?: number,
): Placement {
  const r = trigger.getBoundingClientRect()
  const vh = window.innerHeight
  const vw = document.documentElement.clientWidth
  const below = vh - r.bottom - GAP
  // Mở lên chỉ khi phía dưới không đủ chỗ mà phía trên rộng hơn — như ô gốc.
  const up = below < Math.min(panelHeight, 160) && r.top > below
  const width = Math.max(r.width, panelWidth ?? 0)
  const left = Math.max(EDGE, Math.min(r.left, vw - width - EDGE))
  return up
    ? { left, width: r.width, bottom: vh - r.top + GAP, up }
    : { left, width: r.width, top: r.bottom + GAP, up }
}
