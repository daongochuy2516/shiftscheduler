import { trySummary, type StatuspageSummary } from './statuspage'

export interface NetlifyOrigin {
  /** Trung tâm dữ liệu edge từ `Server-Timing: dc;desc="aws-sin"`. */
  dc: string | null
  /** "hit" / "miss" … từ `Cache-Status: "Netlify Edge"; hit`. */
  cache: string | null
  ms: number
}

export interface NetlifyStatus {
  /** `null` khi trang không được Netlify phục vụ (localhost, host khác). */
  origin: NetlifyOrigin | null
  /** `null` khi không lấy được từ netlifystatus.com. */
  global: StatuspageSummary | null
  globalError: string | null
}

/**
 * Hỏi lại chính trang này bằng HEAD rồi đọc header: cùng origin nên JS đọc
 * được hết. `x-nf-request-id` vẫn còn kể cả khi có Cloudflare đứng trước
 * Netlify (lúc đó `server` là "cloudflare").
 */
async function probeOrigin(): Promise<NetlifyOrigin | null> {
  const start = performance.now()
  try {
    const res = await fetch(window.location.origin + '/', {
      method: 'HEAD',
      cache: 'no-store',
    })
    const ms = Math.round(performance.now() - start)
    const server = res.headers.get('server') ?? ''
    const onNetlify =
      res.headers.has('x-nf-request-id') || /netlify/i.test(server)
    if (!onNetlify) return null

    const timing = res.headers.get('server-timing') ?? ''
    const dc = /(?:^|,)\s*dc;desc="?([^",;]+)/.exec(timing)?.[1] ?? null
    const cacheStatus = res.headers.get('cache-status') ?? ''
    const cache = /Netlify Edge"?;\s*(\w+)/i.exec(cacheStatus)?.[1] ?? null
    return { dc, cache, ms }
  } catch {
    return null
  }
}

export async function probeNetlify(): Promise<NetlifyStatus> {
  const [origin, global] = await Promise.all([
    probeOrigin(),
    trySummary('https://www.netlifystatus.com'),
  ])
  return { origin, global: global.summary, globalError: global.error }
}
