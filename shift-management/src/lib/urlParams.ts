import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

/** Giá trị ghi lên URL. `null`, chuỗi rỗng hay mảng rỗng = xoá tham số đó. */
export type UrlValue = string | string[] | null | undefined

export interface UrlUpdateOptions {
  /**
   * `true` = thêm một mục lịch sử (Back quay lại trạng thái trước). Mặc định
   * thay mục hiện tại.
   */
  push?: boolean
  /**
   * `history.state` của mục mới. Bỏ trống thì: thay (replace) giữ nguyên
   * state đang có — để dấu "lớp phủ do mình mở" (xem useOverlayParams) không
   * mất khi trang ghi bộ lọc trong lúc hộp thoại đang mở; thêm (push) thì
   * không có state.
   */
  state?: unknown
}

/**
 * `state` react-router đang giữ cho mục lịch sử hiện tại. BrowserRouter cất
 * nó ở `history.state.usr`; đọc thẳng lúc gọi (không qua useLocation) để
 * `update` giữ nguyên tham chiếu giữa các lần vẽ.
 */
function currentRouterState(): unknown {
  try {
    return (window.history.state as { usr?: unknown } | null)?.usr ?? null
  } catch {
    return null
  }
}

/**
 * Bộ lọc của các trang nằm trên địa chỉ trang, để copy link gửi người khác là
 * mở ra đúng bộ lọc mình đang để.
 *
 * `update` gộp vào các tham số đang có (không xoá tham số trang khác đặt) và
 * mặc định thay lịch sử thay vì thêm: bấm Back không phải đi lùi qua từng lần
 * gõ / tích. `{ push: true }` khi thật sự muốn Back quay lại được (mở hộp
 * thoại — dùng useOverlayParams thay vì tự gọi).
 * Giá trị mặc định thì đừng ghi (truyền `null`) để link gọn.
 *
 * Gộp vào URL thật đang có (`window.location.search`), không phải bản
 * react-router đưa cho lần vẽ này: hai chỗ cùng ghi trong một lượt (trang
 * chuẩn hoá `date`, form ca chuẩn hoá `shiftDate`) thì cả hai đều được giữ.
 */
export function useUrlParams() {
  const [params, setParams] = useSearchParams()

  const update = useCallback(
    (patch: Record<string, UrlValue>, opts: UrlUpdateOptions = {}) => {
      const push = opts.push === true
      const state =
        'state' in opts ? opts.state : push ? undefined : currentRouterState()
      setParams(
        () => {
          // react-router đổi history ngay khi gọi, nhưng `prev` là bản của
          // lần vẽ trước — dùng nó thì lần ghi thứ hai trong cùng lượt xoá
          // mất lần thứ nhất.
          const next = new URLSearchParams(window.location.search)
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
        { replace: !push, state },
      )
    },
    [setParams],
  )

  return [params, update] as const
}

/**
 * Tham số của các hộp thoại "có địa chỉ": mở link là thấy đúng hộp thoại đó.
 *
 * - `shift` (`<id>` | `new`), `assignment`, `shiftDate`, `shiftView`: form ca
 *   (ShiftEditorProvider).
 * - `claim`: hộp nhận ca mẫu. `manage` (`templates` | `locations`) + `item`
 *   (`<id>` | `new`): trang quản lý ca mẫu / nơi trực và form sửa bên trong.
 *
 * Mỗi lúc chỉ một hộp thoại nằm trên URL: mở cái này là xoá tham số của cái
 * kia (overlayPatch).
 */
export const OVERLAY_PARAMS = [
  'shift',
  'assignment',
  'shiftDate',
  'shiftView',
  'claim',
  'manage',
  'item',
] as const

export type OverlayParam = (typeof OVERLAY_PARAMS)[number]

/** Patch xoá mọi tham số hộp thoại rồi đặt `open` lên — hộp thoại loại trừ nhau. */
export function overlayPatch(
  open: Record<string, string | null> = {},
): Record<string, string | null> {
  const patch: Record<string, string | null> = {}
  for (const key of OVERLAY_PARAMS) patch[key] = null
  return { ...patch, ...open }
}

/** Khoá trong `history.state` đánh dấu mục lịch sử do chính app thêm khi mở hộp thoại. */
const OVERLAY_STATE_KEY = 'overlayOpened'

function isOverlayEntry(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>)[OVERLAY_STATE_KEY] === true
  )
}

