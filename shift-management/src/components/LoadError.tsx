import { useI18n } from '../i18n/I18nContext'
import { loadErrorText } from '../lib/network'

/**
 * Hộp lỗi tải dữ liệu đầu trang. Lỗi của máy chủ hiện nguyên văn; offline
 * mà phần này chưa có bản lưu trên máy thì hiện câu giải thích đã dịch.
 */
export function LoadError({ message }: { message: string }) {
  const { t } = useI18n()
  return (
    <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200 select-text">
      {loadErrorText(message, t)}
    </p>
  )
}
