-- Migration 069: Remove Credit Note CN-000090 (₹8,400.00) for RAMDEV MOBILE VAPI
-- Deletes credit note and sales returns, reverses inventory batches and redemptions,
-- and reconciles RAMDEV MOBILE VAPI's ledger and customer balances.

BEGIN;

DO $$
DECLARE
  v_cust_id INT;
  v_cn_id INT;
  v_item RECORD;
  v_ob NUMERIC := 0.00;
  v_sales_total NUMERIC := 0.00;
  v_paid_total NUMERIC := 0.00;
  v_cn_total NUMERIC := 0.00;
  v_net NUMERIC := 0.00;
  v_adv NUMERIC := 0.00;
  v_sale RECORD;
  v_carry NUMERIC := 0.00;
BEGIN
  -- 1. Locate Customer RAMDEV MOBILE VAPI
  SELECT id, COALESCE(opening_balance, 0) INTO v_cust_id, v_ob
  FROM customers
  WHERE mobile = '9898068887' OR LOWER(name) LIKE '%ramdev%vapi%'
  LIMIT 1;

  IF v_cust_id IS NULL THEN
    RAISE NOTICE 'RAMDEV MOBILE VAPI customer not found';
    RETURN;
  END IF;

  -- 2. Locate Credit Note CN-000090
  SELECT id INTO v_cn_id
  FROM credit_notes
  WHERE credit_note_number = 'CN-000090' OR (customer_id = v_cust_id AND amount = 8400.00)
  LIMIT 1;

  IF v_cn_id IS NOT NULL THEN
    -- 3. Reverse restocked inventory batch for returned items
    FOR v_item IN (
      SELECT product_id, quantity, restock_inventory
      FROM sales_returns
      WHERE credit_note_id = v_cn_id AND restock_inventory = TRUE
    ) LOOP
      UPDATE inventory_batches
      SET quantity_remaining = GREATEST(0, quantity_remaining - v_item.quantity),
          quantity_received = GREATEST(0, quantity_received - v_item.quantity)
      WHERE batch_number = 'RET-CN-000090' AND product_id = v_item.product_id;
    END LOOP;

    -- 4. Reverse redemptions
    UPDATE sales s
    SET applied_credit_amount = GREATEST(0, s.applied_credit_amount - cnr.amount),
        pending_amount = s.pending_amount + cnr.amount,
        status = 'open'
    FROM credit_note_redemptions cnr
    WHERE cnr.credit_note_id = v_cn_id AND cnr.sale_id = s.id;

    DELETE FROM credit_note_redemptions WHERE credit_note_id = v_cn_id;

    -- 5. Delete sales returns
    DELETE FROM sales_returns WHERE credit_note_id = v_cn_id;

    -- 6. Delete credit note completely
    DELETE FROM credit_notes WHERE id = v_cn_id;
  END IF;

  -- 7. Recompute Customer Balances
  SELECT COALESCE(SUM(COALESCE(NULLIF(current_invoice_total, 0), total_amount)), 0) INTO v_sales_total
  FROM sales
  WHERE customer_id = v_cust_id AND status NOT IN ('cancelled', 'void');

  SELECT COALESCE(SUM(amount), 0) INTO v_paid_total
  FROM payments
  WHERE customer_id = v_cust_id AND reversed_at IS NULL AND COALESCE(payment_mode, '') NOT IN ('credit_note', 'store_credit');

  SELECT COALESCE(SUM(amount), 0) INTO v_cn_total
  FROM credit_notes
  WHERE customer_id = v_cust_id AND status != 'cancelled';

  v_net := v_ob + v_sales_total - v_paid_total - v_cn_total;
  v_adv := CASE WHEN v_net < 0 THEN ABS(v_net) ELSE 0.00 END;

  UPDATE customers
  SET current_balance = v_net,
      advance_balance = v_adv
  WHERE id = v_cust_id;

  -- 8. Update Sales Carry-Forward Balances
  v_carry := v_ob - v_paid_total - v_cn_total;
  FOR v_sale IN (
    SELECT id, COALESCE(NULLIF(current_invoice_total, 0), total_amount) AS inv_total, paid_amount
    FROM sales
    WHERE customer_id = v_cust_id AND status NOT IN ('cancelled', 'void')
    ORDER BY COALESCE(invoice_date::text, sale_date::text, created_at::date::text) ASC, id ASC
  ) LOOP
    UPDATE sales
    SET previous_balance = v_carry,
        net_payable_amount = v_carry + v_sale.inv_total,
        closing_balance = v_carry + v_sale.inv_total - v_sale.paid_amount
    WHERE id = v_sale.id;
    v_carry := v_carry + v_sale.inv_total - v_sale.paid_amount;
  END LOOP;

END $$;

COMMIT;
