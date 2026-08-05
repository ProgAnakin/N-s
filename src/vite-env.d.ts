/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  /** The publishable ("anon public") key. Preferred name. */
  readonly VITE_SUPABASE_ANON?: string;
  /** Older name for the same value, still read so existing setups keep working. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
