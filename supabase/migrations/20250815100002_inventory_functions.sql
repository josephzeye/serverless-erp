-- =============================================================================
-- Migration: Inventory Concurrency Functions (FOR UPDATE)
-- Prevents race conditions during stock reservation and fulfillment deduction
-- =============================================================================

-- -----------------------------------------------------------------------------
-- reserve_inventory — lock row, validate available stock, increment reserved
-- Called when a new order is accepted (webhook handler)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_inventory(
  p_sku      TEXT,
  p_quantity INTEGER
)
RETURNS public.inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   public.inventory;
  v_avail INTEGER;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive, got %', p_quantity;
  END IF;

  SELECT * INTO v_row
  FROM public.inventory
  WHERE sku = p_sku
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU not found: %', p_sku;
  END IF;

  v_avail := v_row.local_stock - v_row.reserved_stock;

  IF v_avail < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock for SKU % (available: %, requested: %)',
      p_sku, v_avail, p_quantity;
  END IF;

  UPDATE public.inventory
  SET
    reserved_stock = reserved_stock + p_quantity,
    updated_at     = NOW()
  WHERE sku = p_sku
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- -----------------------------------------------------------------------------
-- fulfill_inventory_deduction — ship: reduce local + reserved atomically
-- Called when order is fulfilled / tracking confirmed
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fulfill_inventory_deduction(
  p_sku      TEXT,
  p_quantity INTEGER
)
RETURNS public.inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.inventory;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive, got %', p_quantity;
  END IF;

  SELECT * INTO v_row
  FROM public.inventory
  WHERE sku = p_sku
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU not found: %', p_sku;
  END IF;

  IF v_row.reserved_stock < p_quantity THEN
    RAISE EXCEPTION 'Reserved stock insufficient for SKU % (reserved: %, requested: %)',
      p_sku, v_row.reserved_stock, p_quantity;
  END IF;

  UPDATE public.inventory
  SET
    local_stock    = local_stock - p_quantity,
    reserved_stock = reserved_stock - p_quantity,
    updated_at     = NOW()
  WHERE sku = p_sku
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- -----------------------------------------------------------------------------
-- release_inventory_reservation — cancel: return reserved stock
-- Called on order cancellation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_inventory_reservation(
  p_sku      TEXT,
  p_quantity INTEGER
)
RETURNS public.inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.inventory;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive, got %', p_quantity;
  END IF;

  SELECT * INTO v_row
  FROM public.inventory
  WHERE sku = p_sku
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU not found: %', p_sku;
  END IF;

  IF v_row.reserved_stock < p_quantity THEN
    RAISE EXCEPTION 'Cannot release more than reserved for SKU %', p_sku;
  END IF;

  UPDATE public.inventory
  SET
    reserved_stock = reserved_stock - p_quantity,
    updated_at     = NOW()
  WHERE sku = p_sku
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Grant execute to service_role (API routes use admin client)
REVOKE ALL ON FUNCTION public.reserve_inventory(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fulfill_inventory_deduction(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_inventory_reservation(TEXT, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reserve_inventory(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_inventory_deduction(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_inventory_reservation(TEXT, INTEGER) TO service_role;

COMMENT ON FUNCTION public.reserve_inventory IS
  'Atomically reserve stock using FOR UPDATE row lock';
COMMENT ON FUNCTION public.fulfill_inventory_deduction IS
  'Deduct local and reserved stock on shipment';
COMMENT ON FUNCTION public.release_inventory_reservation IS
  'Release reserved stock on order cancellation';
