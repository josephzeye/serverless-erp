import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { supabaseFetch } from "@/lib/network/proxy-fetch";
import { requireEnv } from "@/lib/utils";

/**
 * Admin Supabase client — bypasses RLS via service role key.
 *
 * SERVER ONLY — never import in client components or expose to browser.
 * Used by webhook handlers, cron jobs, and server-side batch operations.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      // Prefer pooled connection hint for serverless environments
      db: {
        schema: "public",
      },
      global: {
        fetch: supabaseFetch,
      },
    },
  );
}

/**
 * Returns the PgBouncer pooled Postgres URL for direct SQL when needed.
 * Use in migration scripts or raw transaction blocks (e.g. FOR UPDATE stock).
 */
export function getPooledDatabaseUrl(): string {
  return requireEnv("SUPABASE_POOLED_URL");
}