/**
 * Mở / đóng hộp thoại có địa chỉ.
 *
 * `open(patch)`: ghi tham số hộp thoại (qua overlayPatch, nên đóng hộp thoại
 * khác đang nằm trên URL) bằng một mục lịch sử MỚI có đánh dấu trong
 * `history.state`. Nhờ vậy nút Back của trình duyệt / vuốt lùi trên điện
 * thoại đóng hộp thoại thay vì rời trang. Đang ở trong một hộp thoại do mình
 * mở (đã có dấu) thì thay mục đó, không chồng thêm: đóng vẫn về đúng trang.
 *
 * `close()`: mục hiện tại do `open` thêm (có dấu) → `navigate(-1)`, tức như
 * bấm Back, lịch sử không dư mục nào. Không có dấu — mở thẳng từ link dán,
 * tải lại trang ở tab mới — thì không có gì phía sau để lùi về: thay URL
 * bằng bản đã xoá tham số hộp thoại.
 *
 * `set(patch)`: đổi tham số trong lúc hộp thoại đang mở (ví dụ chế độ xem)
 * bằng replace, giữ nguyên dấu.
 */
export function useOverlayParams() {
  const [params, update] = useUrlParams()
  const navigate = useNavigate()
  const location = useLocation()
  const marked = isOverlayEntry(location.state)
  // `navigate(-1)` chạy bất đồng bộ: hộp thoại còn trên màn hình tới khi URL
  // đổi. Bấm Esc / nút đóng hai lần trong khoảng đó không được lùi hai bước.
  // Chốt chỉ sống tới khi địa chỉ đổi: Forward quay lại đúng mục này (cùng
  // `location.key`) thì phải đóng được lần nữa.
  const closingKey = useRef<string | null>(null)
  const locationKey = location.key
  useEffect(() => {
    closingKey.current = null
  }, [locationKey])

  const open = useCallback(
    (patch: Record<string, string | null>) => {
      closingKey.current = null
      // Ô tìm kiếm còn đang chờ ghi (useUrlText) phải ghi vào mục hiện tại
      // trước khi thêm mục mới, không thì đóng hộp (lùi về mục này) làm mất nó.
      flushPendingUrlWrites()
      const already = isOverlayEntry(currentRouterState())
      update(overlayPatch(patch), {
        push: !already,
        state: { [OVERLAY_STATE_KEY]: true },
      })
    },
    [update],
  )

  const close = useCallback(() => {
    if (closingKey.current === locationKey) return
    if (isOverlayEntry(currentRouterState())) {
      closingKey.current = locationKey
      navigate(-1)
    } else {
      update(overlayPatch(), { state: null })
    }
  }, [locationKey, navigate, update])

  const set = useCallback(
    (patch: Record<string, UrlValue>) => update(patch),
    [update],
  )

  return { params, open, close, set, marked }
}

/** Lần ghi URL useUrlText đang hẹn giờ (chưa hết `delay`). */
const pendingUrlWrites = new Set<() => void>()

/** Ghi ngay mọi lần ghi đang chờ của useUrlText (thay mục lịch sử hiện tại). */
function flushPendingUrlWrites() {
  for (const write of [...pendingUrlWrites]) write()
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
    const write = () => {
      clearTimeout(id)
      pendingUrlWrites.delete(write)
      setSent(next)
      const patch: Record<string, UrlValue> = { [key]: next || null }
      for (const k of resetKey ? resetKey.split(',') : []) patch[k] = null
      update(patch)
    }
    const id = setTimeout(write, delay)
    pendingUrlWrites.add(write)
    return () => {
      clearTimeout(id)
      pendingUrlWrites.delete(write)
    }
  }, [text, sent, key, resetKey, delay, update])

  return [text, setText] as const
}

/** `yyyy-MM-dd` hợp lệ từ URL, không thì `null` (link gõ tay, link cũ). */
export function dateParam(raw: string | null): string | null {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}
