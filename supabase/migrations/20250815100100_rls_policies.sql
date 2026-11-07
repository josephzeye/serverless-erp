-- =============================================================================
-- Migration: Row Level Security Policies
-- authenticated → read-only dashboard access
-- service_role → bypasses RLS (webhooks, cron, admin client)
-- =============================================================================

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (defense in depth)
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fulfillments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financial_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------

CREATE POLICY "orders_select_authenticated"
  ON public.orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "orders_insert_service"
  ON public.orders FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "orders_update_service"
  ON public.orders FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "orders_delete_service"
  ON public.orders FOR DELETE
  TO service_role
  USING (true);

-- -----------------------------------------------------------------------------
-- order_items
-- -----------------------------------------------------------------------------

CREATE POLICY "order_items_select_authenticated"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "order_items_insert_service"
  ON public.order_items FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "order_items_update_service"
  ON public.order_items FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "order_items_delete_service"
  ON public.order_items FOR DELETE
  TO service_role
  USING (true);

-- -----------------------------------------------------------------------------
-- inventory
-- -----------------------------------------------------------------------------

CREATE POLICY "inventory_select_authenticated"
  ON public.inventory FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "inventory_insert_service"
  ON public.inventory FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "inventory_update_service"
  ON public.inventory FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "inventory_delete_service"
  ON public.inventory FOR DELETE
  TO service_role
  USING (true);

-- -----------------------------------------------------------------------------
-- fulfillments
-- -----------------------------------------------------------------------------

CREATE POLICY "fulfillments_select_authenticated"
  ON public.fulfillments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "fulfillments_insert_service"
  ON public.fulfillments FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "fulfillments_update_service"
  ON public.fulfillments FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "fulfillments_delete_service"
  ON public.fulfillments FOR DELETE
  TO service_role
  USING (true);

-- -----------------------------------------------------------------------------
-- financial_logs
-- -----------------------------------------------------------------------------

CREATE POLICY "financial_logs_select_authenticated"
  ON public.financial_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "financial_logs_insert_service"
  ON public.financial_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "financial_logs_update_service"
  ON public.financial_logs FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "financial_logs_delete_service"
  ON public.financial_logs FOR DELETE
  TO service_role
  USING (true);

-- -----------------------------------------------------------------------------
-- webhook_events (service_role only — not exposed to dashboard users)
-- -----------------------------------------------------------------------------

CREATE POLICY "webhook_events_all_service"
  ON public.webhook_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- Views — grant SELECT to authenticated for dashboard RSC queries
-- -----------------------------------------------------------------------------

GRANT SELECT ON public.v_fulfillment_breakdown TO authenticated;
GRANT SELECT ON public.v_low_stock_items TO authenticated;
GRANT SELECT ON public.v_profit_summary TO authenticated;

GRANT SELECT ON public.v_fulfillment_breakdown TO service_role;
GRANT SELECT ON public.v_low_stock_items TO service_role;
GRANT SELECT ON public.v_profit_summary TO service_role;
