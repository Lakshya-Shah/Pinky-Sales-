-- Migration 067: Dynamic Final Reconciliation for Customer 15 (JAGDISHBHAI)
-- Dynamically allocates all customer payments (including recent payment of ₹8,62,290.00)
-- across active sales invoices in FIFO order, updates all invoice statuses and
-- carry-forward balances, normalizes payment modes to cash, and synchronizes
-- current_balance and advance_balance to 100% mathematical truth.

BEGIN;

-- 1. Ensure cash payment record exists for legacy Invoice #INV-000036 (₹1,000.00)
DO $$
DECLARE
  p_num TEXT;
  p_id INT;
BEGIN
  SELECT id INTO p_id FROM payments WHERE customer_id = 15 AND sale_id = 36 LIMIT 1;
  IF p_id IS NULL THEN
    p_num := 'PAY-' || LPAD(nextval('payment_number_seq')::TEXT, 6, '0');
    INSERT INTO payments (payment_number, customer_id, sale_id, amount, payment_date, payment_mode, note, shop_id, created_at)
    VALUES (p_num, 15, 36, 1000.00, '2026-08-29', 'cash', 'Cash payment at checkout for INV-000036', 2, '2026-08-30 09:44:06');
  END IF;
END $$;

-- 2. Normalize payment modes: convert any 'store_credit' or NULL to 'cash'
UPDATE payments
SET payment_mode = 'cash',
    note = CASE 
      WHEN sale_id IS NOT NULL AND (note IS NULL OR note LIKE '%Store Credit%') THEN 'Payment for invoice'
      ELSE COALESCE(note, 'Payment received')
    END
WHERE customer_id = 15 AND (payment_mode = 'store_credit' OR payment_mode IS NULL);

-- 3. Clear incorrect advance_applied flags on sales for Customer 15
UPDATE sales
SET advance_applied = 0.00
WHERE customer_id = 15 AND advance_applied > 0;

-- 4. Delete old allocations for customer 15 to perform clean FIFO
DELETE FROM payment_allocations WHERE customer_id = 15;

-- 5. Dynamic FIFO Re-allocation in PL/pgSQL
DO $$
DECLARE
  v_sale RECORD;
  v_pay RECORD;
  v_rem_pay NUMERIC;
  v_inv_pending NUMERIC;
  v_alloc NUMERIC;
BEGIN
  -- Reset paid_amount and pending_amount on all sales for customer 15
  UPDATE sales 
  SET paid_amount = 0.00,
      pending_amount = COALESCE(NULLIF(current_invoice_total, 0), total_amount),
      status = 'open'
  WHERE customer_id = 15 AND status NOT IN ('cancelled', 'void');

  -- Reset unallocated_amount on all payments for customer 15
  UPDATE payments 
  SET unallocated_amount = amount 
  WHERE customer_id = 15 AND reversed_at IS NULL;

  -- First pass: Allocate payments with specific sale_id
  FOR v_pay IN (
    SELECT id, amount, sale_id, payment_number
    FROM payments 
    WHERE customer_id = 15 AND sale_id IS NOT NULL AND reversed_at IS NULL
    ORDER BY COALESCE(payment_date, created_at::date) ASC, id ASC
  ) LOOP
    SELECT COALESCE(NULLIF(current_invoice_total, 0), total_amount) - paid_amount INTO v_inv_pending
    FROM sales WHERE id = v_pay.sale_id;

    IF v_inv_pending > 0 THEN
      v_alloc := LEAST(v_pay.amount, v_inv_pending);
      UPDATE sales 
      SET paid_amount = paid_amount + v_alloc,
          pending_amount = pending_amount - v_alloc,
          status = CASE WHEN pending_amount - v_alloc <= 0 THEN 'paid' ELSE 'partial' END
      WHERE id = v_pay.sale_id;

      UPDATE payments 
      SET unallocated_amount = unallocated_amount - v_alloc 
      WHERE id = v_pay.id;

      INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied, notes, created_at)
      VALUES (v_pay.id, 15, v_pay.sale_id, 'invoice', v_alloc, 'Direct payment allocation', CURRENT_TIMESTAMP);
    END IF;
  END LOOP;

  -- Second pass: Allocate unallocated amounts across unpaid sales in FIFO order
  FOR v_pay IN (
    SELECT id, unallocated_amount, payment_number
    FROM payments 
    WHERE customer_id = 15 AND unallocated_amount > 0 AND reversed_at IS NULL
    ORDER BY COALESCE(payment_date, created_at::date) ASC, id ASC
  ) LOOP
    v_rem_pay := v_pay.unallocated_amount;

    FOR v_sale IN (
      SELECT id, pending_amount, invoice_number
      FROM sales 
      WHERE customer_id = 15 AND pending_amount > 0 AND status NOT IN ('cancelled', 'void')
      ORDER BY COALESCE(invoice_date, sale_date::date, created_at::date) ASC, id ASC
    ) LOOP
      EXIT WHEN v_rem_pay <= 0;

      v_alloc := LEAST(v_rem_pay, v_sale.pending_amount);
      UPDATE sales 
      SET paid_amount = paid_amount + v_alloc,
          pending_amount = pending_amount - v_alloc,
          status = CASE WHEN pending_amount - v_alloc <= 0 THEN 'paid' ELSE 'partial' END
      WHERE id = v_sale.id;

      INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied, notes, created_at)
      VALUES (v_pay.id, 15, v_sale.id, 'invoice', v_alloc, 'FIFO payment allocation', CURRENT_TIMESTAMP);

      v_rem_pay := v_rem_pay - v_alloc;
    END LOOP;

    UPDATE payments SET unallocated_amount = v_rem_pay WHERE id = v_pay.id;
  END LOOP;
END $$;

-- 6. Sequential carry-forward previous_balance update on sales for Customer 15
DO $$
DECLARE
  v_rec RECORD;
  v_carry NUMERIC := 0.00;
  v_total NUMERIC;
  v_net NUMERIC;
  v_closing NUMERIC;
BEGIN
  FOR v_rec IN (
    SELECT id, COALESCE(NULLIF(current_invoice_total, 0), total_amount) AS total, paid_amount
    FROM sales
    WHERE customer_id = 15 AND status NOT IN ('cancelled', 'void')
    ORDER BY COALESCE(invoice_date, sale_date::date, created_at::date) ASC, id ASC
  ) LOOP
    v_total := v_rec.total;
    v_net := v_carry + v_total;
    v_closing := v_net - v_rec.paid_amount;

    UPDATE sales 
    SET previous_balance = v_carry,
        net_payable_amount = v_net,
        closing_balance = v_closing
    WHERE id = v_rec.id;

    v_carry := v_closing;
  END LOOP;
END $$;

-- 7. Remove any spurious OPENING_BALANCE ledger entries for Customer 15
DELETE FROM ledger_entries WHERE customer_id = 15 AND entry_type = 'OPENING_BALANCE';

-- 8. Synchronize Customer 15 balances dynamically from transactions
WITH calc AS (
  SELECT 
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
      ), 0) AS net_bal
  FROM customers c
  WHERE c.id = 15
)
UPDATE customers c
SET opening_balance = 0.00,
    current_balance = calc.net_bal,
    advance_balance = GREATEST(0, -1 * calc.net_bal)
FROM calc
WHERE c.id = 15;

COMMIT;
