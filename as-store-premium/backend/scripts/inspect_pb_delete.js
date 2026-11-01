import { allRecords } from './database.js';

async function main() {
  const bills = await allRecords("SELECT * FROM purchase_bills WHERE bill_number IN ('BILL-000002', 'BILL-000003') OR id IN (2, 3)");
  console.log('BILLS:', JSON.stringify(bills, null, 2));

  for (const b of bills) {
    const batches = await allRecords('SELECT * FROM inventory_batches WHERE purchase_bill_id = ?', [b.id]);
    console.log(`Batches for Bill ${b.id} (${b.bill_number}):`, batches);

    const batchIds = batches.map(x => x.id);
    if (batchIds.length > 0) {
      const allocations = await allRecords(
        `SELECT * FROM sale_batch_allocations WHERE batch_id = ANY($1::int[])`,
        [batchIds]
      );
      console.log(`Sale allocations for Bill ${b.id}:`, allocations);
    }

    const items = await allRecords('SELECT * FROM purchase_bill_items WHERE bill_id = ?', [b.id]);
    console.log(`Items for Bill ${b.id}:`, items);

    const journals = await allRecords(
      "SELECT * FROM journal_entries WHERE ref_type = 'purchase_bill' AND ref_id = ?",
      [b.id]
    );
    console.log(`Journals for Bill ${b.id}:`, journals);
  }
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
