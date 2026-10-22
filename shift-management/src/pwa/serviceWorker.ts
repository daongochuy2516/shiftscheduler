import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { isOnline } from '../lib/network'

/**
 * Service worker giữ vỏ ứng dụng (JS, CSS, icon) để mất mạng vẫn mở được.
 * Cấu hình ở `VitePWA` trong vite.config.ts; dữ liệu ca không nằm ở đây mà
 * trong IndexedDB (data/offlineCache.ts).
 *
 * Bản mới không tự áp dụng: worker mới nằm chờ tới khi người dùng bấm "Tải
 * lại" (UpdatePrompt) — tự tải lại giữa lúc đang điền form là mất việc.
 */
export interface ServiceWorkerState {
  /** Trình duyệt có service worker và đây là bản build (dev thì tắt). */
  supported: boolean
  /** Đã có worker điều khiển trang: mất mạng vẫn mở được app. */
  ready: boolean
  /** Có bản mới đang chờ. */
  needRefresh: boolean
  /** Người dùng bấm "Để sau": ẩn hộp nhắc, trang Trạng thái vẫn còn nút. */
  dismissed: boolean
  checking: boolean
  /** Lần kiểm tra bản mới gần nhất (ms). */
  lastCheck: number | null
}

let state: ServiceWorkerState = {
  supported: import.meta.env.PROD && 'serviceWorker' in navigator,
  ready: false,
  needRefresh: false,
  dismissed: false,
  checking: false,
  lastCheck: null,
}
const listeners = new Set<() => void>()

function set(patch: Partial<ServiceWorkerState>) {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn())
}

let applyUpdateFn: ((reload?: boolean) => Promise<void>) | null = null
let registration: ServiceWorkerRegistration | undefined

/** Tự hỏi máy chủ có bản mới không, mỗi giờ và mỗi lần quay lại tab. */
const CHECK_EVERY_MS = 60 * 60_000
/** Quay lại tab liên tục thì không hỏi dồn. */
const MIN_CHECK_GAP_MS = 5 * 60_000

/** Gọi một lần lúc khởi động (main.tsx). */
export function startServiceWorker() {
  if (!state.supported) return
  applyUpdateFn = registerSW({
    immediate: true,
    onNeedRefresh() {
      set({ needRefresh: true, dismissed: false })
    },
    onOfflineReady() {
      set({ ready: true })
    },
    onRegisterError(err) {
      // App vẫn chạy bình thường, chỉ không mở được khi offline.
      console.warn('Service worker registration failed', err)
    },
    onRegisteredSW(_url, reg) {
      registration = reg
      set({ ready: Boolean(navigator.serviceWorker.controller || reg?.active) })
      window.setInterval(() => void checkForUpdate(), CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (
          document.visibilityState === 'visible' &&
          Date.now() - (state.lastCheck ?? 0) > MIN_CHECK_GAP_MS
        ) {
          void checkForUpdate()
        }
      })
    },
  })
}

/**
 * Hỏi máy chủ có bản mới không. Có thì `needRefresh` bật qua onNeedRefresh
 * (sau khi worker mới tải xong). Trả về `true` / `false` là có / không có bản
 * mới; `null` khi không hỏi được (offline, lỗi, đang hỏi dở).
 */
export async function checkForUpdate(): Promise<boolean | null> {
  const reg = registration
  if (!reg || !isOnline() || state.checking) return null
  set({ checking: true })
  try {
    await reg.update()
    return Boolean(reg.installing || reg.waiting)
  } catch {
    // Máy chủ không trả lời: để lần sau.
    return null
  } finally {
    set({ checking: false, lastCheck: Date.now() })
  }
}

/** Kích hoạt bản mới rồi tải lại trang. */
export function applyUpdate() {
  void applyUpdateFn?.(true)
}

export function dismissUpdate() {
  set({ dismissed: true })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useServiceWorker(): ServiceWorkerState {
  return useSyncExternalStore(subscribe, () => state)
}
