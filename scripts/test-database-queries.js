import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import pool from '../server/db/index.js';

async function run() {
  const sqlPath = path.resolve('server/db/demonstration_queries.sql');
  const sqlContent = await fs.readFile(sqlPath, 'utf8');

  const statements = sqlContent
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0);

  const client = await pool.connect();

  try {
    let executedCount = 0;
    for (const statement of statements) {
      const result = await client.query(statement);
      executedCount++;
      if (result.rows && result.rows.length > 0) {
        const firstRow = result.rows[0];
        if (firstRow.step) {
          console.log(`PASS: ${firstRow.step}`);
        } else if (firstRow.status) {
          console.log(`STATUS: ${firstRow.status}`);
        }
      }
    }

    assert.ok(executedCount >= 15);

    const tablesCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('categories', 'documents', 'document_events', 'document_summaries')
      ORDER BY table_name;
    `);

    assert.equal(tablesCheck.rows.length, 4);

    const fkCheck = await client.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name;
    `);

    assert.ok(fkCheck.rows.length >= 3);

    console.log(`\nALL ${executedCount} DE DEMONSTRATION STATEMENTS EXECUTED SUCCESSFULLY.`);
    console.log(`VERIFIED TABLES: ${tablesCheck.rows.map(r => r.table_name).join(', ')}`);
    console.log(`VERIFIED FOREIGN KEYS: ${fkCheck.rows.length} relationships active.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(error => {
  console.error('Database demonstration query execution failed:', error);
  process.exitCode = 1;
});
