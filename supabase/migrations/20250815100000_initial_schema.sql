-- =============================================================================
-- Migration: Initial 3NF Schema
-- Serverless E-commerce ERP — orders, inventory, fulfillments, financial_logs
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
CREATE TYPE public.fulfillment_status AS ENUM (
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'failed'
);

CREATE TYPE public.currency_code AS ENUM (
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'CNY'
);

-- -----------------------------------------------------------------------------
-- Utility: auto-update updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- webhook_events — idempotency guard for Shopify webhooks
-- -----------------------------------------------------------------------------
CREATE TABLE public.webhook_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_webhook_id TEXT     NOT NULL,
  topic           TEXT        NOT NULL,
  shopify_order_id BIGINT,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT webhook_events_shopify_webhook_id_key UNIQUE (shopify_webhook_id)
);

CREATE INDEX idx_webhook_events_order_id
  ON public.webhook_events (shopify_order_id)
  WHERE shopify_order_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------
CREATE TABLE public.orders (
  id                  UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id    BIGINT                NOT NULL,
  order_number        TEXT                  NOT NULL,
  currency            public.currency_code  NOT NULL DEFAULT 'USD',
  total_price         NUMERIC(12, 2)        NOT NULL CHECK (total_price >= 0),
  fulfillment_status  public.fulfillment_status NOT NULL DEFAULT 'pending',
  shipping_address    JSONB                 NOT NULL DEFAULT '{}'::JSONB,
  customer_email      TEXT,
  created_at          TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  CONSTRAINT orders_shopify_order_id_key UNIQUE (shopify_order_id)
);

CREATE INDEX idx_orders_fulfillment_status ON public.orders (fulfillment_status);
CREATE INDEX idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX idx_orders_order_number ON public.orders (order_number);

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- order_items — normalized line items (3NF)
-- -----------------------------------------------------------------------------
CREATE TABLE public.order_items (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID          NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  sku           TEXT          NOT NULL,
  quantity      INTEGER       NOT NULL CHECK (quantity > 0),
  unit_price    NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  product_title TEXT          NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX idx_order_items_sku ON public.order_items (sku);

-- -----------------------------------------------------------------------------
-- inventory — virtual stock pool keyed by SKU
-- -----------------------------------------------------------------------------
CREATE TABLE public.inventory (
  sku                 TEXT          PRIMARY KEY,
  product_name        TEXT          NOT NULL,
  local_stock         INTEGER       NOT NULL DEFAULT 0 CHECK (local_stock >= 0),
  supplier_stock      INTEGER       NOT NULL DEFAULT 0 CHECK (supplier_stock >= 0),
  reserved_stock      INTEGER       NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0),
  low_stock_threshold INTEGER       NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_reserved_lte_local CHECK (reserved_stock <= local_stock)
);

CREATE INDEX idx_inventory_low_stock
  ON public.inventory ((local_stock - reserved_stock))
  WHERE (local_stock - reserved_stock) <= low_stock_threshold;

CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- fulfillments — tracking synced back to Shopify
-- -----------------------------------------------------------------------------
CREATE TABLE public.fulfillments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID        NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  tracking_number   TEXT        NOT NULL,
  carrier           TEXT        NOT NULL DEFAULT '',
  synced_to_shopify BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fulfillments_order_id ON public.fulfillments (order_id);
CREATE INDEX idx_fulfillments_pending_sync
  ON public.fulfillments (created_at)
  WHERE synced_to_shopify = FALSE;

CREATE TRIGGER trg_fulfillments_updated_at
  BEFORE UPDATE ON public.fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- financial_logs — per-order profit (one row per order)
-- -----------------------------------------------------------------------------
CREATE TABLE public.financial_logs (
  id             UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID                  NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  gross_amount   NUMERIC(12, 2)        NOT NULL CHECK (gross_amount >= 0),
  supplier_cost  NUMERIC(12, 2)        NOT NULL DEFAULT 0 CHECK (supplier_cost >= 0),
  platform_fee   NUMERIC(12, 2)        NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  net_profit     NUMERIC(12, 2)        NOT NULL,
  exchange_rate  NUMERIC(10, 6)        NOT NULL DEFAULT 1.0 CHECK (exchange_rate > 0),
  base_currency  public.currency_code  NOT NULL DEFAULT 'USD',
  created_at     TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  CONSTRAINT financial_logs_order_id_key UNIQUE (order_id)
);

CREATE INDEX idx_financial_logs_created_at ON public.financial_logs (created_at DESC);

-- -----------------------------------------------------------------------------
-- Dashboard helper view
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_inventory_alerts AS
SELECT
  sku,
  product_name,
  (local_stock - reserved_stock) AS available_stock,
  low_stock_threshold AS threshold
FROM public.inventory
WHERE (local_stock - reserved_stock) <= low_stock_threshold;

COMMENT ON TABLE public.orders IS 'Shopify orders ingested via webhook — one row per shopify_order_id';
COMMENT ON TABLE public.webhook_events IS 'Idempotency ledger for X-Shopify-Webhook-Id deduplication';
