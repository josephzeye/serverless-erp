import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseFetch } from "@/lib/network/proxy-fetch";
import type { Database } from "@/types/database";

/**
 * Server-side Supabase client for RSC, Server Actions, and Route Handlers.
 * Reads/writes auth cookies for session-aware queries under RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Parameters<typeof cookieStore.set>[2];
          }>,
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from Server Component — cookie writes are no-op
          }
        },
      },
      global: {
        fetch: supabaseFetch,
      },
    },
  );
}
