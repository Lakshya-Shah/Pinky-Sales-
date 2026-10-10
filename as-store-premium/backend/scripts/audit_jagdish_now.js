import 'dotenv/config';
import { pool, allRecords, getRecord } from '../database.js';
import { getCustomerLedger, getCustomerTotalOutstanding } from '../ledgerEngine.js';

async function audit() {
  try {
    console.log('=== 1. SEARCH FOR CUSTOMERS NAMED JAGDISH ===');
    const customers = await allRecords(`
      SELECT id, name, mobile, phone, opening_balance, current_balance, advance_balance, created_at
      FROM customers
      WHERE LOWER(name) LIKE '%jagdish%' OR mobile LIKE '%9904888666%'
    `);
    console.log('Matching Customers:', JSON.stringify(customers, null, 2));

    for (const cust of customers) {
      console.log(`\n======================================================`);
      console.log(`CUSTOMER AUDIT: ${cust.name} (ID: ${cust.id})`);
      console.log(`======================================================`);

      const outstanding = await getCustomerTotalOutstanding(cust.id);
      console.log('Total Outstanding Object:', outstanding);

      const ledger = await getCustomerLedger(cust.id);
      console.log('Ledger summary:');
      console.log({
        opening_balance: ledger.opening_balance,
        total_debit: ledger.total_debit,
        total_credit: ledger.total_credit,
        closing_balance: ledger.closing_balance,
        rowCount: ledger.rows?.length
      });

      console.log('\n--- SALES FOR CUSTOMER ' + cust.id + ' ---');
      const sales = await allRecords(`
        SELECT id, invoice_number, sale_date, total_amount, current_invoice_total,
               paid_amount, pending_amount, status, previous_balance, net_payable_amount, closing_balance, created_at
        FROM sales
        WHERE customer_id = ?
        ORDER BY sale_date ASC, id ASC
      `, [cust.id]);
      console.table(sales.map(s => ({
        id: s.id,
        invoice: s.invoice_number,
        date: s.sale_date,
        total: s.total_amount,
        curr_total: s.current_invoice_total,
        paid: s.paid_amount,
        pending: s.pending_amount,
        prev_bal: s.previous_balance,
        net_payable: s.net_payable_amount,
        closing_bal: s.closing_balance,
        status: s.status
      })));

      console.log('\n--- PAYMENTS FOR CUSTOMER ' + cust.id + ' ---');
      const payments = await allRecords(`
        SELECT id, payment_number, sale_id, amount, payment_date, payment_mode, reference_number, notes, reversed_at, created_at
        FROM payments
        WHERE customer_id = ?
        ORDER BY payment_date ASC, id ASC
      `, [cust.id]);
      console.table(payments.map(p => ({
        id: p.id,
        num: p.payment_number,
        sale_id: p.sale_id,
        amount: p.amount,
        date: p.payment_date,
        mode: p.payment_mode,
        ref: p.reference_number,
        rev: p.reversed_at ? 'YES' : 'NO',
        note: (p.notes || '').substring(0, 30)
      })));

      console.log('\n--- PAYMENT ALLOCATIONS FOR CUSTOMER ' + cust.id + ' ---');
      const allocations = await allRecords(`
        SELECT pa.id, pa.payment_id, pa.sale_id, pa.allocation_type, pa.amount_applied, pa.notes,
               p.payment_number, s.invoice_number
        FROM payment_allocations pa
        LEFT JOIN payments p ON pa.payment_id = p.id
        LEFT JOIN sales s ON pa.sale_id = s.id
        WHERE pa.customer_id = ?
        ORDER BY pa.id ASC
      `, [cust.id]);
      console.table(allocations.map(a => ({
        id: a.id,
        payment_id: a.payment_id,
        pay_num: a.payment_number,
        sale_id: a.sale_id,
        inv_num: a.invoice_number,
        type: a.allocation_type,
        amount: a.amount_applied,
        note: a.notes
      })));

      console.log('\n--- CREDIT NOTES FOR CUSTOMER ' + cust.id + ' ---');
      const creditNotes = await allRecords(`
        SELECT id, credit_note_number, sale_id, amount, balance_amount, status, created_at
        FROM credit_notes
        WHERE customer_id = ?
      `, [cust.id]);
      console.table(creditNotes);

      console.log('\n--- ALL LEDGER ROWS FOR CUSTOMER ' + cust.id + ' ---');
      console.table(ledger.rows.map(r => ({
        date: r.entry_date,
        ref: r.ref_no,
        type: r.entry_type,
        debit: r.debit,
        credit: r.credit,
        balance: r.running_balance,
        desc: (r.description || '').substring(0, 40)
      })));
    }
  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    await pool.end();
  }
}

audit();
