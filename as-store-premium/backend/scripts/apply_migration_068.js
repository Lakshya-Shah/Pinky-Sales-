import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { pool } from '../database.js';
import { getCustomerLedger, getCustomerTotalOutstanding } from '../ledgerEngine.js';

const fmt = (val) => '₹' + Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function applyMigration068() {
  console.log('================================================================');
  console.log('   APPLYING MIGRATION 068: RESET JAGDISHBHAI TO SALES ONLY      ');
  console.log('================================================================\n');

  const client = await pool.connect();
  try {
    const sql = await readFile(new URL('../migrations/068_reset_jagdishbhai_to_sales_only.sql', import.meta.url), 'utf8');
    console.log('1. Executing migration SQL in transaction...');
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query("INSERT INTO schema_migrations (name) VALUES ('068_reset_jagdishbhai_to_sales_only.sql') ON CONFLICT DO NOTHING");
    await client.query('COMMIT');
    console.log('✔ Migration 068 applied and recorded in schema_migrations!\n');

    console.log('================================================================');
    console.log('   VERIFYING CUSTOMER 15 (JAGDISHBHAI) RECONCILIATION');
    console.log('================================================================');
    const dynamicTotal = await getCustomerTotalOutstanding(15);
    const ledger = await getCustomerLedger(15);

    console.log(`Customer:              JAGDISHBHAI (ID 15)`);
    console.log(`Opening Balance:       ${fmt(dynamicTotal.opening_balance)}`);
    console.log(`Total Invoiced:        ${fmt(dynamicTotal.total_invoiced)}`);
    console.log(`Total Paid:            ${fmt(dynamicTotal.total_paid)}`);
    console.log(`Advance Balance:       ${fmt(dynamicTotal.advance_balance)}`);
    console.log(`Current Balance:       ${fmt(dynamicTotal.current_balance)}`);
    console.log(`Total Outstanding:     ${fmt(dynamicTotal.total_outstanding)}`);
    console.log(`Ledger Closing Bal:    ${fmt(ledger.closing_balance)}`);

    console.log('\nParty Ledger Rows (Recent):');
    const recentRows = ledger.rows.slice(-10);
    for (const r of recentRows) {
      console.log(`  ${r.entry_date} | ${r.ref_no} | ${r.entry_type} | Dr: ${fmt(r.debit_amount || r.debit)} | Cr: ${fmt(r.credit_amount || r.credit)} | Bal: ${fmt(r.running_balance)}`);
    }

    console.log('\n================================================================');
    console.log('✅ RECONCILIATION COMPLETE!');
    console.log('================================================================\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Migration 068 failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration068();
