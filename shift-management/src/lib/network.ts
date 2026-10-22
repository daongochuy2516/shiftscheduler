import type { TranslationKey } from '../i18n/translations'

/**
 * Nhận biết mất mạng, dùng chung cho tầng dữ liệu, xác thực và giao diện.
 */

/**
 * `navigator.onLine === false` là chắc chắn mất mạng. Ngược lại thì chưa
 * chắc có mạng (wifi không ra internet), nên chỗ gọi vẫn phải đỡ lỗi mạng.
 */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/**
 * Câu lỗi khi `fetch` không tới được máy chủ, theo từng trình duyệt: Chrome
 * "Failed to fetch", Firefox "NetworkError when attempting…", Safari "Load
 * failed". supabase-js để nguyên câu này trong `error.message`.
 */
const NETWORK_ERROR = /failed to fetch|networkerror|load failed|network request failed|fetch failed/i

export function isNetworkError(err: unknown): boolean {
  if (err instanceof OfflineError) return true
  if (!isOnline()) return true
  const message = err instanceof Error ? err.message : String(err ?? '')
  return NETWORK_ERROR.test(message)
}

/**
 * Câu lỗi cố định của `OfflineError`: giao diện đổi nó sang câu đã dịch
 * (`loadErrorText`, `useNotify`), không hiện nguyên văn.
 */
export const OFFLINE_ERROR_MESSAGE = 'OFFLINE'

/** Thao tác không được gửi đi vì đang offline. */
export class OfflineError extends Error {
  constructor() {
    super(OFFLINE_ERROR_MESSAGE)
    this.name = 'OfflineError'
  }
}

export function isOfflineError(err: unknown): boolean {
  return (
    err instanceof OfflineError ||
    (err instanceof Error && err.message === OFFLINE_ERROR_MESSAGE)
  )
}

/**
 * Lỗi tải dữ liệu hiện trên trang. Offline mà máy chưa lưu phần này thì
 * thay câu cố định bằng câu đã dịch; lỗi khác giữ nguyên văn của máy chủ.
 */
export function loadErrorText(
  message: string,
  t: (key: TranslationKey) => string,
): string {
  return message === OFFLINE_ERROR_MESSAGE ? t('offline.noCache') : message
}

/** Promise xong sau `ms`, để chạy đua với một yêu cầu mạng chậm. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
