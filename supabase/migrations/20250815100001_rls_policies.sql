-- =============================================================================
-- Migration: Row Level Security Policies
-- Authenticated dashboard users → read-only
-- Service role (webhooks/cron) → bypasses RLS automatically
-- =============================================================================

ALTER TABLE public.webhook_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fulfillments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_logs   ENABLE ROW LEVEL SECURITY;

-- Revoke direct anon access; authenticated + service_role only
REVOKE ALL ON public.webhook_events FROM anon;
REVOKE ALL ON public.orders FROM anon;
REVOKE ALL ON public.order_items FROM anon;
REVOKE ALL ON public.inventory FROM anon;
REVOKE ALL ON public.fulfillments FROM anon;
REVOKE ALL ON public.financial_logs FROM anon;
REVOKE ALL ON public.v_inventory_alerts FROM anon;

GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.order_items TO authenticated;
GRANT SELECT ON public.inventory TO authenticated;
GRANT SELECT ON public.fulfillments TO authenticated;
GRANT SELECT ON public.financial_logs TO authenticated;
GRANT SELECT ON public.v_inventory_alerts TO authenticated;

-- webhook_events: no authenticated access (service role only via admin client)
GRANT ALL ON public.webhook_events TO service_role;

GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.order_items TO service_role;
GRANT ALL ON public.inventory TO service_role;
GRANT ALL ON public.fulfillments TO service_role;
GRANT ALL ON public.financial_logs TO service_role;

-- -----------------------------------------------------------------------------
-- SELECT policies for authenticated dashboard users
-- -----------------------------------------------------------------------------
CREATE POLICY "authenticated_select_orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_select_order_items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_select_inventory"
  ON public.inventory FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_select_fulfillments"
  ON public.fulfillments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_select_financial_logs"
  ON public.financial_logs FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for authenticated → writes go through
-- service_role in API routes (webhooks, cron, server actions).
