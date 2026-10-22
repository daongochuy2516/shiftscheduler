import { useSyncExternalStore } from 'react'

/**
 * Cài ứng dụng ra màn hình chính / menu Start.
 *
 * Chrome, Edge, trình duyệt Android bắn `beforeinstallprompt` khi trang đủ
 * điều kiện cài; giữ lại sự kiện đó để mở hộp cài từ nút của mình (menu lưới,
 * sheet tài khoản). Safari trên iPhone / iPad không có sự kiện này — chỉ cài
 * được bằng tay qua nút Chia sẻ, nên app hiện hướng dẫn thay vì nút cài.
 *
 * Module này phải được import sớm (main.tsx): sự kiện có thể đến trước khi
 * React kịp mount.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallState {
  /** Đang chạy như app đã cài (cửa sổ riêng, không thanh địa chỉ) — kể cả khi F11. */
  standalone: boolean
  /** Trình duyệt cho mở hộp cài ngay. */
  canPrompt: boolean
  /**
   * Trình duyệt có cơ chế mời cài (Chrome, Edge, Android) dù lúc này chưa
   * mời — thường vì app đã được cài trên máy này.
   */
  promptSupported: boolean
  /** iPhone / iPad chưa cài: cài bằng tay qua Chia sẻ → Thêm vào MH chính. */
  manualIos: boolean
}

const STANDALONE_QUERY = '(display-mode: standalone)'
const FULLSCREEN_QUERY = '(display-mode: fullscreen)'
/** Cửa sổ này mở ra như app đã cài (sessionStorage: theo cửa sổ, sống qua F5). */
const APP_WINDOW_KEY = 'scheduler.appWindow'

function detectFullscreen(): boolean {
  return window.matchMedia(FULLSCREEN_QUERY).matches
}

function detectStandalone(): boolean {
  const now =
    window.matchMedia(STANDALONE_QUERY).matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  // F11 trong cửa sổ app đổi display-mode sang `fullscreen`, không còn khớp
  // `standalone` nữa: nhớ rằng cửa sổ này là app thì mới phân biệt được với
  // F11 trên một tab trình duyệt thường.
  try {
    if (now) sessionStorage.setItem(APP_WINDOW_KEY, '1')
    else if (detectFullscreen()) return sessionStorage.getItem(APP_WINDOW_KEY) === '1'
  } catch {
    // Không có sessionStorage: F11 trong app sẽ báo là tab trình duyệt.
  }
  return now
}

function detectIos(): boolean {
  const ua = navigator.userAgent
  // iPadOS báo mình là Mac; phân biệt bằng màn cảm ứng.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  )
}

let deferred: BeforeInstallPromptEvent | null = null
let state: InstallState = compute()
const listeners = new Set<() => void>()

function compute(): InstallState {
  const standalone = detectStandalone()
  return {
    standalone,
    canPrompt: !standalone && deferred !== null,
    promptSupported: 'onbeforeinstallprompt' in window,
    manualIos: !standalone && detectIos(),
  }
}

function refresh() {
  const next = compute()
  if (
    next.standalone === state.standalone &&
    next.canPrompt === state.canPrompt &&
    next.manualIos === state.manualIos
  ) {
    return
  }
  state = next
  listeners.forEach((fn) => fn())
}

window.addEventListener('beforeinstallprompt', (e) => {
  // Không để trình duyệt tự hiện thanh mời cài: nút nằm trong menu của app.
  e.preventDefault()
  deferred = e as BeforeInstallPromptEvent
  refresh()
})

window.addEventListener('appinstalled', () => {
  deferred = null
  refresh()
})

window.matchMedia(STANDALONE_QUERY).addEventListener('change', refresh)
window.matchMedia(FULLSCREEN_QUERY).addEventListener('change', refresh)

/** Mở hộp cài của trình duyệt. Trả về true nếu người dùng đồng ý. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred
  if (!event) return false
  // Mỗi sự kiện chỉ prompt() được một lần.
  deferred = null
  refresh()
  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome === 'accepted'
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, () => state)
}
