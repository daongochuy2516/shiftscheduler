import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()

/**
 * Supabase renamed the browser-safe key: newer projects show it as the
 * "publishable" key, older ones as the "anon public" key. Both go in the same
 * slot, so accept either variable name.
 */
const publishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim()

/** True when `.env` carries both values — decides mock vs. real backend. */
export const hasSupabaseConfig = Boolean(url && publishableKey)

let client: SupabaseClient | null = null

/**
 * Lazily builds the singleton client. Only ever called from the Supabase
 * backends, which are themselves only selected when `hasSupabaseConfig`.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!url || !publishableKey) {
      throw new Error(
        'Supabase is not configured. Set VITE_SUPABASE_URL and ' +
          'VITE_SUPABASE_PUBLISHABLE_KEY in shift-management/.env, then ' +
          'restart the dev server.',
      )
    }
    client = createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}
