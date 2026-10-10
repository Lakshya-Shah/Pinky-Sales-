import 'dotenv/config';
import { getRecord, allRecords, pool } from './backend/database.js';

async function main() {
  // 1. Current Dashboard Query:
  const dashboardRow = await getRecord(`
    SELECT COALESCE((
      SELECT SUM(customer_pending)
      FROM (
        SELECT
          GREATEST(0, (
            GREATEST(0, (COALESCE(c.opening_balance, 0) - COALESCE(
              (SELECT SUM(pa.amount_applied) FROM payment_allocations pa 
               WHERE pa.customer_id = c.id AND pa.allocation_type = 'opening_balance' AND pa.reversed_at IS NULL), 0
            )))
            + COALESCE(SUM(CASE WHEN sa.status NOT IN ('cancelled', 'void', 'draft') THEN sa.pending_amount ELSE 0 END), 0)
            - COALESCE(c.advance_balance, 0)
          )) AS customer_pending
        FROM customers c
        LEFT JOIN sales sa ON sa.customer_id = c.id
        GROUP BY c.id, c.opening_balance, c.advance_balance
      ) cust_dues
      WHERE customer_pending > 0
    ), 0) AS pending_payments;
  `);

  // 2. Canonical Customer Pending formula (from GET /customers):
  const canonicalRow = await getRecord(`
    SELECT COALESCE(SUM(
      GREATEST(0, (
        COALESCE(c.opening_balance, 0)
        + COALESCE((SELECT SUM(COALESCE(NULLIF(s2.current_invoice_total, 0), s2.total_amount)) FROM sales s2 WHERE s2.customer_id = c.id), 0)
        - COALESCE((SELECT SUM(pm.amount) FROM payments pm WHERE pm.customer_id = c.id AND pm.reversed_at IS NULL AND COALESCE(pm.payment_mode, '') NOT IN ('credit_note', 'store_credit')), 0)
        - COALESCE((SELECT SUM(cn.amount) FROM credit_notes cn WHERE cn.customer_id = c.id AND cn.status != 'cancelled'), 0)
      ))
    ), 0) AS canonical_pending
    FROM customers c;
  `);

  // 3. Canonical with status NOT IN ('cancelled', 'void'):
  const canonicalExclVoidRow = await getRecord(`
    SELECT COALESCE(SUM(
      GREATEST(0, (
        COALESCE(c.opening_balance, 0)
        + COALESCE((SELECT SUM(COALESCE(NULLIF(s2.current_invoice_total, 0), s2.total_amount)) FROM sales s2 WHERE s2.customer_id = c.id AND s2.status NOT IN ('cancelled', 'void')), 0)
        - COALESCE((SELECT SUM(pm.amount) FROM payments pm WHERE pm.customer_id = c.id AND pm.reversed_at IS NULL AND COALESCE(pm.payment_mode, '') NOT IN ('credit_note', 'store_credit')), 0)
        - COALESCE((SELECT SUM(cn.amount) FROM credit_notes cn WHERE cn.customer_id = c.id AND cn.status != 'cancelled'), 0)
      ))
    ), 0) AS canonical_excl_void_pending
    FROM customers c;
  `);

  console.log('Current Dashboard pending_payments:', dashboardRow?.pending_payments);
  console.log('Canonical Customers sum pending:', canonicalRow?.canonical_pending);
  console.log('Canonical Customers (excl void) sum pending:', canonicalExclVoidRow?.canonical_excl_void_pending);

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
