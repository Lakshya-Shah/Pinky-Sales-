-- Migration 068: Reset Customer 15 (JAGDISHBHAI) to Sales Invoices Only
-- Sets total paid to 0.00, credit/advance balance to 0.00, cancels credit notes,
-- removes all payment records, resets all sales invoices to open/unpaid,
-- and recomputes sequential invoice balances.

BEGIN;

-- 1. Remove all payment allocations for Customer 15
DELETE FROM payment_allocations WHERE customer_id = 15;

-- 2. Remove any credit note redemptions associated with Customer 15's sales
DELETE FROM credit_note_redemptions WHERE sale_id IN (
  SELECT id FROM sales WHERE customer_id = 15
);

-- 3. Cancel any credit notes issued to Customer 15 so no credit rows exist
UPDATE credit_notes
SET status = 'cancelled'
WHERE customer_id = 15;

-- 4. Delete all payment records for Customer 15
DELETE FROM payments WHERE customer_id = 15;

-- 5. Delete any manual/corrupt ledger entries for Customer 15
DELETE FROM ledger_entries WHERE customer_id = 15;

-- 6. Reset all sales invoices for Customer 15 to open with 0 paid
UPDATE sales
SET paid_amount = 0.00,
    pending_amount = COALESCE(NULLIF(current_invoice_total, 0), total_amount),
    advance_applied = 0.00,
    applied_credit_amount = 0.00,
    status = 'open'
WHERE customer_id = 15 AND status NOT IN ('cancelled', 'void');

-- 7. Recompute carry-forward balances across all active sales chronologically
DO $$
DECLARE
  v_sale RECORD;
  v_running_balance NUMERIC := 0.00;
  v_inv_total NUMERIC;
  v_net_payable NUMERIC;
BEGIN
  FOR v_sale IN (
    SELECT id, COALESCE(NULLIF(current_invoice_total, 0), total_amount) AS inv_total
    FROM sales
    WHERE customer_id = 15 AND status NOT IN ('cancelled', 'void')
    ORDER BY COALESCE(invoice_date::text, sale_date::text, created_at::date::text) ASC, id ASC
  ) LOOP
    v_inv_total := v_sale.inv_total;
    v_net_payable := v_running_balance + v_inv_total;

    UPDATE sales
    SET previous_balance = v_running_balance,
        net_payable_amount = v_net_payable,
        closing_balance = v_net_payable
    WHERE id = v_sale.id;

    v_running_balance := v_net_payable;
  END LOOP;

  -- 8. Synchronize Customer master record
  UPDATE customers
  SET opening_balance = 0.00,
      advance_balance = 0.00,
      current_balance = v_running_balance
  WHERE id = 15;
END $$;

COMMIT;
