import { getSupabase } from './supabaseClient'

export interface ProbeResult {
  ok: boolean
  /** Thời gian khứ hồi, ms. */
  ms: number
  error: string | null
}

export interface SupabaseStatus {
  /** `auth.getUser()` — hỏi thẳng máy chủ Auth, xác thực luôn token hiện tại. */
  auth: ProbeResult
  /** Một truy vấn nhỏ nhất có thể qua REST + RLS. */
  database: ProbeResult
  realtime: {
    connected: boolean
    channels: { topic: string; state: string }[]
  }
  session: {
    /** ms epoch; null khi token không mang hạn. */
    expiresAt: number | null
    lastSignInAt: string | null
    userId: string
  } | null
  checkedAt: number
}

async function timed(run: () => Promise<string | null>): Promise<ProbeResult> {
  const start = performance.now()
  try {
    const error = await run()
    return { ok: error === null, ms: Math.round(performance.now() - start), error }
  } catch (err) {
    return {
      ok: false,
      ms: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function probeSupabase(): Promise<SupabaseStatus> {
  const supabase = getSupabase()

  const [auth, database] = await Promise.all([
    timed(async () => {
      const { error } = await supabase.auth.getUser()
      return error?.message ?? null
    }),
    timed(async () => {
      const { error } = await supabase.from('profiles').select('id').limit(1)
      return error?.message ?? null
    }),
  ])

  const { data } = await supabase.auth.getSession()
  const session = data.session

  return {
    auth,
    database,
    realtime: {
      connected: supabase.realtime.isConnected(),
      channels: supabase.getChannels().map((channel) => ({
        topic: channel.topic.replace(/^realtime:/, ''),
        state: channel.state,
      })),
    },
    session: session
      ? {
          expiresAt: session.expires_at ? session.expires_at * 1000 : null,
          lastSignInAt: session.user.last_sign_in_at ?? null,
          userId: session.user.id,
        }
      : null,
    checkedAt: Date.now(),
  }
}
