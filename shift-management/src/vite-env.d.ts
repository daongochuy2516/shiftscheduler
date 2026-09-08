/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  /** Newer Supabase projects call this the "publishable" key. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Older projects call the same value the "anon public" key. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
