import type {
  ShopifyGraphQLResponse,
  ShopifyThrottleStatus,
} from "@/types";
import { requireEnv } from "@/lib/utils";

const DEFAULT_MAX_RETRIES = 5;
const BASE_DELAY_MS = 500;

interface ShopifyClientConfig {
  storeDomain: string;
  accessToken: string;
  apiVersion: string;
}

function getConfig(): ShopifyClientConfig {
  return {
    storeDomain: requireEnv("SHOPIFY_STORE_DOMAIN"),
    accessToken: requireEnv("SHOPIFY_ACCESS_TOKEN"),
    apiVersion: process.env.SHOPIFY_API_VERSION ?? "2026-07",
  };
}

function getGraphQLUrl(config: ShopifyClientConfig): string {
  return `https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`;
}

function calculateBackoffMs(
  throttleStatus: ShopifyThrottleStatus | undefined,
  attempt: number,
): number {
  if (throttleStatus && throttleStatus.currentlyAvailable <= 0) {
    const deficit = Math.max(
      1,
      throttleStatus.maximumAvailable - throttleStatus.currentlyAvailable,
    );
    const restoreDelay = (deficit / throttleStatus.restoreRate) * 1000;
    return Math.max(restoreDelay, BASE_DELAY_MS);
  }
  return BASE_DELAY_MS * Math.pow(2, attempt);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const msg = err.message.toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("network") ||
    msg.includes("socket")
  );
}

function formatFetchError(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }
  const cause = err.cause instanceof Error ? ` (${err.cause.message})` : "";
  return `${err.message}${cause}`;
}

/** POST with retry on transient network failures */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries: number,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url, {
        ...init,
        cache: "no-store",
      });
    } catch (err) {
      lastError = err;
      if (isNetworkError(err) && attempt < maxRetries) {
        await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      throw new Error(formatFetchError(err));
    }
  }

  throw new Error(formatFetchError(lastError));
}

/**
 * Execute Shopify Admin GraphQL with throttle-aware + network retry.
 */
export async function shopifyGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
  maxRetries: number = DEFAULT_MAX_RETRIES,
): Promise<ShopifyGraphQLResponse<T>> {
  const config = getConfig();
  const url = getGraphQLUrl(config);

  let lastResponse: ShopifyGraphQLResponse<T> | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": config.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      },
      2,
    );

    if (!response.ok) {
      if (response.status === 429 && attempt < maxRetries) {
        await sleep(calculateBackoffMs(undefined, attempt));
        continue;
      }
      throw new Error(
        `Shopify GraphQL HTTP error: ${response.status} ${response.statusText}`,
      );
    }

    const json = (await response.json()) as ShopifyGraphQLResponse<T>;
    lastResponse = json;

    const throttleStatus = json.extensions?.cost.throttleStatus;
    const isThrottled =
      throttleStatus !== undefined && throttleStatus.currentlyAvailable <= 0;
    const hasGraphQLErrors =
      json.errors?.some((e) =>
        e.message.toLowerCase().includes("throttl"),
      ) ?? false;

    if ((isThrottled || hasGraphQLErrors) && attempt < maxRetries) {
      await sleep(calculateBackoffMs(throttleStatus, attempt));
      continue;
    }

    return json;
  }

  return lastResponse ?? { errors: [{ message: "Max retries exceeded" }] };
}

export const FULFILLMENT_CREATE_MUTATION = `
  mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
    fulfillmentCreate(fulfillment: $fulfillment) {
      fulfillment {
        id
        status
        trackingInfo {
          number
          company
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;
