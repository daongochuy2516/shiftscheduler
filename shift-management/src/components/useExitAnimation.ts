import { useLayoutEffect, type RefObject } from 'react'

/**
 * Hiệu ứng đóng cho hộp thoại / ngăn kéo mà không phải sửa chỗ gọi.
 *
 * Các hộp thoại trong app được mở bằng `{open && <Modal />}` ở hàng chục chỗ:
 * đóng là React gỡ khỏi DOM ngay, không còn gì để chạy hiệu ứng. Thay vì bắt
 * mọi chỗ gọi chờ hiệu ứng xong mới đổi state, lúc bị gỡ ta để lại một bản sao
 * tĩnh (không bấm được) gắn class `is-leaving`, cho CSS chạy hiệu ứng đóng rồi
 * xoá. Nhờ vậy đóng kiểu nào cũng có hiệu ứng: ✕, Esc, bấm ra ngoài, nút Huỷ,
 * hay tự đóng sau khi lưu.
 *
 * `durationMs` phải ≥ thời lượng hiệu ứng đóng trong index.css.
 *
 * `freezePosition`: cho phần tử nằm canh theo cha (`absolute`, ví dụ bảng
 * menu). Bản sao gắn vào `body` nên mất cha — ta chụp toạ độ lúc đóng rồi
 * đặt bản sao `fixed` đúng chỗ đó. Lớp phủ đã `fixed` toàn màn hình thì không
 * cần.
 */
export function useExitAnimation(
  ref: RefObject<HTMLElement | null>,
  durationMs: number,
  { freezePosition = false }: { freezePosition?: boolean } = {},
) {
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    return () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

      // Lúc cleanup chạy, node vẫn còn trên trang: chụp vị trí cuộn bây giờ,
      // vì node đã bị gỡ thì scrollTop về 0.
      // Canh theo mép trên + mép phải và lấy bề rộng chưa scale: đóng lúc bảng
      // còn đang xổ ra (đang scale từ góc trên phải) thì hai mép đó vẫn đúng.
      const rect = freezePosition
        ? {
            top: node.getBoundingClientRect().top,
            right:
              document.documentElement.clientWidth -
              node.getBoundingClientRect().right,
            width: node.offsetWidth,
          }
        : null
      const scrolled: [number, number][] = []
      node.querySelectorAll('*').forEach((el, i) => {
        if (el.scrollTop > 0) scrolled.push([i, el.scrollTop])
      })

      // Chờ hết lượt commit rồi mới quyết: StrictMode (dev) gọi cleanup rồi
      // chạy lại effect ngay trên cùng node — khi đó node vẫn còn trên trang,
      // không phải đóng thật.
      queueMicrotask(() => {
        if (node.isConnected) return
        const clone = node.cloneNode(true) as HTMLElement
        clone.classList.add('is-leaving')
        clone.setAttribute('aria-hidden', 'true')
        clone.inert = true
        if (rect) {
          Object.assign(clone.style, {
            position: 'fixed',
            top: `${rect.top}px`,
            right: `${rect.right}px`,
            left: 'auto',
            bottom: 'auto',
            width: `${rect.width}px`,
            margin: '0',
          })
        }
        document.body.appendChild(clone)
        const all = clone.querySelectorAll('*')
        for (const [i, top] of scrolled) all[i].scrollTop = top
        window.setTimeout(() => clone.remove(), durationMs)
      })
    }
  }, [ref, durationMs, freezePosition])
}
