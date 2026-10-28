import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDatabase() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

    console.log('Connecting to PostgreSQL database...');
    await pool.query(schemaSql);
    console.log('Database schema successfully initialized.');

    const res = await pool.query('SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2', ['public', 'documents']);
    if (res.rows.length > 0) {
      console.log('Verified: "documents" table exists.');
    }
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDatabase();
