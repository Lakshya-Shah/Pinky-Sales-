-- Migration 065: Reconcile Branch Shops to Real Warehouse Customers with Sales
-- Ensures branch shops like PS2 link to their real customer profile (e.g. 'PS 2') that holds historical bills

-- 1. For each branch shop, find the best matching customer.
-- Prioritize customers that actually have existing sales / invoices.
UPDATE shops sh
SET customer_id = best_match.customer_id
FROM (
  SELECT DISTINCT ON (sh_sub.id)
    sh_sub.id AS shop_id,
    c.id AS customer_id,
    (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status NOT IN ('cancelled', 'void')) AS sales_count
  FROM shops sh_sub
  JOIN customers c ON (
    REGEXP_REPLACE(LOWER(c.name), '[^a-z0-9]', '', 'g') = REGEXP_REPLACE(LOWER(sh_sub.name), '[^a-z0-9]', '', 'g')
    OR (LOWER(sh_sub.name) LIKE '%ps%2%' AND (LOWER(c.name) LIKE '%ps%2%' OR LOWER(c.name) LIKE '%ps2%'))
    OR (LOWER(sh_sub.name) LIKE '%ps%1%' AND (LOWER(c.name) LIKE '%ps%1%' OR LOWER(c.name) LIKE '%ps1%'))
    OR (LOWER(sh_sub.name) = 'as' AND (LOWER(c.name) LIKE '%as%store%' OR LOWER(c.address) LIKE '%poddar%' OR LOWER(c.address) LIKE '%podar%'))
    OR (sh_sub.phone IS NOT NULL AND sh_sub.phone != '' AND c.mobile = sh_sub.phone)
    OR (sh_sub.area IS NOT NULL AND sh_sub.area != '' AND LOWER(TRIM(c.address)) = LOWER(TRIM(sh_sub.area)))
  )
  WHERE sh_sub.location_type != 'warehouse'
  ORDER BY 
    sh_sub.id,
    (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status NOT IN ('cancelled', 'void')) DESC,
    CASE 
      WHEN REGEXP_REPLACE(LOWER(c.name), '[^a-z0-9]', '', 'g') = REGEXP_REPLACE(LOWER(sh_sub.name), '[^a-z0-9]', '', 'g') THEN 0
      WHEN c.branch_shop_id = sh_sub.id THEN 1
      ELSE 2
    END,
    c.id ASC
) best_match
WHERE sh.id = best_match.shop_id
  AND (
    sh.customer_id IS NULL 
    OR (
      -- If current shop customer_id has 0 sales, but best_match has sales > 0, switch to best_match
      best_match.sales_count > 0 
      AND (SELECT COUNT(*) FROM sales s WHERE s.customer_id = sh.customer_id AND s.status NOT IN ('cancelled', 'void')) = 0
    )
  );

-- 2. Update reverse link branch_shop_id on customers table
UPDATE customers c
SET branch_shop_id = sh.id
FROM shops sh
WHERE sh.customer_id = c.id
  AND (c.branch_shop_id IS NULL OR c.branch_shop_id != sh.id);

-- 3. Clean up unreferenced automated dummy customers created previously that have 0 sales and 0 payments
DELETE FROM customers c
WHERE c.notes LIKE '%Automated branch customer account%'
  AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.customer_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.customer_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM shops sh WHERE sh.customer_id = c.id);
