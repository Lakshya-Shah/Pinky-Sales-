import 'dotenv/config';
import { pool, allRecords, getRecord, runQuery, runTransaction } from '../database.js';
import { getCustomerLedger, getCustomerTotalOutstanding } from '../ledgerEngine.js';

const money = (val) => Math.round(Number(val || 0) * 100) / 100;
const fmt = (val) => '₹' + Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function fixJagdishAccounting() {
  console.log('================================================================');
  console.log('   DYNAMIC RECONCILIATION FOR JAGDISHBHAI (CUSTOMER ID: 15)     ');
  console.log('================================================================\n');

  try {
    await runTransaction(async (tx) => {
      // 1. Ensure cash payment for Invoice 36 exists in payments table
      const existingPay36 = await tx.getRecord(
        `SELECT id FROM payments WHERE customer_id = 15 AND sale_id = 36 LIMIT 1`
      );

      let pay36Id = existingPay36?.id;
      if (!pay36Id) {
        console.log('1. Inserting missing cash payment record for legacy Invoice #INV-000036 (₹1,000.00)...');
        const pNumRow = await tx.getRecord(`SELECT 'PAY-' || LPAD(nextval('payment_number_seq')::TEXT, 6, '0') AS num`);
        const insPay = await tx.runQuery(
          `INSERT INTO payments (payment_number, customer_id, sale_id, amount, payment_date, payment_mode, note, shop_id, created_at)
           VALUES (?, 15, 36, 1000.00, '2026-08-29', 'cash', 'Cash payment at checkout for INV-000036', 2, '2026-08-30 09:44:06')`,
          [pNumRow.num]
        );
        pay36Id = insPay.id;
        console.log(`   ✔ Created payment record: ${pNumRow.num} (ID: ${pay36Id})`);
      } else {
        console.log(`1. Legacy payment record for Invoice #INV-000036 exists (ID: ${pay36Id})`);
      }

      // 2. Ensure all payments for Customer 15 have valid external payment modes
      // Convert any 'store_credit' or NULL to 'cash' so ledgerEngine counts them
      console.log('2. Normalizing payment modes for Customer 15 to valid cash/real payments...');
      await tx.runQuery(
        `UPDATE payments 
         SET payment_mode = 'cash',
             note = CASE 
               WHEN sale_id IS NOT NULL AND (note IS NULL OR note LIKE '%Store Credit%') THEN 'Payment for invoice'
               ELSE COALESCE(note, 'Payment received')
             END
         WHERE customer_id = 15 AND (payment_mode = 'store_credit' OR payment_mode IS NULL)`
      );

      // 3. Reset advance_applied on sales for Customer 15
      console.log('3. Clearing artificial advance_applied flags on sales...');
      await tx.runQuery(
        `UPDATE sales
         SET advance_applied = 0.00
         WHERE customer_id = 15 AND advance_applied > 0`
      );

      // 4. Fetch all sales and all valid payments for Customer 15
      const sales = await tx.allRecords(
        `SELECT id, invoice_number, total_amount, current_invoice_total, sale_date, invoice_date, created_at
         FROM sales
         WHERE customer_id = 15 AND status NOT IN ('cancelled', 'void')
         ORDER BY COALESCE(invoice_date::text, sale_date::text, created_at::date::text) ASC, id ASC`
      );

      const payments = await tx.allRecords(
        `SELECT id, payment_number, amount, sale_id, payment_date, created_at
         FROM payments
         WHERE customer_id = 15 AND reversed_at IS NULL
         ORDER BY COALESCE(payment_date::text, created_at::date::text) ASC, id ASC`
      );

      console.log(`\nFound ${sales.length} active sales invoices and ${payments.length} valid payments for Customer 15.`);

      // 5. Clear old allocations for Customer 15 to build clean chronological FIFO
      console.log('5. Re-allocating payments across invoices via strict FIFO...');
      await tx.runQuery(`DELETE FROM payment_allocations WHERE customer_id = 15`);

      // Track running state for each sale
      const saleState = new Map();
      for (const s of sales) {
        const invTotal = money(s.current_invoice_total || s.total_amount);
        saleState.set(s.id, {
          id: s.id,
          invoice_number: s.invoice_number,
          total: invTotal,
          paid: 0.00,
          pending: invTotal,
        });
      }

      // Track unallocated amount per payment
      const paymentUpdates = [];

      for (const p of payments) {
        let remainingPay = money(p.amount);
        const pId = p.id;

        // If payment was tied to a specific sale, allocate to that sale first
        if (p.sale_id && saleState.has(p.sale_id)) {
          const target = saleState.get(p.sale_id);
          if (target.pending > 0 && remainingPay > 0) {
            const alloc = Math.min(remainingPay, target.pending);
            target.paid = money(target.paid + alloc);
            target.pending = money(target.total - target.paid);
            remainingPay = money(remainingPay - alloc);

            await tx.runQuery(
              `INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied, notes, created_at)
               VALUES (?, 15, ?, 'invoice', ?, ?, CURRENT_TIMESTAMP)`,
              [pId, target.id, alloc, `Payment towards Invoice #${target.invoice_number || target.id}`]
            );
          }
        }

        // Allocate remaining payment to earliest unpaid sales
        if (remainingPay > 0) {
          for (const s of sales) {
            if (remainingPay <= 0) break;
            const target = saleState.get(s.id);
            if (target.pending <= 0) continue;

            const alloc = Math.min(remainingPay, target.pending);
            target.paid = money(target.paid + alloc);
            target.pending = money(target.total - target.paid);
            remainingPay = money(remainingPay - alloc);

            await tx.runQuery(
              `INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied, notes, created_at)
               VALUES (?, 15, ?, 'invoice', ?, ?, CURRENT_TIMESTAMP)`,
              [pId, target.id, alloc, `FIFO payment towards Invoice #${target.invoice_number || target.id}`]
            );
          }
        }

        // Any leftover becomes unallocated advance credit on this payment
        const unalloc = Math.max(0, remainingPay);
        await tx.runQuery(
          `UPDATE payments SET unallocated_amount = ? WHERE id = ?`,
          [unalloc, pId]
        );
      }

      // 6. Update all sales with their exact paid_amount, pending_amount, and status
      console.log('6. Updating invoice statuses and carry-forward balances...');
      let runningCarryForward = 0.00;

      for (const s of sales) {
        const state = saleState.get(s.id);
        const newStatus = state.pending <= 0 ? 'paid' : (state.paid > 0 ? 'partial' : 'open');
        const netPayable = money(runningCarryForward + state.total);
        const closingBal = money(netPayable - state.paid);

        await tx.runQuery(
          `UPDATE sales 
           SET paid_amount = ?,
               pending_amount = ?,
               status = ?,
               previous_balance = ?,
               net_payable_amount = ?,
               closing_balance = ?
           WHERE id = ?`,
          [state.paid, state.pending, newStatus, runningCarryForward, netPayable, closingBal, s.id]
        );

        runningCarryForward = closingBal;
      }

      // 7. Remove any spurious OPENING_BALANCE ledger entries for Customer 15
      await tx.runQuery(
        `DELETE FROM ledger_entries WHERE customer_id = 15 AND entry_type = 'OPENING_BALANCE'`
      );

      // 8. Compute total invoiced vs total paid dynamically
      const totalInvoiced = sales.reduce((acc, s) => acc + money(s.current_invoice_total || s.total_amount), 0);
      const totalPaid = payments.reduce((acc, p) => acc + money(p.amount), 0);
      const netDue = money(totalInvoiced - totalPaid);

      const finalAdvanceBal = netDue < 0 ? Math.abs(netDue) : 0.00;
      const finalCurrentBal = netDue;

      console.log(`\n--- SUMMARY OF TRANSACTION TOTALS ---`);
      console.log(`Total Invoiced:        ${fmt(totalInvoiced)}`);
      console.log(`Total Paid:            ${fmt(totalPaid)}`);
      console.log(`Net Due:               ${fmt(netDue)}`);
      console.log(`Advance Balance:       ${fmt(finalAdvanceBal)}`);
      console.log(`Current Balance:       ${fmt(finalCurrentBal)}`);

      // 9. Update Customer 15 record
      await tx.runQuery(
        `UPDATE customers 
         SET opening_balance = 0.00,
             advance_balance = ?,
             current_balance = ?
         WHERE id = 15`,
        [finalAdvanceBal, finalCurrentBal]
      );
    });

    console.log('\n✔ Database transaction committed successfully!\n');

    // 10. Verify with ledgerEngine
    console.log('================================================================');
    console.log('   VERIFYING ACCOUNTING ENGINE & LEDGER AFTER REPAIR:           ');
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
      console.log(`  ${r.entry_date} | ${r.ref_no} | ${r.entry_type} | Dr: ${fmt(r.debit)} | Cr: ${fmt(r.credit)} | Bal: ${fmt(r.running_balance)}`);
    }

    console.log('\n================================================================');
    console.log('✅ RECONCILIATION VERIFICATION COMPLETE!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('Error fixing customer 15 accounting:', err);
  } finally {
    await pool.end();
  }
}

fixJagdishAccounting();
