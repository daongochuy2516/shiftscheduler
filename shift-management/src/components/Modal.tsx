import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { scrollRoot } from '../lib/scrollRoot'
import { useExitAnimation } from './useExitAnimation'

/**
 * Các Modal đang mở, theo thứ tự mở. Esc chỉ đóng cái trên cùng: hộp xác
 * nhận mở đè lên form ca thì Esc đóng hộp xác nhận, form vẫn còn.
 */
const openModals: object[] = []
/** Cảnh báo "chưa lưu" giữ bao lâu; quá thì ✕ / Esc lại phải bấm hai lần. */
const UNSAVED_CONFIRM_MS = 4000
/** Giá trị `overflow` trước khi Modal đầu tiên khoá cuộn, trả lại khi cái cuối đóng. */
let unlocked: { el: HTMLElement; overflow: string }[] = []

/**
 * Hộp thoại chung.
 *
 * Trên mobile nó là bottom sheet: trượt lên từ đáy, bo góc trên, cao tối đa
 * 90dvh. Trên màn hình từ 640px trở lên nó là hộp thoại giữa màn hình như cũ —
 * giao diện PC không đổi.
 *
 * Bê nguyên modal desktop xuống điện thoại sẽ cho ra một hộp lơ lửng giữa màn
 * hình, nút bấm nằm xa ngón tay và dễ bị bàn phím ảo che.
 *
 * `dirty` = form có thay đổi chưa lưu. Khi đó bấm nền không đóng nữa (chỉ hiện
 * cảnh báo), còn ✕ / Esc phải bấm hai lần: lần đầu hiện cảnh báo, lần hai
 * trong `UNSAVED_CONFIRM_MS` mới đóng. Nút Huỷ / Đóng ở chân form là ý định
 * rõ ràng nên vẫn đóng ngay — chúng gọi thẳng `onClose` của form, không qua
 * đây. Không lưu nháp: đóng là mất.
 */
export function Modal({
  title,
  titleAside,
  subtitle,
  onClose,
  children,
  footer,
  width = 'max-w-3xl',
  dirty = false,
}: {
  title: string
  /** Vẽ ngay sau tiêu đề, cùng hàng (ví dụ nhãn vai trò). */
  titleAside?: ReactNode
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
  dirty?: boolean
}) {
  const { t } = useI18n()
  // Mở: CSS chạy hiệu ứng khi mount (`modal-backdrop`, `modal-panel` trong
  // index.css). Đóng: xem useExitAnimation.
  const rootRef = useRef<HTMLDivElement>(null)
  useExitAnimation(rootRef, 260)

  /** Đã cảnh báo "chưa lưu" — lần đóng kế tiếp (✕ / Esc) là đóng thật. */
  const [warned, setWarned] = useState(false)
  useEffect(() => {
    if (!warned) return
    const id = window.setTimeout(() => setWarned(false), UNSAVED_CONFIRM_MS)
    return () => window.clearTimeout(id)
  }, [warned])
  const showWarning = dirty && warned

  /** ✕ và Esc. */
  function requestClose() {
    if (!dirty || warned) onClose()
    else setWarned(true)
  }

  // `requestClose` đổi mỗi lần vẽ. Giữ bản mới nhất ở ref để phần đăng ký
  // dưới đây chạy đúng một lần khi mount — đăng ký lại mỗi lần vẽ sẽ đẩy
  // Modal nằm dưới lên đầu ngăn xếp.
  const requestCloseRef = useRef(requestClose)
  useEffect(() => {
    requestCloseRef.current = requestClose
  })

  useEffect(() => {
    const token = {}
    // Khoá cả trang (mobile) lẫn khung cuộn nội dung (desktop). Khung đó có
    // `scrollbar-gutter: stable` nên khoá lại không làm nội dung giật. Khoá
    // một lần cho cả chồng Modal: đóng không theo thứ tự (hộp dưới đóng
    // trước) vẫn trả đúng giá trị cũ.
    if (openModals.length === 0) {
      unlocked = [document.documentElement, scrollRoot()]
        .filter((el): el is HTMLElement => el !== null)
        .map((el) => ({ el, overflow: el.style.overflow }))
      unlocked.forEach(({ el }) => (el.style.overflow = 'hidden'))
    }
    openModals.push(token)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || openModals[openModals.length - 1] !== token) return
      requestCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      const index = openModals.indexOf(token)
      if (index >= 0) openModals.splice(index, 1)
      document.removeEventListener('keydown', onKey)
      if (openModals.length === 0) {
        unlocked.forEach(({ el, overflow }) => (el.style.overflow = overflow))
        unlocked = []
      }
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto sm:items-start sm:p-6"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return
        // Bấm nền là dễ lỡ tay nhất: có thay đổi chưa lưu thì không bao giờ
        // đóng, chỉ nhắc.
        if (dirty) setWarned(true)
        else onClose()
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
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-base font-semibold text-slate-900">
                {title}
              </h2>
              {titleAside}
            </div>
            {subtitle && (
              <p className="mt-0.5 truncate text-sm text-slate-500">{subtitle}</p>
            )}
          </div>
          {/* Vùng bấm 44px theo yêu cầu chạm, icon vẫn nhỏ như cũ. */}
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className={`-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition sm:h-9 sm:w-9 ${
              showWarning
                ? 'bg-rose-600 text-white hover:bg-rose-500'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {showWarning && (
          <p
            role="alert"
            className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 sm:px-5"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t('common.unsavedClose')}
          </p>
        )}

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
