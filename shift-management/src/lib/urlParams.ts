import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Giá trị ghi lên URL. `null`, chuỗi rỗng hay mảng rỗng = xoá tham số đó. */
export type UrlValue = string | string[] | null | undefined

/**
 * Bộ lọc của các trang nằm trên địa chỉ trang, để copy link gửi người khác là
 * mở ra đúng bộ lọc mình đang để.
 *
 * `update` gộp vào các tham số đang có (không xoá tham số trang khác đặt) và
 * thay lịch sử thay vì thêm: bấm Back không phải đi lùi qua từng lần gõ / tích.
 * Giá trị mặc định thì đừng ghi (truyền `null`) để link gọn.
 *
 * Một thao tác người dùng nên gọi `update` đúng một lần: hai lần liền trong
 * cùng một lượt có thể đè nhau.
 */
export function useUrlParams() {
  const [params, setParams] = useSearchParams()

  const update = useCallback(
    (patch: Record<string, UrlValue>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(patch)) {
            next.delete(key)
            if (Array.isArray(value)) {
              for (const v of value) if (v) next.append(key, v)
            } else if (value) {
              next.set(key, value)
            }
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return [params, update] as const
}

/**
 * Ô gõ chữ (tìm kiếm) có giá trị nằm trên URL ở tham số `key`.
 *
 * Ô không được lấy `value` thẳng từ URL: react-router cập nhật URL trễ một
 * nhịp, nên giữa hai phím React ghi đè ô bằng chữ cũ. Bộ gõ tiếng Việt kiểu
 * EVKey / Unikey (xoá rồi gõ lại cả âm tiết bằng phím giả) sẽ ra chữ lộn xộn.
 * Vì vậy chữ trong ô là state cục bộ — trang cũng nên lọc theo `text` để kết
 * quả đi ngay theo phím — còn URL chỉ được ghi khi đã ngừng gõ `delay` ms.
 *
 * URL đổi từ nơi khác (Back, link Ctrl + K…) thì ô nhận giá trị mới. Giá trị
 * do chính hook ghi lên thì bỏ qua khi nó về tới, nên không bao giờ đè phần
 * người dùng gõ thêm trong lúc chờ. Nút "xoá" của trang thì gọi `setText('')`
 * (hoặc `setText` giá trị mới) chứ không chỉ xoá trên URL.
 *
 * `resetKeys`: các tham số xoá cùng lúc khi chữ đổi (ví dụ `page` về trang 1).
 */
export function useUrlText(key: string, resetKeys: readonly string[] = [], delay = 300) {
  const [params, update] = useUrlParams()
  const urlValue = params.get(key) ?? ''
  const [text, setText] = useState(urlValue)
  // Giá trị gần nhất hook ghi lên (hoặc đã nhận từ URL).
  const [sent, setSent] = useState(urlValue)
  // Giá trị URL lần vẽ trước, để biết URL vừa đổi.
  const [seen, setSeen] = useState(urlValue)
  if (urlValue !== seen) {
    setSeen(urlValue)
    if (urlValue !== sent) {
      setSent(urlValue)
      setText(urlValue)
    }
  }

  const resetKey = resetKeys.join(',')
  useEffect(() => {
    const next = text.trim()
    if (next === sent) return
    const id = setTimeout(() => {
      setSent(next)
      const patch: Record<string, UrlValue> = { [key]: next || null }
      for (const k of resetKey ? resetKey.split(',') : []) patch[k] = null
      update(patch)
    }, delay)
    return () => clearTimeout(id)
  }, [text, sent, key, resetKey, delay, update])

  return [text, setText] as const
}

/** `yyyy-MM-dd` hợp lệ từ URL, không thì `null` (link gõ tay, link cũ). */
export function dateParam(raw: string | null): string | null {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}
