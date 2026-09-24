export const SCROLL_ROOT_ID = 'app-scroll'

/**
 * Khung cuộn nội dung của AppLayout. Từ 640px trở lên nội dung cuộn trong
 * khung này (header đứng yên, thanh cuộn không đè lên header); dưới 640px cả
 * trang cuộn như thường, khi đó trả về `null` = viewport.
 */
export function scrollRoot(): HTMLElement | null {
  const el = document.getElementById(SCROLL_ROOT_ID)
  if (!el) return null
  const overflow = getComputedStyle(el).overflowY
  return overflow === 'auto' || overflow === 'scroll' ? el : null
}
