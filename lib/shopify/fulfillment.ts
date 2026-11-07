import { shopifyGraphQL } from "@/lib/shopify/client";
import type { ShopifyGraphQLResponse } from "@/types";

const ORDER_FULFILLMENT_ORDERS_QUERY = `
  query OrderFulfillmentOrders($id: ID!) {
    order(id: $id) {
      id
      name
      fulfillmentOrders(first: 10) {
        edges {
          node {
            id
            status
            lineItems(first: 50) {
              edges {
                node {
                  id
                  remainingQuantity
                }
              }
            }
          }
        }
      }
    }
  }
`;

const FULFILLMENT_CREATE_V2_MUTATION = `
  mutation FulfillmentCreateV2($fulfillment: FulfillmentV2Input!, $message: String) {
    fulfillmentCreateV2(fulfillment: $fulfillment, message: $message) {
      fulfillment {
        id
        status
        trackingInfo {
          company
          number
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface FulfillmentOrderLineItemNode {
  id: string;
  remainingQuantity: number;
}

interface FulfillmentOrderNode {
  id: string;
  status: string;
  lineItems: {
    edges: Array<{ node: FulfillmentOrderLineItemNode }>;
  };
}

interface OrderFulfillmentOrdersResponse {
  order: {
    id: string;
    name: string;
    fulfillmentOrders: {
      edges: Array<{ node: FulfillmentOrderNode }>;
    };
  } | null;
}

interface FulfillmentCreateV2Response {
  fulfillmentCreateV2: {
    fulfillment: {
      id: string;
      status: string;
      trackingInfo: Array<{ company: string; number: string }>;
    } | null;
    userErrors: Array<{ field: string[]; message: string }>;
  };
}

export interface CreateShopifyFulfillmentInput {
  shopifyOrderId: number;
  trackingNumber: string;
  carrier: string;
  notifyCustomer?: boolean;
}

export interface CreateShopifyFulfillmentResult {
  shopifyFulfillmentId: string;
  status: string;
  trackingNumber: string;
  carrier: string;
}

function toOrderGid(shopifyOrderId: number): string {
  return `gid://shopify/Order/${shopifyOrderId}`;
}

function pickOpenFulfillmentOrders(
  nodes: FulfillmentOrderNode[],
): FulfillmentOrderNode[] {
  return nodes.filter(
    (node) =>
      node.status === "OPEN" ||
      node.status === "IN_PROGRESS" ||
      node.status === "SCHEDULED",
  );
}

/**
 * Create Shopify fulfillment with tracking via fulfillmentCreateV2.
 * Uses open fulfillment orders and fulfills all remaining line items.
 */
export async function createShopifyFulfillment(
  input: CreateShopifyFulfillmentInput,
): Promise<CreateShopifyFulfillmentResult> {
  const orderGid = toOrderGid(input.shopifyOrderId);

  const orderResponse = await shopifyGraphQL<OrderFulfillmentOrdersResponse>(
    ORDER_FULFILLMENT_ORDERS_QUERY,
    { id: orderGid },
  );

  if (orderResponse.errors?.length) {
    throw new Error(
      orderResponse.errors.map((e) => e.message).join(", "),
    );
  }

  const order = orderResponse.data?.order;
  if (!order) {
    throw new Error(`Shopify order not found: ${input.shopifyOrderId}`);
  }

  const fulfillmentOrders = pickOpenFulfillmentOrders(
    order.fulfillmentOrders.edges.map((edge) => edge.node),
  );

  if (fulfillmentOrders.length === 0) {
    return {
      shopifyFulfillmentId: `already-fulfilled-${input.shopifyOrderId}`,
      status: "SUCCESS",
      trackingNumber: input.trackingNumber,
      carrier: input.carrier.trim() || "Other",
    };
  }

  const lineItemsByFulfillmentOrder = fulfillmentOrders
    .map((fo) => {
      const fulfillmentOrderLineItems = fo.lineItems.edges
        .filter(({ node }) => node.remainingQuantity > 0)
        .map(({ node }) => ({
          id: node.id,
          quantity: node.remainingQuantity,
        }));

      if (fulfillmentOrderLineItems.length === 0) {
        return null;
      }

      return {
        fulfillmentOrderId: fo.id,
        fulfillmentOrderLineItems,
      };
    })
    .filter(
      (
        item,
      ): item is {
        fulfillmentOrderId: string;
        fulfillmentOrderLineItems: Array<{ id: string; quantity: number }>;
      } => item !== null,
    );

  if (lineItemsByFulfillmentOrder.length === 0) {
    // Order may already be fulfilled on Shopify — treat as idempotent success
    return {
      shopifyFulfillmentId: `already-fulfilled-${input.shopifyOrderId}`,
      status: "SUCCESS",
      trackingNumber: input.trackingNumber,
      carrier: input.carrier.trim() || "Other",
    };
  }

  const carrier = input.carrier.trim() || "Other";

  const fulfillmentResponse = await shopifyGraphQL<FulfillmentCreateV2Response>(
    FULFILLMENT_CREATE_V2_MUTATION,
    {
      fulfillment: {
        lineItemsByFulfillmentOrder,
        trackingInfo: {
          number: input.trackingNumber,
          company: carrier,
        },
        notifyCustomer: input.notifyCustomer ?? true,
      },
      message: "Your order has been shipped.",
    },
  );

  if (fulfillmentResponse.errors?.length) {
    throw new Error(
      fulfillmentResponse.errors.map((e) => e.message).join(", "),
    );
  }

  const result = fulfillmentResponse.data?.fulfillmentCreateV2;
  const userErrors = result?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(
      userErrors.map((e) => e.message).join(", "),
    );
  }

  const fulfillment = result?.fulfillment;
  if (!fulfillment) {
    throw new Error("Shopify returned no fulfillment object");
  }

  const tracking = fulfillment.trackingInfo[0];

  return {
    shopifyFulfillmentId: fulfillment.id,
    status: fulfillment.status,
    trackingNumber: tracking?.number ?? input.trackingNumber,
    carrier: tracking?.company ?? carrier,
  };
}

/** Type guard helper for tests */
export function isGraphQLErrorResponse<T>(
  response: ShopifyGraphQLResponse<T>,
): boolean {
  return Boolean(response.errors?.length);
}
