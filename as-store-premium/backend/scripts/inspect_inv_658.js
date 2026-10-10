const db = require('../database.js');

async function run() {
  const sales = await db.allRecords("SELECT id, invoice_number, customer_id, shop_id, total_amount, paid_amount, balance_amount, current_invoice_total, invoice_date, sale_date, created_at FROM sales WHERE invoice_number = 'INV-000658' OR id = 658");
  console.log('SALES:', JSON.stringify(sales, null, 2));

  const payments = await db.allRecords("SELECT * FROM payments WHERE payment_number = 'PAY-000635' OR id = 635");
  console.log('PAYMENTS:', JSON.stringify(payments, null, 2));

  const allocs = await db.allRecords("SELECT * FROM payment_allocations WHERE payment_id IN (SELECT id FROM payments WHERE payment_number = 'PAY-000635' OR id = 635)");
  console.log('ALLOCS:', JSON.stringify(allocs, null, 2));

  const cust = await db.allRecords("SELECT id, name, opening_balance, current_balance, available_credit FROM customers WHERE name ILIKE '%jagdish%'");
  console.log('CUSTOMER:', JSON.stringify(cust, null, 2));

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
