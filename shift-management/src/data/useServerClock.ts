import { useEffect, useState } from 'react'
import { backend } from './index'

export type ClockSource = 'server' | 'device'

/**
 * Đồng hồ chạy theo giờ máy chủ: hỏi máy chủ một lần, giữ độ lệch, rồi tự
 * đếm ở máy. Neo vào `performance.now()` (chỉ tăng) chứ không `Date.now()`,
 * nên người dùng chỉnh giờ máy thì đồng hồ vẫn đúng.
 *
 * Trạng thái để ở cấp module: nhiều chỗ cùng dùng thì chung một độ lệch.
 */
let base = Date.now() - performance.now()
let source: ClockSource = 'device'
let pending: Promise<void> | null = null

/** Mili giây epoch theo giờ máy chủ (giờ máy nếu chưa lấy được). */
export function serverNow(): number {
  return base + performance.now()
}

function sync(): Promise<void> {
  pending ??= (async () => {
    const sent = performance.now()
    try {
      const server = await backend.serverTime()
      const received = performance.now()
      if (server) {
        // Giả định đường đi và đường về dài như nhau: giờ máy chủ ứng với
        // điểm giữa lúc gửi và lúc nhận.
        base = server.getTime() - (sent + received) / 2
        source = 'server'
      } else {
        base = Date.now() - performance.now()
        source = 'device'
      }
    } catch {
      // Mất mạng: giữ độ lệch lần trước, lần sau hỏi lại.
    } finally {
      pending = null
    }
  })()
  return pending
}

const RESYNC_MS = 10 * 60_000

/** Giờ máy chủ, cập nhật đúng lúc sang mỗi giây. */
export function useServerClock(): { now: Date; source: ClockSource } {
  const [state, setState] = useState(() => ({
    now: new Date(serverNow()),
    source,
  }))

  useEffect(() => {
    let alive = true
    let timer = 0

    // Hẹn tới đúng đầu giây kế tiếp thay vì setInterval(1000): interval trôi
    // dần và có lúc nhảy cóc hai giây.
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(tick, 1000 - (serverNow() % 1000) + 5)
    }
    const tick = () => {
      setState({ now: new Date(serverNow()), source })
      schedule()
    }
    const resync = () => {
      void sync().then(() => {
        if (alive) tick()
      })
    }
    // Máy ngủ hay tab bị treo thì `performance.now()` có thể đứng: quay lại
    // là hỏi lại.
    const onVisible = () => {
      if (document.visibilityState === 'visible') resync()
    }

    schedule()
    resync()
    const interval = window.setInterval(resync, RESYNC_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', resync)
    return () => {
      alive = false
      window.clearTimeout(timer)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', resync)
    }
  }, [])

  return state
}
