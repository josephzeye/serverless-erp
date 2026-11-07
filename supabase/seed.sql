-- Dev seed data — sample SKUs for inventory page & dashboard low-stock alerts
-- Run in Supabase SQL Editor, or: npm run seed:inventory

INSERT INTO public.inventory (
  sku,
  product_name,
  local_stock,
  supplier_stock,
  reserved_stock,
  low_stock_threshold,
  unit_supplier_cost
)
VALUES
  ('SKU-001', 'Wireless Earbuds Pro',           100, 500,  0, 10, 12.50),
  ('SKU-002', 'USB-C Hub 7-in-1',                50, 200,  0,  5,  8.00),
  ('SKU-003', 'Phone Stand Adjustable',             4,  80,  0,  5,  3.50),
  ('SKU-004', 'Portable Charger 10000mAh',       11, 150,  6, 10,  9.75),
  ('SKU-DEMO-001', 'Cross-border Widget (#1001)', 120, 300,  0, 15, 20.00),
  ('SKU-DEMO-002', 'Travel Adapter US (#1002)',    35, 120,  0,  8, 15.00),
  ('VARIANT-4738291029384', 'Shopify Dev Variant (no SKU)', 25, 60, 0, 5, 11.00)
ON CONFLICT (sku) DO UPDATE SET
  product_name        = EXCLUDED.product_name,
  local_stock         = EXCLUDED.local_stock,
  supplier_stock      = EXCLUDED.supplier_stock,
  reserved_stock      = EXCLUDED.reserved_stock,
  low_stock_threshold = EXCLUDED.low_stock_threshold,
  unit_supplier_cost  = EXCLUDED.unit_supplier_cost,
  updated_at          = NOW();
