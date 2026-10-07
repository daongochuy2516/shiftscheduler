import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { scrollRoot } from '../lib/scrollRoot'
import { useExitAnimation } from './useExitAnimation'

/**
 * Hộp thoại chung.
 *
 * Trên mobile nó là bottom sheet: trượt lên từ đáy, bo góc trên, cao tối đa
 * 90dvh. Trên màn hình từ 640px trở lên nó là hộp thoại giữa màn hình như cũ —
 * giao diện PC không đổi.
 *
 * Bê nguyên modal desktop xuống điện thoại sẽ cho ra một hộp lơ lửng giữa màn
 * hình, nút bấm nằm xa ngón tay và dễ bị bàn phím ảo che.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 'max-w-3xl',
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  // Mở: CSS chạy hiệu ứng khi mount (`modal-backdrop`, `modal-panel` trong
  // index.css). Đóng: xem useExitAnimation.
  const rootRef = useRef<HTMLDivElement>(null)
  useExitAnimation(rootRef, 260)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // Khoá cả trang (mobile) lẫn khung cuộn nội dung (desktop). Khung đó có
    // `scrollbar-gutter: stable` nên khoá lại không làm nội dung giật.
    const locked = [document.documentElement, scrollRoot()].filter(
      (el): el is HTMLElement => el !== null,
    )
    const previous = locked.map((el) => el.style.overflow)
    locked.forEach((el) => (el.style.overflow = 'hidden'))
    return () => {
      document.removeEventListener('keydown', onKey)
      locked.forEach((el, i) => (el.style.overflow = previous[i]))
    }
  }, [onClose])

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto sm:items-start sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Lớp mờ tách riêng và dài quá đáy màn hình: `inset-0` chỉ tới đáy
          vùng nhìn thấy, phần nằm dưới thanh công cụ của trình duyệt mobile
          sẽ lộ nền trắng của trang. */}
      <div
        aria-hidden="true"
        className="modal-backdrop pointer-events-none fixed inset-x-0 top-0 h-[calc(100lvh+10rem)] bg-slate-900/40 backdrop-blur-[2px] dark:bg-black/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal-panel relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 sm:my-auto sm:max-h-[calc(100dvh-6rem)] sm:rounded-xl ${width}`}
      >
        {/* Tay nắm: dấu hiệu quen thuộc cho biết đây là tấm kéo từ đáy lên. */}
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-slate-300" />
        </div>

        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 truncate text-sm text-slate-500">{subtitle}</p>
            )}
          </div>
          {/* Vùng bấm 44px theo yêu cầu chạm, icon vẫn nhỏ như cũ. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 sm:h-9 sm:w-9"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* flex-1 + overflow ở đây, không phải max-height cố định: khi bàn phím
            ảo mở, sheet co lại và phần thân vẫn cuộn được. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {children}
        </div>

        {footer && (
          <footer
            className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-5"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
