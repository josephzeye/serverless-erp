import { createAdminClient } from "@/lib/supabase/admin";
import { proxyFetch } from "@/lib/network/proxy-fetch";

export interface SupabaseDiagnostics {
  configured: boolean;
  url?: string;
  network: {
    reachable: boolean;
    latencyMs?: number;
    error?: string;
    hint?: string;
  };
  query: {
    ok: boolean;
    orderCount?: number;
    error?: string;
  };
}

export async function diagnoseSupabase(): Promise<SupabaseDiagnostics> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return {
      configured: false,
      network: {
        reachable: false,
        error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      },
      query: { ok: false, error: "Not configured" },
    };
  }

  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await proxyFetch(`${url}/rest/v1/`, {
      method: "HEAD",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timer);

    const network = {
      reachable: res.ok || res.status === 404 || res.status === 401,
      latencyMs: Date.now() - start,
    };

    try {
      const supabase = createAdminClient();
      const { count, error } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true });

      if (error) {
        return {
          configured: true,
          url,
          network,
          query: { ok: false, error: error.message },
        };
      }

      return {
        configured: true,
        url,
        network,
        query: { ok: true, orderCount: count ?? 0 },
      };
    } catch (err) {
      return {
        configured: true,
        url,
        network,
        query: {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      configured: true,
      url,
      network: {
        reachable: false,
        latencyMs: Date.now() - start,
        error: msg,
        hint:
          "Cannot reach Supabase. Enable VPN/TUN or set HTTPS_PROXY in .env.local",
      },
      query: { ok: false, error: msg },
    };
  }
}
