import 'dotenv/config';
import { runQuery, allRecords, pool } from '../database.js';

async function cleanTestCustomers() {
  console.log('Searching for test customers...');
  const testCustomers = await allRecords(`
    SELECT id, name, mobile, current_balance, advance_balance
    FROM customers 
    WHERE name ILIKE '%Test Cust%' 
       OR name ILIKE '%Test FIFO%' 
       OR name ILIKE '%Split Test%'
       OR mobile LIKE '999990000%'
    ORDER BY id ASC
  `);

  console.log(`Found ${testCustomers.length} test customer(s):`);
  for (const c of testCustomers) {
    console.log(` - ID: ${c.id} | Name: "${c.name}" | Mobile: ${c.mobile}`);
  }

  if (testCustomers.length === 0) {
    console.log('No test customers found.');
    await pool.end();
    return;
  }

  const ids = testCustomers.map(c => c.id);

  console.log('\nCleaning related records for test customer IDs:', ids);

  await runQuery(`DELETE FROM payment_allocations WHERE customer_id IN (${ids.join(',')})`);
  await runQuery(`DELETE FROM payments WHERE customer_id IN (${ids.join(',')})`);
  await runQuery(`DELETE FROM sale_batch_allocations WHERE sale_id IN (SELECT id FROM sales WHERE customer_id IN (${ids.join(',')}))`);
  await runQuery(`DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE customer_id IN (${ids.join(',')}))`);
  await runQuery(`DELETE FROM credit_note_redemptions WHERE customer_id IN (${ids.join(',')}) OR sale_id IN (SELECT id FROM sales WHERE customer_id IN (${ids.join(',')}))`);
  await runQuery(`DELETE FROM credit_notes WHERE customer_id IN (${ids.join(',')})`);
  await runQuery(`DELETE FROM sales WHERE customer_id IN (${ids.join(',')})`);
  await runQuery(`DELETE FROM ledger_entries WHERE customer_id IN (${ids.join(',')})`);
  await runQuery(`DELETE FROM customers WHERE id IN (${ids.join(',')})`);

  console.log(`\n✔ Successfully removed all ${testCustomers.length} test customer(s) and their associated records!`);
  await pool.end();
}

cleanTestCustomers().catch(err => {
  console.error('Error cleaning test customers:', err);
  process.exit(1);
});
