import { trySummary, type StatuspageSummary } from './statuspage'

export interface EdgeTrace {
  /** Mã trung tâm dữ liệu đang phục vụ, ví dụ "HKG". */
  colo: string
  /** Quốc gia của người xem theo Cloudflare, ví dụ "VN". */
  loc: string | null
  http: string | null
  tls: string | null
  ms: number
}

export interface CloudflareStatus {
  /** `null` khi trang không đi qua Cloudflare (localhost, host khác). */
  edge: EdgeTrace | null
  /** `null` khi không lấy được từ cloudflarestatus.com. */
  global: StatuspageSummary | null
  globalError: string | null
}

/**
 * Mọi site sau Cloudflare đều trả `/cdn-cgi/trace` trên chính tên miền của
 * nó. Chạy local thì Vite trả index.html, không có dòng `colo=` → null.
 */
async function probeEdge(): Promise<EdgeTrace | null> {
  const start = performance.now()
  try {
    const res = await fetch('/cdn-cgi/trace', { cache: 'no-store' })
    const text = await res.text()
    const ms = Math.round(performance.now() - start)
    const fields = new Map(
      text
        .split('\n')
        .map((line) => line.split('='))
        .filter((parts) => parts.length === 2)
        .map(([k, v]) => [k.trim(), v.trim()] as const),
    )
    const colo = fields.get('colo')
    if (!res.ok || !colo) return null
    return {
      colo,
      loc: fields.get('loc') ?? null,
      http: fields.get('http') ?? null,
      tls: fields.get('tls') ?? null,
      ms,
    }
  } catch {
    return null
  }
}

export async function probeCloudflare(): Promise<CloudflareStatus> {
  const [edge, global] = await Promise.all([
    probeEdge(),
    trySummary('https://www.cloudflarestatus.com'),
  ])
  return { edge, global: global.summary, globalError: global.error }
}
