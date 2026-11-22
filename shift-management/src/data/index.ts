import { hasSupabaseConfig } from '../lib/supabaseClient'
import type { SchedulerBackend } from './backend'
import { mockBackend } from './mockBackend'
import { withOfflineCache } from './offlineBackend'
import { supabaseBackend } from './supabaseBackend'

/**
 * The active data backend: Supabase when `.env` is configured, otherwise the
 * in-memory mock so the app still runs for anyone without credentials.
 * Either way it is wrapped so reads fall back to the on-device copy when the
 * network is gone (offlineBackend.ts).
 */
export const backend: SchedulerBackend = withOfflineCache(
  hasSupabaseConfig ? supabaseBackend : mockBackend,
)

/** Drives the "running on mock data" banner and the login-page hints. */
export const IS_MOCK_BACKEND: boolean = !hasSupabaseConfig

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Chuỗi (thường lấy từ URL) có đúng dạng id của backend đang chạy không.
 * Supabase báo lỗi `invalid input syntax for type uuid` khi gặp id sai dạng,
 * nên link gõ tay / cắt cụt phải bị loại trước khi hỏi máy chủ. Bản mock dùng
 * id kiểu `s-abc123`.
 */
export function isRecordId(id: string | null | undefined): id is string {
  if (!id) return false
  return IS_MOCK_BACKEND ? /^[\w-]{1,64}$/.test(id) : UUID_RE.test(id)
}

export type { SchedulerBackend } from './backend'
