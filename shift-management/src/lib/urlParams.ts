import { useCallback } from 'react'
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

/** `yyyy-MM-dd` hợp lệ từ URL, không thì `null` (link gõ tay, link cũ). */
export function dateParam(raw: string | null): string | null {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}
