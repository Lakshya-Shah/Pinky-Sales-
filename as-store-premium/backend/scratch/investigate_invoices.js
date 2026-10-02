import { allRecords, getRecord } from '../database.js';
import { getCustomerTotalOutstanding, getCustomerLedger } from '../ledgerEngine.js';

async function main() {
  const sales = await allRecords(`
    SELECT id, invoice_number, customer_id, customer_name, total_amount, current_invoice_total,
           previous_balance, old_balance, grand_total, net_payable_amount, pending_amount, paid_amount,
           closing_balance, created_at, status
    FROM sales
    WHERE invoice_number IN ('INV-000496', 'INV-000498')
    ORDER BY id ASC
  `);
  console.log('--- Sales Found ---');
  console.log(JSON.stringify(sales, null, 2));

  for (const s of sales) {
    console.log(`\n=== Customer for ${s.invoice_number} (ID: ${s.customer_id}) ===`);
    const cust = await getRecord('SELECT * FROM customers WHERE id = ?', [s.customer_id]);
    console.log('Customer:', cust);

    const out = await getCustomerTotalOutstanding(s.customer_id);
    console.log('Customer Total Outstanding:', out);

    const ledger = await getCustomerLedger(s.customer_id);
    console.log('Ledger closing_balance:', ledger.closing_balance);
    console.log('Ledger entries count:', ledger.entries.length);
    console.log('Last 5 ledger entries:', ledger.entries.slice(-5));
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
