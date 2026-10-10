-- Migration 066: Fix Store Credit & Customer Advance Accounting Invariants
-- Excludes internal store_credit adjustment payments from double-crediting customer ledger
-- and resynchronizes customer current_balance and advance_balance across the database.

BEGIN;

-- 1. Reconcile Customer 15 (JAGDISHBHAI) specifically:
-- Customer had ₹6,99,990.00 Cr advance prior to Invoice #INV-000658 (₹14,800.00).
-- After applying ₹14,800.00 to the invoice, available advance must lessen to ₹6,85,190.00 Cr.
UPDATE customers 
SET current_balance = -685190.00,
    advance_balance = 685190.00
WHERE id = 15;

-- 2. Resynchronize all customer balances where internal store_credit or advance adjustments
-- caused divergence between physical table balances and mathematical ledger truth.
-- Invariant: Opening balance is immutable. Real payments exclude credit_note and store_credit.
WITH customer_calc AS (
  SELECT 
    c.id,
    (
      COALESCE(c.opening_balance, 0)
      + COALESCE((
          SELECT SUM(COALESCE(NULLIF(s.current_invoice_total, 0), s.total_amount)) 
          FROM sales s 
          WHERE s.customer_id = c.id AND s.status NOT IN ('cancelled', 'void')
        ), 0)
      - COALESCE((
          SELECT SUM(pm.amount) 
          FROM payments pm 
          WHERE pm.customer_id = c.id 
            AND pm.reversed_at IS NULL 
            AND COALESCE(pm.payment_mode, '') NOT IN ('credit_note', 'store_credit')
        ), 0)
      - COALESCE((
          SELECT SUM(cn.amount) 
          FROM credit_notes cn 
          WHERE cn.customer_id = c.id 
            AND cn.status != 'cancelled'
        ), 0)
    ) AS net_bal
  FROM customers c
)
UPDATE customers c
SET current_balance = cc.net_bal,
    advance_balance = GREATEST(0, -1 * cc.net_bal)
FROM customer_calc cc
WHERE c.id = cc.id
  AND (c.current_balance != cc.net_bal OR c.advance_balance != GREATEST(0, -1 * cc.net_bal));

COMMIT;
