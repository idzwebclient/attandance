import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  // Inlined at build time, so read them directly rather than through supabaseEnv().
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
