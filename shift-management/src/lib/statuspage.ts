import { delay } from './network'

/**
 * Đọc trang trạng thái dựng bằng Atlassian Statuspage (cloudflarestatus.com,
 * netlifystatus.com, …). API công khai, cho phép CORS.
 */

/** Một request treo quá ngần này thì bỏ, để lượt kiểm tra không kẹt mãi. */
const TIMEOUT_MS = 10_000
/** Hỏng thì chờ ngần này rồi thử lại một lần trong cùng lượt. */
const RETRY_DELAY_MS = 1_500
/**
 * Một lượt (mở trang / bấm Kiểm tra lại) mà hỏng, trong khi lượt ngay trước
 * còn lấy được, thì vẫn hiện kết quả trước — mạng chập chờn một nhịp (Wi-Fi
 * nối lại, máy vừa thức dậy, đổi VPN) không đáng để thẻ nhảy đỏ. Hỏng liền hai
 * lượt, hoặc kết quả trước đã cũ hơn ngần này, mới báo "unreachable".
 */
const STALE_MAX_MS = 90_000

export interface StatuspageIncident {
  name: string
  /** none | minor | major | critical */
  impact: string
  url: string
}

export interface StatuspageSummary {
  /** none | minor | major | critical | maintenance */
  indicator: string
  /** Mô tả gốc tiếng Anh, ví dụ "All Systems Operational". */
  description: string
  incidents: StatuspageIncident[]
}

export async function fetchStatuspage(
  baseUrl: string,
): Promise<StatuspageSummary> {
  const init: RequestInit = { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) }
  const [statusRes, incidentsRes] = await Promise.all([
    fetch(`${baseUrl}/api/v2/status.json`, init),
    fetch(`${baseUrl}/api/v2/incidents/unresolved.json`, init),
  ])
  if (!statusRes.ok) throw new Error(`HTTP ${statusRes.status}`)
  const status = (await statusRes.json()) as {
    status: { indicator: string; description: string }
  }
  const incidents = incidentsRes.ok
    ? ((await incidentsRes.json()) as {
        incidents: { name: string; impact: string; shortlink: string }[]
      }).incidents
    : []
  return {
    indicator: status.status.indicator,
    description: status.status.description,
    incidents: incidents.map((i) => ({
      name: i.name,
      impact: i.impact,
      url: i.shortlink,
    })),
  }
}

/** Kết quả gần nhất lấy được của từng trang, và số lượt hỏng liền sau đó. */
const lastGood = new Map<string, { summary: StatuspageSummary; at: number }>()
const failedRounds = new Map<string, number>()

/**
 * Chạy `fetchStatuspage` nhưng không ném lỗi — lỗi trả về dạng chuỗi. Hỏng
 * thì thử lại một lần; cả lượt vẫn hỏng thì xem `STALE_MAX_MS`.
 */
export async function trySummary(
  baseUrl: string,
): Promise<{ summary: StatuspageSummary | null; error: string | null }> {
  let error = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await delay(RETRY_DELAY_MS)
    try {
      const summary = await fetchStatuspage(baseUrl)
      lastGood.set(baseUrl, { summary, at: Date.now() })
      failedRounds.set(baseUrl, 0)
      return { summary, error: null }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }
  const failed = (failedRounds.get(baseUrl) ?? 0) + 1
  failedRounds.set(baseUrl, failed)
  const prev = lastGood.get(baseUrl)
  if (prev && failed < 2 && Date.now() - prev.at < STALE_MAX_MS) {
    return { summary: prev.summary, error: null }
  }
  return { summary: null, error }
}
