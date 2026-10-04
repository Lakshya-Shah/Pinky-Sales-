-- Migration 064: Link Branch Shops to Warehouse Customers for Inter-Branch Billing
BEGIN;

-- 1. Add customer_id to shops table (references customers table)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shops' AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE shops ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Add branch_shop_id to customers table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'branch_shop_id'
  ) THEN
    ALTER TABLE customers ADD COLUMN branch_shop_id INTEGER REFERENCES shops(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_shops_customer_id ON shops(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_branch_shop_id ON customers(branch_shop_id);

-- 3. Match and link existing branch shops to warehouse customers
-- A. Match by normalized name (ignoring spaces and case, e.g. "PS 2" matches "PS2")
UPDATE shops sh
SET customer_id = c.id
FROM customers c
WHERE sh.location_type != 'warehouse'
  AND sh.customer_id IS NULL
  AND LOWER(REPLACE(c.name, ' ', '')) = LOWER(REPLACE(sh.name, ' ', ''));

-- Update reverse link
UPDATE customers c
SET branch_shop_id = sh.id
FROM shops sh
WHERE sh.customer_id = c.id
  AND c.branch_shop_id IS NULL;

-- B. Match "AS" shop to "AS STORE"
UPDATE shops sh
SET customer_id = c.id
FROM customers c
WHERE sh.location_type != 'warehouse'
  AND sh.customer_id IS NULL
  AND LOWER(TRIM(sh.name)) = 'as'
  AND (
    LOWER(c.name) LIKE '%as%store%'
    OR LOWER(c.name) = 'as'
    OR LOWER(c.address) LIKE '%poddar%'
    OR LOWER(c.address) LIKE '%podar%'
  );

UPDATE customers c
SET branch_shop_id = sh.id
FROM shops sh
WHERE sh.customer_id = c.id
  AND c.branch_shop_id IS NULL;

-- C. Match by phone if phone is populated and unique
UPDATE shops sh
SET customer_id = c.id
FROM customers c
WHERE sh.location_type != 'warehouse'
  AND sh.customer_id IS NULL
  AND sh.phone IS NOT NULL
  AND sh.phone != ''
  AND c.mobile = sh.phone;

UPDATE customers c
SET branch_shop_id = sh.id
FROM shops sh
WHERE sh.customer_id = c.id
  AND c.branch_shop_id IS NULL;

-- D. Match by Area / Address if not yet linked
UPDATE shops sh
SET customer_id = c.id
FROM customers c
WHERE sh.location_type != 'warehouse'
  AND sh.customer_id IS NULL
  AND sh.area IS NOT NULL
  AND sh.area != ''
  AND LOWER(TRIM(c.address)) = LOWER(TRIM(sh.area));

UPDATE customers c
SET branch_shop_id = sh.id
FROM shops sh
WHERE sh.customer_id = c.id
  AND c.branch_shop_id IS NULL;

-- E. Ensure any unlinked non-warehouse branch gets an automatic customer in warehouse
DO $$
DECLARE
  wh_id INTEGER;
  sh RECORD;
  new_cust_id INTEGER;
BEGIN
  SELECT id INTO wh_id FROM shops WHERE location_type = 'warehouse' ORDER BY id LIMIT 1;
  IF wh_id IS NOT NULL THEN
    FOR sh IN (SELECT * FROM shops WHERE location_type != 'warehouse' AND customer_id IS NULL) LOOP
      -- Check if customer already exists for this shop
      SELECT id INTO new_cust_id FROM customers WHERE branch_shop_id = sh.id LIMIT 1;
      IF new_cust_id IS NULL THEN
        INSERT INTO customers (shop_id, name, mobile, address, notes, customer_type, branch_shop_id)
        VALUES (wh_id, sh.name, COALESCE(sh.phone, ''), COALESCE(sh.area, ''), 'Automated branch customer account for warehouse billing', 'wholesaler', sh.id)
        RETURNING id INTO new_cust_id;
      END IF;

      UPDATE shops SET customer_id = new_cust_id WHERE id = sh.id;
    END LOOP;
  END IF;
END $$;

COMMIT;
