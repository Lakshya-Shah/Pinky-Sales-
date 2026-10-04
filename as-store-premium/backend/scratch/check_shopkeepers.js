import 'dotenv/config';
import { allRecords } from '../database.js';

const rows = await allRecords(`
  SELECT u.id, u.username, u.role, u.shop_id, s.name as shop_name 
  FROM users u 
  LEFT JOIN shops s ON s.id = u.shop_id
  WHERE u.role IN ('shopkeeper', 'admin')
`);
console.log('SHOPKEEPERS:', JSON.stringify(rows, null, 2));
process.exit(0);
