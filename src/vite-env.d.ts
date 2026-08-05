/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  /** The publishable ("anon public") key. */
  readonly VITE_SUPABASE_ANON?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
