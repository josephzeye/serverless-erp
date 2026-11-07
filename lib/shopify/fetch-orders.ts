import { shopifyGraphQL } from "@/lib/shopify/client";
import type { ShopifyGraphQLResponse } from "@/types";
import type { ShopifyOrderWebhookPayload, ShopifyWebhookAddress } from "@/types";

/** Default: pull open fulfillment orders only */
const DEFAULT_ORDERS_QUERY =
  "fulfillment_status:unfulfilled OR fulfillment_status:partial";

/**
 * Basic Shopify plan — NO customer PII (email, shippingAddress).
 * Advanced/Plus: set SHOPIFY_INCLUDE_PII=true to use FETCH_ORDERS_QUERY_WITH_PII.
 */
const FETCH_ORDERS_QUERY = `
  query FetchOrders($first: Int!, $query: String, $after: String) {
    orders(first: $first, sortKey: UPDATED_AT, reverse: true, query: $query, after: $after) {
      edges {
        node {
          legacyResourceId
          name
          currencyCode
          displayFulfillmentStatus
          createdAt
          updatedAt
          totalPriceSet {
            shopMoney {
              amount
            }
          }
          lineItems(first: 50) {
            edges {
              node {
                sku
                quantity
                title
                variant {
                  legacyResourceId
                }
                originalUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/** Advanced/Plus plans with Protected Customer Data access enabled */
const FETCH_ORDERS_QUERY_WITH_PII = `
  query FetchOrdersWithPii($first: Int!, $query: String, $after: String) {
    orders(first: $first, sortKey: UPDATED_AT, reverse: true, query: $query, after: $after) {
      edges {
        node {
          legacyResourceId
          name
          email
          currencyCode
          displayFulfillmentStatus
          createdAt
          updatedAt
          totalPriceSet {
            shopMoney {
              amount
            }
          }
          shippingAddress {
            firstName
            lastName
            address1
            address2
            city
            province
            country
            zip
            phone
          }
          lineItems(first: 50) {
            edges {
              node {
                sku
                quantity
                title
                variant {
                  legacyResourceId
                }
                originalUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

interface GraphQLMoney {
  amount: string;
}

interface GraphQLAddress {
  firstName: string | null;
  lastName: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zip: string | null;
  phone: string | null;
}

interface GraphQLOrderNodeBase {
  legacyResourceId: string;
  name: string;
  currencyCode: string;
  displayFulfillmentStatus: string;
  createdAt: string;
  updatedAt: string;
  totalPriceSet: { shopMoney: GraphQLMoney };
  lineItems: {
    edges: Array<{
      node: {
        sku: string | null;
        quantity: number;
        title: string;
        variant: { legacyResourceId: string } | null;
        originalUnitPriceSet: { shopMoney: GraphQLMoney };
      };
    }>;
  };
}

interface GraphQLOrderNodeWithPii extends GraphQLOrderNodeBase {
  email: string | null;
  shippingAddress: GraphQLAddress | null;
}

type GraphQLOrderNode = GraphQLOrderNodeBase | GraphQLOrderNodeWithPii;

interface FetchOrdersResponse {
  orders: {
    edges: Array<{ node: GraphQLOrderNode }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

function shouldIncludePii(): boolean {
  return process.env.SHOPIFY_INCLUDE_PII === "true";
}

function isPiiAccessError(message: string): boolean {
  return (
    message.includes("not approved to access") ||
    message.includes("personally identifiable information")
  );
}

/** Map GraphQL displayFulfillmentStatus to REST/webhook-style string */
function mapGraphQLFulfillmentStatus(status: string): string | null {
  switch (status) {
    case "UNFULFILLED":
      return "unfulfilled";
    case "PARTIALLY_FULFILLED":
      return "partial";
    case "FULFILLED":
      return "fulfilled";
    case "RESTOCKED":
      return "restocked";
    default:
      return status.toLowerCase();
  }
}

function mapGraphQLAddress(
  address: GraphQLAddress | null,
): ShopifyWebhookAddress | null {
  if (!address) {
    return null;
  }
  return {
    first_name: address.firstName,
    last_name: address.lastName,
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    province: address.province,
    country: address.country,
    zip: address.zip,
    phone: address.phone,
  };
}

function hasPiiFields(node: GraphQLOrderNode): node is GraphQLOrderNodeWithPii {
  return "email" in node || "shippingAddress" in node;
}

/** Convert GraphQL order node → webhook-compatible payload for shared ingest pipeline */
export function mapGraphQLOrderToPayload(
  node: GraphQLOrderNode,
): ShopifyOrderWebhookPayload {
  const legacyId = Number(node.legacyResourceId);
  const orderNumberMatch = node.name.match(/\d+/);
  const orderNumber = orderNumberMatch
    ? Number(orderNumberMatch[0])
    : legacyId;

  const email = hasPiiFields(node) ? (node.email ?? null) : null;
  const shippingAddress = hasPiiFields(node)
    ? mapGraphQLAddress(node.shippingAddress)
    : null;

  return {
    id: legacyId,
    name: node.name,
    order_number: orderNumber,
    email,
    currency: node.currencyCode,
    total_price: node.totalPriceSet.shopMoney.amount,
    financial_status: "paid",
    fulfillment_status: mapGraphQLFulfillmentStatus(
      node.displayFulfillmentStatus,
    ),
    line_items: node.lineItems.edges.map(({ node: item }, index) => ({
      id: index + 1,
      sku: item.sku,
      quantity: item.quantity,
      price: item.originalUnitPriceSet.shopMoney.amount,
      title: item.title,
      variant_id: item.variant ? Number(item.variant.legacyResourceId) : null,
      product_id: null,
    })),
    shipping_address: shippingAddress,
    created_at: node.createdAt,
    updated_at: node.updatedAt,
  };
}

export interface FetchOrdersOptions {
  first?: number;
  query?: string;
}

async function executeOrdersQuery(
  gqlQuery: string,
  first: number,
  query: string,
  after: string | null,
): Promise<ShopifyOrderWebhookPayload[]> {
  const orders: ShopifyOrderWebhookPayload[] = [];
  let cursor: string | null = after;
  let hasNextPage = true;

  while (hasNextPage) {
    const response: ShopifyGraphQLResponse<FetchOrdersResponse> =
      await shopifyGraphQL<FetchOrdersResponse>(gqlQuery, {
        first,
        query,
        after: cursor,
      });

    if (response.errors?.length) {
      const message = response.errors
        .map((e: { message: string }) => e.message)
        .join(", ");
      throw new Error(message);
    }

    const connection: FetchOrdersResponse["orders"] | undefined =
      response.data?.orders;
    if (!connection) {
      break;
    }

    for (const edge of connection.edges) {
      orders.push(mapGraphQLOrderToPayload(edge.node));
    }

    hasNextPage = connection.pageInfo.hasNextPage;
    cursor = connection.pageInfo.endCursor;

    if (first <= 25) {
      break;
    }
  }

  return orders;
}

/**
 * Fetch orders from Shopify Admin GraphQL API.
 * Defaults to PII-free query (Basic plan compatible).
 */
export async function fetchShopifyOrders(
  options: FetchOrdersOptions = {},
): Promise<ShopifyOrderWebhookPayload[]> {
  const first = options.first ?? 25;
  const query =
    options.query ??
    process.env.SHOPIFY_ORDERS_QUERY ??
    DEFAULT_ORDERS_QUERY;

  const usePii = shouldIncludePii();
  const primaryQuery = usePii ? FETCH_ORDERS_QUERY_WITH_PII : FETCH_ORDERS_QUERY;

  try {
    return await executeOrdersQuery(primaryQuery, first, query, null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Auto-fallback: PII query rejected → retry without PII fields
    if (usePii && isPiiAccessError(message)) {
      console.warn(
        "[fetchShopifyOrders] PII access denied — falling back to Basic plan query",
      );
      return executeOrdersQuery(FETCH_ORDERS_QUERY, first, query, null);
    }

    throw new Error(`Shopify orders query failed: ${message}`);
  }
}

/** Quick shop connectivity check (shop-level fields, not customer PII) */
export async function fetchShopInfo(): Promise<{
  name: string;
  myshopifyDomain: string;
  planDisplayName?: string;
  piiEnabled: boolean;
}> {
  const response = await shopifyGraphQL<{
    shop: {
      name: string;
      myshopifyDomain: string;
      plan?: { displayName: string };
    };
  }>(`{ shop { name myshopifyDomain plan { displayName } } }`);

  if (response.errors?.length || !response.data?.shop) {
    throw new Error(
      response.errors?.map((e) => e.message).join(", ") ??
        "Failed to fetch shop info",
    );
  }

  return {
    name: response.data.shop.name,
    myshopifyDomain: response.data.shop.myshopifyDomain,
    planDisplayName: response.data.shop.plan?.displayName,
    piiEnabled: shouldIncludePii(),
  };
}
