-- Add per-SKU supplier unit cost for profit calculation (3NF — cost lives with inventory)
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS unit_supplier_cost NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (unit_supplier_cost >= 0);

COMMENT ON COLUMN public.inventory.unit_supplier_cost IS
  'Supplier wholesale cost per unit in BASE_CURRENCY (USD) for financial_logs calculation';

-- Seed realistic supplier costs for demo SKUs
UPDATE public.inventory SET unit_supplier_cost = 12.50 WHERE sku = 'SKU-001';
UPDATE public.inventory SET unit_supplier_cost = 8.00  WHERE sku = 'SKU-002';
UPDATE public.inventory SET unit_supplier_cost = 3.50  WHERE sku = 'SKU-003';
