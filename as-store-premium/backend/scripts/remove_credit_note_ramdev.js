import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, allRecords, getRecord, runQuery, runTransaction } from '../database.js';
import { getCustomerLedger, getCustomerTotalOutstanding } from '../ledgerEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logFile = path.resolve(__dirname, '../../remove_cn_log.txt');

const logs = [];
function log(msg) {
  console.log(msg);
  logs.push(msg);
}

const money = (val) => Math.round(Number(val || 0) * 100) / 100;
const fmt = (val) => '₹' + Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function removeCreditNoteRamdev() {
  log('================================================================');
  log('   REMOVING CREDIT NOTE CN-000090 (₹8,400) FROM RAMDEV VAPI     ');
  log('================================================================\n');

  try {
    await runTransaction(async (tx) => {
      // 1. Locate Customer RAMDEV MOBILE VAPI
      const customer = await tx.getRecord(
        `SELECT id, name, mobile, opening_balance, advance_balance, current_balance, shop_id
         FROM customers
         WHERE id = 89 OR mobile = '9898068887' OR LOWER(name) LIKE '%ramdev%vapi%'
         LIMIT 1`
      );

      if (!customer) {
        throw new Error('Customer RAMDEV MOBILE VAPI not found in database!');
      }

      log(`Found Customer: ${customer.name} (ID: ${customer.id}, Mobile: ${customer.mobile})`);

      // 2. Locate Credit Note CN-000090 (₹8,400)
      const cn = await tx.getRecord(
        `SELECT id, credit_note_number, customer_id, shop_id, amount, used_amount, balance_amount, status, reason
         FROM credit_notes
         WHERE credit_note_number = 'CN-000090' OR (customer_id = ? AND amount = 8400.00)
         LIMIT 1`,
        [customer.id]
      );

      if (!cn) {
        log('⚠️ Credit Note CN-000090 not found (might already be deleted).');
      } else {
        log(`Found Credit Note: #${cn.credit_note_number} (ID: ${cn.id}, Amount: ${fmt(cn.amount)}, Status: ${cn.status})`);

        // 3. Reverse restocked inventory on inventory_batches
        const returnItems = await tx.allRecords(
          `SELECT id, product_id, quantity, restock_inventory, colour, shop_id
           FROM sales_returns
           WHERE credit_note_id = ?`,
          [cn.id]
        );

        if (returnItems.length > 0) {
          log(`Found ${returnItems.length} returned item(s) on credit note:`);
          for (const item of returnItems) {
            log(` - Product ID: ${item.product_id}, Qty: ${item.quantity}, Restocked: ${item.restock_inventory}`);
            if (item.restock_inventory) {
              const retBatch = await tx.getRecord(
                `SELECT id, quantity_remaining 
                 FROM inventory_batches 
                 WHERE product_id = ? 
                 ORDER BY id DESC LIMIT 1`,
                [item.product_id]
              );

              if (retBatch) {
                log(`   Deducting ${item.quantity} qty from batch ID ${retBatch.id}...`);
                await tx.runQuery(
                  `UPDATE inventory_batches 
                   SET quantity_remaining = GREATEST(0, quantity_remaining - ?)
                   WHERE id = ?`,
                  [item.quantity, retBatch.id]
                );
              }
            }
          }
        }

        // 4. Reverse redemptions
        const redemptions = await tx.allRecords(
          `SELECT id, sale_id, amount 
           FROM credit_note_redemptions 
           WHERE credit_note_id = ?`,
          [cn.id]
        );

        if (redemptions.length > 0) {
          log(`Found ${redemptions.length} redemption(s) for this credit note:`);
          for (const r of redemptions) {
            log(` - Restoring pending amount on Sale ID ${r.sale_id} by ${fmt(r.amount)}...`);
            await tx.runQuery(
              `UPDATE sales 
               SET applied_credit_amount = GREATEST(0, applied_credit_amount - ?),
                   pending_amount = pending_amount + ?,
                   status = 'open'
               WHERE id = ?`,
              [r.amount, r.amount, r.sale_id]
            );
          }
          await tx.runQuery(`DELETE FROM credit_note_redemptions WHERE credit_note_id = ?`, [cn.id]);
        }

        // 5. Delete sales return items for this credit note
        log(`5. Deleting sales return items for credit note #${cn.credit_note_number}...`);
        await tx.runQuery(`DELETE FROM sales_returns WHERE credit_note_id = ?`, [cn.id]);

        // 6. Delete the credit note completely
        log(`6. Deleting credit note #${cn.credit_note_number}...`);
        await tx.runQuery(`DELETE FROM credit_notes WHERE id = ?`, [cn.id]);
        log(`   ✔ Credit note deleted cleanly from database!`);
      }

      // 7. Recalculate Customer RAMDEV MOBILE VAPI balances
      log('\n7. Recalculating Customer RAMDEV MOBILE VAPI balances...');
      const ob = money(customer.opening_balance);

      const salesSumRow = await tx.getRecord(
        `SELECT COALESCE(SUM(COALESCE(NULLIF(current_invoice_total, 0), total_amount)), 0) AS total_invoiced
         FROM sales
         WHERE customer_id = ? AND status NOT IN ('cancelled', 'void')`,
        [customer.id]
      );
      const totalInvoiced = money(salesSumRow?.total_invoiced);

      const paySumRow = await tx.getRecord(
        `SELECT COALESCE(SUM(amount), 0) AS total_paid
         FROM payments
         WHERE customer_id = ? AND reversed_at IS NULL AND COALESCE(payment_mode, '') NOT IN ('credit_note', 'store_credit')`,
        [customer.id]
      );
      const totalPaid = money(paySumRow?.total_paid);

      const cnSumRow = await tx.getRecord(
        `SELECT COALESCE(SUM(amount), 0) AS total_cn
         FROM credit_notes
         WHERE customer_id = ? AND status != 'cancelled'`,
        [customer.id]
      );
      const totalCn = money(cnSumRow?.total_cn);

      const netBalance = money(ob + totalInvoiced - totalPaid - totalCn);
      const advanceBalance = netBalance < 0 ? Math.abs(netBalance) : 0.00;
      const currentBalance = netBalance;

      log(`\nNew Balance Breakdown for ${customer.name}:`);
      log(` - Opening Balance:    ${fmt(ob)}`);
      log(` - Total Invoiced:     ${fmt(totalInvoiced)}`);
      log(` - Total Payments:     ${fmt(totalPaid)}`);
      log(` - Total Credit Notes: ${fmt(totalCn)}`);
      log(` - Net Balance:        ${fmt(currentBalance)} (${currentBalance >= 0 ? 'Dr' : 'Cr'})`);
      log(` - Advance Balance:    ${fmt(advanceBalance)}`);

      await tx.runQuery(
        `UPDATE customers
         SET current_balance = ?,
             advance_balance = ?
         WHERE id = ?`,
        [currentBalance, advanceBalance, customer.id]
      );

      // 8. Update sequential carry-forward balances on Ramdev's sales invoices
      const ramdevSales = await tx.allRecords(
        `SELECT id, COALESCE(NULLIF(current_invoice_total, 0), total_amount) AS inv_total, paid_amount
         FROM sales
         WHERE customer_id = ? AND status NOT IN ('cancelled', 'void')
         ORDER BY COALESCE(invoice_date::text, sale_date::text, created_at::date::text) ASC, id ASC`,
        [customer.id]
      );

      let carryForward = money(ob - totalPaid - totalCn);
      for (const s of ramdevSales) {
        const netPayable = money(carryForward + money(s.inv_total));
        const closing = money(netPayable - money(s.paid_amount));
        await tx.runQuery(
          `UPDATE sales 
           SET previous_balance = ?,
               net_payable_amount = ?,
               closing_balance = ?
           WHERE id = ?`,
          [carryForward, netPayable, closing, s.id]
        );
        carryForward = closing;
      }
    });

    log('\n✔ Database transaction committed successfully!\n');

    // 9. Verify using ledgerEngine
    log('================================================================');
    log('   VERIFYING RAMDEV MOBILE VAPI LEDGER AFTER REMOVAL:           ');
    log('================================================================');
    const custRow = await getRecord(`SELECT id FROM customers WHERE id = 89 OR mobile = '9898068887' OR LOWER(name) LIKE '%ramdev%vapi%' LIMIT 1`);
    if (custRow) {
      const dynamicTotal = await getCustomerTotalOutstanding(custRow.id);
      const ledger = await getCustomerLedger(custRow.id);

      log(`Customer:              ${ledger.customer.name} (ID ${custRow.id})`);
      log(`Opening Balance:       ${fmt(dynamicTotal.opening_balance)}`);
      log(`Total Invoiced:        ${fmt(dynamicTotal.total_invoiced)}`);
      log(`Total Paid:            ${fmt(dynamicTotal.total_paid)}`);
      log(`Total Credit Notes:    ${fmt(dynamicTotal.total_credit_notes)}`);
      log(`Invoices Pending:      ${fmt(dynamicTotal.invoices_pending)}`);
      log(`Advance Balance:       ${fmt(dynamicTotal.advance_balance)}`);
      log(`Total Outstanding:     ${fmt(dynamicTotal.total_outstanding)}`);
      log(`Ledger Closing Bal:    ${fmt(ledger.closing_balance)}`);

      log('\nParty Ledger Rows:');
      for (const r of ledger.rows) {
        log(`  ${r.entry_date} | ${r.ref_no} | ${r.entry_type} | Dr: ${fmt(r.debit_amount || r.debit)} | Cr: ${fmt(r.credit_amount || r.credit)} | Bal: ${fmt(r.running_balance)}`);
      }
    }

    log('\n================================================================');
    log('✅ CREDIT NOTE CN-000090 REMOVED SUCCESSFULLY!');
    log('================================================================\n');

  } catch (err) {
    log(`❌ Error removing credit note: ${err.message}\n${err.stack}`);
  } finally {
    fs.writeFileSync(logFile, logs.join('\n'), 'utf8');
    await pool.end();
  }
}

removeCreditNoteRamdev();
