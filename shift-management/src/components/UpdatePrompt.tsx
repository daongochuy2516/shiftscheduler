import { RefreshCw } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import {
  applyUpdate,
  dismissUpdate,
  useServiceWorker,
} from '../pwa/serviceWorker'

/**
 * Hộp nhắc khi đã tải xong phiên bản mới. Gắn một lần ở App.tsx nên hiện cả
 * ở trang đăng nhập. "Để sau" chỉ ẩn hộp; nút cập nhật vẫn còn ở trang
 * Trạng thái, và lần mở app sau sẽ chạy bản mới.
 *
 * Mobile: nằm trên nút nổi (FAB) để không che nó; từ 640px: góc phải dưới
 * (góc trái dưới là chỗ của lời mời xem hướng dẫn).
 */
export function UpdatePrompt() {
  const { needRefresh, dismissed } = useServiceWorker()
  const { t } = useI18n()
  if (!needRefresh || dismissed) return null

  return (
    <div
      role="alertdialog"
      aria-labelledby="update-prompt-title"
      className="fixed inset-x-4 bottom-[calc(var(--bottom-nav-h)+var(--safe-b)+5.25rem)] z-50 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-900/10 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96"
    >
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
          <RefreshCw className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p id="update-prompt-title" className="text-sm font-semibold text-slate-900">
            {t('pwa.updateTitle')}
          </p>
          <p className="mt-0.5 text-sm text-slate-600">{t('pwa.updateBody')}</p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={dismissUpdate}
              className="min-h-11 rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 sm:min-h-9"
            >
              {t('pwa.later')}
            </button>
            <button
              type="button"
              onClick={applyUpdate}
              className="min-h-11 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 sm:min-h-9"
            >
              {t('pwa.reload')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
