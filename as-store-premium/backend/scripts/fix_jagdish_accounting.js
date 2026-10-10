import 'dotenv/config';
import { pool, allRecords, getRecord, runQuery, runTransaction } from '../database.js';
import { getCustomerLedger, getCustomerTotalOutstanding } from '../ledgerEngine.js';

const money = (val) => Math.round(Number(val || 0) * 100) / 100;
const fmt = (val) => '₹' + Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function fixJagdishAccounting() {
  console.log('================================================================');
  console.log('   RESET CUSTOMER 15 (JAGDISHBHAI): SALES INVOICES ONLY        ');
  console.log('   Paid Amount: ₹0.00 | Credit / Advance Balance: ₹0.00         ');
  console.log('================================================================\n');

  try {
    await runTransaction(async (tx) => {
      // 1. Remove all payment allocations for Customer 15
      console.log('1. Removing all payment allocations for Customer 15...');
      await tx.runQuery(`DELETE FROM payment_allocations WHERE customer_id = 15`);

      // 2. Remove credit note redemptions for Customer 15 sales
      console.log('2. Removing credit note redemptions...');
      await tx.runQuery(
        `DELETE FROM credit_note_redemptions 
         WHERE sale_id IN (SELECT id FROM sales WHERE customer_id = 15)`
      );

      // 3. Cancel any credit notes for Customer 15 so credit balance is zero
      console.log('3. Cancelling credit notes for Customer 15...');
      await tx.runQuery(`UPDATE credit_notes SET status = 'cancelled' WHERE customer_id = 15`);

      // 4. Delete all payment records for Customer 15
      console.log('4. Deleting all payment records for Customer 15...');
      await tx.runQuery(`DELETE FROM payments WHERE customer_id = 15`);

      // 5. Delete any manual/corrupt ledger entries for Customer 15
      console.log('5. Clearing ledger entries for Customer 15...');
      await tx.runQuery(`DELETE FROM ledger_entries WHERE customer_id = 15`);

      // 6. Fetch all active sales invoices for Customer 15 in chronological order
      const sales = await tx.allRecords(
        `SELECT id, invoice_number, total_amount, current_invoice_total, sale_date, invoice_date, created_at
         FROM sales
         WHERE customer_id = 15 AND status NOT IN ('cancelled', 'void')
         ORDER BY COALESCE(invoice_date::text, sale_date::text, created_at::date::text) ASC, id ASC`
      );

      console.log(`6. Found ${sales.length} sales invoices. Resetting to open with ₹0.00 paid...`);

      let runningCarryForward = 0.00;

      for (const s of sales) {
        const invTotal = money(s.current_invoice_total || s.total_amount);
        const netPayable = money(runningCarryForward + invTotal);
        const closingBal = netPayable; // Since paid = 0

        await tx.runQuery(
          `UPDATE sales 
           SET paid_amount = 0.00,
               pending_amount = ?,
               advance_applied = 0.00,
               applied_credit_amount = 0.00,
               status = 'open',
               previous_balance = ?,
               net_payable_amount = ?,
               closing_balance = ?
           WHERE id = ?`,
          [invTotal, runningCarryForward, netPayable, closingBal, s.id]
        );

        runningCarryForward = closingBal;
      }

      // 7. Update Customer 15 master record: advance = 0, opening = 0, current_balance = total invoiced
      console.log(`7. Updating customer master record (Current Balance: ${fmt(runningCarryForward)}, Advance: ₹0.00)...`);
      await tx.runQuery(
        `UPDATE customers 
         SET opening_balance = 0.00,
             advance_balance = 0.00,
             current_balance = ?
         WHERE id = 15`,
        [runningCarryForward]
      );

      // 8. Record migration 068 in schema_migrations
      await tx.runQuery(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
           name TEXT PRIMARY KEY,
           applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
         )`
      );
      await tx.runQuery(
        `INSERT INTO schema_migrations (name) VALUES ('068_reset_jagdishbhai_to_sales_only.sql') ON CONFLICT DO NOTHING`
      );

      // 8b. Also remove Credit Note CN-000090 (₹8,400) from RAMDEV MOBILE VAPI
      console.log('8b. Removing Credit Note CN-000090 (₹8,400) for RAMDEV MOBILE VAPI...');
      const ramdevCust = await tx.getRecord(
        `SELECT id, opening_balance FROM customers WHERE mobile = '9898068887' OR LOWER(name) LIKE '%ramdev%vapi%' LIMIT 1`
      );
      if (ramdevCust) {
        const cn90 = await tx.getRecord(
          `SELECT id FROM credit_notes WHERE credit_note_number = 'CN-000090' OR (customer_id = ? AND amount = 8400.00) LIMIT 1`,
          [ramdevCust.id]
        );
        if (cn90) {
          // Reverse restock on inventory_batches
          const retItems = await tx.allRecords(`SELECT product_id, quantity, restock_inventory FROM sales_returns WHERE credit_note_id = ?`, [cn90.id]);
          for (const item of retItems) {
            if (item.restock_inventory) {
              const b = await tx.getRecord(`SELECT id FROM inventory_batches WHERE product_id = ? ORDER BY id DESC LIMIT 1`, [item.product_id]);
              if (b) {
                await tx.runQuery(`UPDATE inventory_batches SET quantity_remaining = GREATEST(0, quantity_remaining - ?) WHERE id = ?`, [item.quantity, b.id]);
              }
            }
          }
          await tx.runQuery(`DELETE FROM credit_note_redemptions WHERE credit_note_id = ?`, [cn90.id]);
          await tx.runQuery(`DELETE FROM sales_returns WHERE credit_note_id = ?`, [cn90.id]);
          await tx.runQuery(`DELETE FROM credit_notes WHERE id = ?`, [cn90.id]);
          console.log('   ✔ Credit note CN-000090 deleted cleanly!');
        }
        // Recompute Ramdev balances
        const rSales = await tx.getRecord(
          `SELECT COALESCE(SUM(COALESCE(NULLIF(current_invoice_total, 0), total_amount)), 0) AS total FROM sales WHERE customer_id = ? AND status NOT IN ('cancelled', 'void')`,
          [ramdevCust.id]
        );
        const rPay = await tx.getRecord(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE customer_id = ? AND reversed_at IS NULL AND COALESCE(payment_mode, '') NOT IN ('credit_note', 'store_credit')`,
          [ramdevCust.id]
        );
        const rCn = await tx.getRecord(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM credit_notes WHERE customer_id = ? AND status != 'cancelled'`,
          [ramdevCust.id]
        );
        const rNet = money(Number(ramdevCust.opening_balance || 0) + Number(rSales?.total || 0) - Number(rPay?.total || 0) - Number(rCn?.total || 0));
        const rAdv = rNet < 0 ? Math.abs(rNet) : 0.00;
        await tx.runQuery(
          `UPDATE customers SET current_balance = ?, advance_balance = ? WHERE id = ?`,
          [rNet, rAdv, ramdevCust.id]
        );
      }
    });

    console.log('\n✔ Database transaction committed successfully!\n');

    // 9. Verify with ledgerEngine
    console.log('================================================================');
    console.log('   VERIFYING ACCOUNTING ENGINE & LEDGER AFTER RESET:            ');
    console.log('================================================================');
    const dynamicTotal = await getCustomerTotalOutstanding(15);
    const ledger = await getCustomerLedger(15);

    console.log(`Customer:              JAGDISHBHAI (ID 15)`);
    console.log(`Opening Balance:       ${fmt(dynamicTotal.opening_balance)}`);
    console.log(`Total Invoiced:        ${fmt(dynamicTotal.total_invoiced)}`);
    console.log(`Total Paid:            ${fmt(dynamicTotal.total_paid)}`);
    console.log(`Invoices Pending:      ${fmt(dynamicTotal.invoices_pending)}`);
    console.log(`Advance Balance:       ${fmt(dynamicTotal.advance_balance)}`);
    console.log(`Total Outstanding:     ${fmt(dynamicTotal.total_outstanding)}`);
    console.log(`Ledger Closing Bal:    ${fmt(ledger.closing_balance)}`);

    console.log('\nParty Ledger Rows (Last 10):');
    const recentRows = ledger.rows.slice(-10);
    for (const r of recentRows) {
      console.log(`  ${r.entry_date} | ${r.ref_no} | ${r.entry_type} | Dr: ${fmt(r.debit_amount || r.debit)} | Cr: ${fmt(r.credit_amount || r.credit)} | Bal: ${fmt(r.running_balance)}`);
    }

    console.log('\n================================================================');
    console.log('✅ RESET COMPLETE: ONLY SALES INVOICES REMAIN (PAID = 0, ADVANCE = 0)');
    console.log('================================================================\n');

  } catch (err) {
    console.error('Error resetting customer 15 accounting:', err);
  } finally {
    await pool.end();
  }
}

fixJagdishAccounting();
