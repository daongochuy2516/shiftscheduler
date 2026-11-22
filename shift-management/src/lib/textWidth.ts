/**
 * Đo độ rộng chữ (px) bằng canvas, không cần dựng phần tử ẩn trong DOM.
 * Dùng để chọn cách hiện vừa chỗ (ví dụ nhãn nơi trực trên khối ca hẹp)
 * ngay lúc render, không phải đo rồi render lại.
 */

let context: CanvasRenderingContext2D | null | undefined
let family: string | undefined

function fontFamily(): string {
  if (family === undefined) {
    family =
      typeof document !== 'undefined'
        ? getComputedStyle(document.body).fontFamily || 'sans-serif'
        : 'sans-serif'
  }
  return family
}

const cache = new Map<string, number>()

/** `size` là cỡ chữ px, `weight` như CSS (400, 500, 600…). */
export function textWidth(text: string, size: number, weight = 400): number {
  const key = `${weight}|${size}|${text}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  if (context === undefined) {
    context =
      typeof document !== 'undefined'
        ? document.createElement('canvas').getContext('2d')
        : null
  }
  // Không có canvas (môi trường lạ): ước lượng thô theo số ký tự.
  const width = context
    ? ((context.font = `${weight} ${size}px ${fontFamily()}`),
      context.measureText(text).width)
    : text.length * size * 0.6
  cache.set(key, width)
  return width
}
