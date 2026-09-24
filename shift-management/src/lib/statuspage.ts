/**
 * Đọc trang trạng thái dựng bằng Atlassian Statuspage (cloudflarestatus.com,
 * netlifystatus.com, …). API công khai, cho phép CORS.
 */

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
  const [statusRes, incidentsRes] = await Promise.all([
    fetch(`${baseUrl}/api/v2/status.json`, { cache: 'no-store' }),
    fetch(`${baseUrl}/api/v2/incidents/unresolved.json`, { cache: 'no-store' }),
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

/** Chạy `fetchStatuspage` nhưng không ném lỗi — lỗi trả về dạng chuỗi. */
export async function trySummary(
  baseUrl: string,
): Promise<{ summary: StatuspageSummary | null; error: string | null }> {
  try {
    return { summary: await fetchStatuspage(baseUrl), error: null }
  } catch (err) {
    return {
      summary: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
