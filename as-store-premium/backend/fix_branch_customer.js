import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log('Connecting to database...');
    // Find customer for AS
    const custRes = await pool.query(`
      SELECT id, name, mobile, address 
      FROM customers 
      WHERE REGEXP_REPLACE(LOWER(name), '[^a-z0-9]', '', 'g') IN ('asstore', 'as')
         OR mobile LIKE '%9979769700%'
      ORDER BY id ASC
    `);
    console.log('Found AS customers:', custRes.rows);

    // Find shops
    const shopsRes = await pool.query(`
      SELECT id, name, phone, area, customer_id
      FROM shops
      WHERE location_type != 'warehouse'
    `);
    console.log('Found shops:', shopsRes.rows);

    // 1. Explicitly link AS shop to AS STORE customer
    const asCust = custRes.rows[0];
    if (asCust) {
      await pool.query(`
        UPDATE shops 
        SET customer_id = $1 
        WHERE REGEXP_REPLACE(LOWER(name), '[^a-z0-9]', '', 'g') IN ('as', 'asstore')
          AND location_type != 'warehouse'
      `, [asCust.id]);
      console.log(`Updated shop AS to customer_id ${asCust.id} (${asCust.name})`);

      await pool.query(`
        UPDATE customers
        SET branch_shop_id = (SELECT id FROM shops WHERE REGEXP_REPLACE(LOWER(name), '[^a-z0-9]', '', 'g') IN ('as', 'asstore') AND location_type != 'warehouse' LIMIT 1)
        WHERE id = $1
      `, [asCust.id]);

      await pool.query(`
        UPDATE customers
        SET branch_shop_id = NULL
        WHERE id != $1 AND branch_shop_id = (SELECT id FROM shops WHERE REGEXP_REPLACE(LOWER(name), '[^a-z0-9]', '', 'g') IN ('as', 'asstore') AND location_type != 'warehouse' LIMIT 1)
      `, [asCust.id]);
    }

    // 2. Explicitly link PS2
    await pool.query(`
      UPDATE shops sh
      SET customer_id = c.id
      FROM customers c
      WHERE REGEXP_REPLACE(LOWER(sh.name), '[^a-z0-9]', '', 'g') = 'ps2'
        AND sh.location_type != 'warehouse'
        AND (REGEXP_REPLACE(LOWER(c.name), '[^a-z0-9]', '', 'g') = 'ps2' OR c.mobile LIKE '%9904269700%')
    `);

    // 3. Explicitly link PS1
    await pool.query(`
      UPDATE shops sh
      SET customer_id = c.id
      FROM customers c
      WHERE REGEXP_REPLACE(LOWER(sh.name), '[^a-z0-9]', '', 'g') = 'ps1'
        AND sh.location_type != 'warehouse'
        AND (REGEXP_REPLACE(LOWER(c.name), '[^a-z0-9]', '', 'g') = 'ps1' OR c.mobile LIKE '%9099569700%')
    `);

    console.log('Reconciliation complete!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
