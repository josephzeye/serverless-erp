import {
  fetch as undiciFetch,
  ProxyAgent,
  type RequestInit as UndiciRequestInit,
} from "undici";

const DEFAULT_RETRIES = 3;
const BASE_DELAY_MS = 400;

function getProxyUrl(): string | undefined {
  return process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
}

function isRetryableFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const msg = err.message.toLowerCase();
  const cause =
    err.cause instanceof Error ? err.cause.message.toLowerCase() : "";
  return (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    cause.includes("econnreset") ||
    cause.includes("etimedout") ||
    cause.includes("connect")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatFetchError(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }
  const cause =
    err.cause instanceof Error ? err.cause.message : undefined;
  const parts = [err.message];
  if (cause) {
    parts.push(`cause: ${cause}`);
  }
  if (isRetryableFetchError(err)) {
    parts.push(
      "hint: check VPN/TUN or set HTTPS_PROXY=http://127.0.0.1:7890 in .env.local",
    );
  }
  return parts.join(" | ");
}

/**
 * Fetch wrapper for server-side Supabase / external APIs.
 * - Respects HTTPS_PROXY / HTTP_PROXY via undici ProxyAgent
 * - Retries transient network failures
 */
export async function proxyFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const proxyUrl = getProxyUrl();
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

  let lastError: unknown;

  for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt++) {
    try {
      const undiciInit = {
        ...(init ?? {}),
        body: init?.body === null ? undefined : init?.body,
        dispatcher,
      } as UndiciRequestInit;

      const response = await undiciFetch(input as string, undiciInit);
      return response as unknown as Response;
    } catch (err) {
      lastError = err;
      if (!isRetryableFetchError(err) || attempt === DEFAULT_RETRIES) {
        break;
      }
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
    }
  }

  throw new Error(formatFetchError(lastError));
}

/** Singleton fetch fn for Supabase client `global.fetch` option */
export const supabaseFetch: typeof fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => proxyFetch(input, init);
