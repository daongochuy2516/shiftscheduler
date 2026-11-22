import { useEffect } from 'react'
import { isValid } from 'date-fns'
import { dateParam, useUrlParams, type UrlValue } from './urlParams'
import { fromDateKey } from './time'

function toList(value: UrlValue): string[] {
  if (Array.isArray(value)) return value.filter(Boolean)
  return value ? [value] : []
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/**
 * Giữ URL khớp với thứ trang đang hiện.
 *
 * Trang tự hiểu giá trị lạ trên URL (link gõ tay, link cũ, id đã bị xoá…)
 * theo cách của nó — ngày sai thì về hôm nay, chế độ xem lạ thì về mặc
 * định. Nếu URL cứ giữ giá trị lạ đó thì copy link gửi đi lúc khác (hay
 * người nhận ở máy khác) có thể ra màn hình khác. Hook này nhận giá trị
 * "đúng" của từng tham số trang đang dùng và ghi đè lên URL (thay lịch sử,
 * không thêm) những tham số đang khác.
 *
 * - `canonical[key]`: giá trị phải có; `null` / `''` / `[]` = không có tham
 *   số đó. Tham số không nêu thì không đụng tới.
 * - Truyền `null` cả object khi chưa đủ dữ liệu để quyết định (danh sách
 *   nhân viên chưa tải xong…): khi đó không sửa gì.
 *
 * Mọi tham số sai được gộp trong một lần ghi. Hook chạy lại mỗi khi URL đổi,
 * nên nếu lần ghi bị một lần ghi khác cùng nhịp đè mất thì lần sau ghi lại.
 */
export function useCanonicalParams(
  canonical: Record<string, UrlValue> | null,
) {
  const [params, update] = useUrlParams()

  let patch: Record<string, string[]> | null = null
  if (canonical) {
    for (const [key, want] of Object.entries(canonical)) {
      const wantList = toList(want)
      if (!sameList(params.getAll(key), wantList)) {
        patch ??= {}
        patch[key] = wantList
      }
    }
  }
  // So bằng chuỗi để effect chỉ chạy khi thật sự có gì cần sửa.
  const signature = patch ? JSON.stringify(patch) : ''

  useEffect(() => {
    if (!signature) return
    update(JSON.parse(signature) as Record<string, string[]>)
  }, [signature, update])
}

/**
 * Như `dateParam` nhưng loại cả ngày không có thật (`2026-02-30`,
 * `2026-13-01`): khớp mẫu chữ thôi thì date-fns vẫn trả Invalid Date.
 */
export function validDateParam(raw: string | null): string | null {
  const key = dateParam(raw)
  return key && isValid(fromDateKey(key)) ? key : null
}

/** Hai đầu khoảng ngày; `from` > `to` (link gõ tay) thì đảo lại cho đúng chiều. */
export function orderedRange(
  from: string | null,
  to: string | null,
): { from: string | null; to: string | null } {
  return from && to && from > to ? { from: to, to: from } : { from, to }
}
