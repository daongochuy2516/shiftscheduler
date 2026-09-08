import { hasSupabaseConfig } from '../lib/supabaseClient'
import type { AuthBackend } from './backend'
import { mockAuth } from './mockAuth'
import { supabaseAuth } from './supabaseAuth'

/**
 * The active auth backend: Supabase Auth when `.env` is configured, otherwise
 * the mock sign-in against the seeded profiles.
 */
export const auth: AuthBackend = hasSupabaseConfig ? supabaseAuth : mockAuth

export type { AuthBackend } from './backend'
