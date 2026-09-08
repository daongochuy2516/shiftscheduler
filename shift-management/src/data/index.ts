import { hasSupabaseConfig } from '../lib/supabaseClient'
import type { SchedulerBackend } from './backend'
import { mockBackend } from './mockBackend'
import { supabaseBackend } from './supabaseBackend'

/**
 * The active data backend: Supabase when `.env` is configured, otherwise the
 * in-memory mock so the app still runs for anyone without credentials.
 */
export const backend: SchedulerBackend = hasSupabaseConfig
  ? supabaseBackend
  : mockBackend

/** Drives the "running on mock data" banner and the login-page hints. */
export const IS_MOCK_BACKEND: boolean = !hasSupabaseConfig

export type { SchedulerBackend } from './backend'
