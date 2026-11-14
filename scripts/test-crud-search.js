import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import pool from '../server/db/index.js';
import documentsRouter from '../server/routes/documents.js';

const uploadsDir = path.resolve('uploads');
const outputsDir = path.resolve('outputs');

const app = express();
app.use(express.json());
app.use('/api/documents', documentsRouter);

let server;
let baseUrl;

async function setup() {
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(outputsDir, { recursive: true });

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}/api/documents`;
      resolve();
    });
  });
}

async function teardown() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end();
}

async function run() {
  await setup();
  const createdDocIds = [];

  try {
    const catResult = await pool.query(
      `INSERT INTO categories (name, description)
       VALUES ('CRUD Search Category', 'Temporary category for search tests')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    const testCategoryId = catResult.rows[0].id;

    const doc1Result = await pool.query(
      `INSERT INTO documents (
         category_id,
         original_name,
         stored_filename,
         mime_type,
         file_size,
         file_type,
         status,
         extracted_text,
         extracted_character_count,
         extracted_word_count
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        testCategoryId,
        'crud_invoice_alpha_8471.pdf',
        `${crypto.randomUUID()}.pdf`,
        'application/pdf',
        1024,
        'pdf',
        'completed',
        'Invoice total due for services rendered by Readify enterprise.',
        61,
        8
      ]
    );
    const doc1Id = doc1Result.rows[0].id;
    createdDocIds.push(doc1Id);

    const doc2Result = await pool.query(
      `INSERT INTO documents (
         category_id,
         original_name,
         stored_filename,
         mime_type,
         file_size,
         file_type,
         status,
         extracted_text,
         extracted_character_count,
         extracted_word_count
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        null,
        'crud_receipt_beta_9921.png',
        `${crypto.randomUUID()}.png`,
        'image/png',
        2048,
        'png',
        'failed',
        'Scanned handwritten receipt text for hardware purchase.',
        55,
        7
      ]
    );
    const doc2Id = doc2Result.rows[0].id;
    createdDocIds.push(doc2Id);

    const listRes = await fetch(`${baseUrl}`);
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.ok(Array.isArray(listData));
    assert.ok(listData.length >= 2);
    console.log('PASS: List all documents');

    const searchFilenameRes = await fetch(`${baseUrl}?search=alpha_8471`);
    assert.equal(searchFilenameRes.status, 200);
    const searchFilenameData = await searchFilenameRes.json();
    assert.ok(searchFilenameData.some(d => d.id === doc1Id));
    assert.ok(!searchFilenameData.some(d => d.id === doc2Id));
    console.log('PASS: Search by filename');

    const searchTextRes = await fetch(`${baseUrl}?search=enterprise`);
    assert.equal(searchTextRes.status, 200);
    const searchTextData = await searchTextRes.json();
    assert.ok(searchTextData.some(d => d.id === doc1Id));
    assert.ok(!searchTextData.some(d => d.id === doc2Id));
    console.log('PASS: Search by extracted text');

    const statusCompletedRes = await fetch(`${baseUrl}?status=completed`);
    assert.equal(statusCompletedRes.status, 200);
    const statusCompletedData = await statusCompletedRes.json();
    assert.ok(statusCompletedData.some(d => d.id === doc1Id));
    assert.ok(!statusCompletedData.some(d => d.id === doc2Id));

    const statusFailedRes = await fetch(`${baseUrl}?status=failed`);
    assert.equal(statusFailedRes.status, 200);
    const statusFailedData = await statusFailedRes.json();
    assert.ok(statusFailedData.some(d => d.id === doc2Id));
    assert.ok(!statusFailedData.some(d => d.id === doc1Id));
    console.log('PASS: Filter by status');

    const typePdfRes = await fetch(`${baseUrl}?type=pdf`);
    assert.equal(typePdfRes.status, 200);
    const typePdfData = await typePdfRes.json();
    assert.ok(typePdfData.some(d => d.id === doc1Id));
    assert.ok(!typePdfData.some(d => d.id === doc2Id));

    const typePngRes = await fetch(`${baseUrl}?type=png`);
    assert.equal(typePngRes.status, 200);
    const typePngData = await typePngRes.json();
    assert.ok(typePngData.some(d => d.id === doc2Id));
    assert.ok(!typePngData.some(d => d.id === doc1Id));
    console.log('PASS: Filter by file type');

    const catFilterRes = await fetch(`${baseUrl}?category_id=${testCategoryId}`);
    assert.equal(catFilterRes.status, 200);
    const catFilterData = await catFilterRes.json();
    assert.ok(catFilterData.some(d => d.id === doc1Id));
    assert.ok(!catFilterData.some(d => d.id === doc2Id));
    console.log('PASS: Filter by category');

    const multiFilterRes = await fetch(
      `${baseUrl}?status=completed&type=pdf&category_id=${testCategoryId}&search=invoice`
    );
    assert.equal(multiFilterRes.status, 200);
    const multiFilterData = await multiFilterRes.json();
    assert.ok(multiFilterData.some(d => d.id === doc1Id));
    assert.ok(!multiFilterData.some(d => d.id === doc2Id));
    console.log('PASS: Combine multiple filters');

    const invalidStatusRes = await fetch(`${baseUrl}?status=unknown_status`);
    assert.equal(invalidStatusRes.status, 400);

    const invalidTypeRes = await fetch(`${baseUrl}?type=exe`);
    assert.equal(invalidTypeRes.status, 400);

    const invalidCatRes = await fetch(`${baseUrl}?category_id=not_a_number`);
    assert.equal(invalidCatRes.status, 400);

    const negativeCatRes = await fetch(`${baseUrl}?category_id=-3`);
    assert.equal(negativeCatRes.status, 400);
    console.log('PASS: Validation on invalid query filters');

    const testStoredFilename = `${crypto.randomUUID()}.pdf`;
    const testTxtFilename = `${crypto.randomUUID()}.txt`;
    const testDocxFilename = `${crypto.randomUUID()}.docx`;

    const uploadFilePath = path.join(uploadsDir, testStoredFilename);
    const txtFilePath = path.join(outputsDir, testTxtFilename);
    const docxFilePath = path.join(outputsDir, testDocxFilename);

    await fs.writeFile(uploadFilePath, 'Dummy PDF file content for deletion test');
    await fs.writeFile(txtFilePath, 'Dummy TXT content');
    await fs.writeFile(docxFilePath, 'Dummy DOCX content');

    const docToDeleteResult = await pool.query(
      `INSERT INTO documents (
         category_id,
         original_name,
         stored_filename,
         mime_type,
         file_size,
         file_type,
         status,
         extracted_text,
         txt_output_path,
         docx_output_path
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        testCategoryId,
        'crud_delete_target.pdf',
        testStoredFilename,
        'application/pdf',
        100,
        'pdf',
        'completed',
        'Text to be deleted along with all dependent records.',
        testTxtFilename,
        testDocxFilename
      ]
    );
    const deleteTargetId = docToDeleteResult.rows[0].id;

    await pool.query(
      `INSERT INTO document_events (document_id, event_type, description)
       VALUES ($1, 'uploaded', 'Initial upload before deletion')`,
      [deleteTargetId]
    );

    await pool.query(
      `INSERT INTO document_summaries (document_id, summary_type, summary_text, word_count)
       VALUES ($1, 'extractive', 'Temporary summary for deletion test', 5)`,
      [deleteTargetId]
    );

    const fileStatBefore = await fs.stat(uploadFilePath);
    assert.ok(fileStatBefore.size > 0);

    const deleteRes = await fetch(`${baseUrl}/${deleteTargetId}`, {
      method: 'DELETE'
    });
    assert.equal(deleteRes.status, 200);
    const deleteData = await deleteRes.json();
    assert.equal(deleteData.deleted_document_id, deleteTargetId);
    assert.equal(deleteData.database_deleted, true);
    assert.equal(deleteData.files_cleaned, true);
    console.log('PASS: Delete document endpoint with database_deleted and files_cleaned verification');

    const docCheck = await pool.query('SELECT id FROM documents WHERE id = $1', [deleteTargetId]);
    assert.equal(docCheck.rows.length, 0);

    const eventsCheck = await pool.query('SELECT id FROM document_events WHERE document_id = $1', [deleteTargetId]);
    assert.equal(eventsCheck.rows.length, 0);

    const summariesCheck = await pool.query('SELECT id FROM document_summaries WHERE document_id = $1', [deleteTargetId]);
    assert.equal(summariesCheck.rows.length, 0);
    console.log('PASS: Cascade deletion of document_events and document_summaries');

    const uploadExists = await fs.access(uploadFilePath).then(() => true).catch(() => false);
    const txtExists = await fs.access(txtFilePath).then(() => true).catch(() => false);
    const docxExists = await fs.access(docxFilePath).then(() => true).catch(() => false);

    assert.equal(uploadExists, false);
    assert.equal(txtExists, false);
    assert.equal(docxExists, false);
    console.log('PASS: Physical file cleanup in uploads/ and outputs/');

    const lockedDirName = `crud_locked_${crypto.randomUUID()}`;
    const lockedDirPath = path.join(uploadsDir, lockedDirName);
    await fs.mkdir(lockedDirPath, { recursive: true });

    const failedCleanupDoc = await pool.query(
      `INSERT INTO documents (
         category_id,
         original_name,
         stored_filename,
         mime_type,
         file_size,
         file_type,
         status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        testCategoryId,
        'crud_failed_cleanup.pdf',
        lockedDirName,
        'application/pdf',
        100,
        'pdf',
        'uploaded'
      ]
    );
    const failedCleanupDocId = failedCleanupDoc.rows[0].id;

    const failedCleanupRes = await fetch(`${baseUrl}/${failedCleanupDocId}`, {
      method: 'DELETE'
    });
    assert.equal(failedCleanupRes.status, 200);
    const failedCleanupData = await failedCleanupRes.json();
    assert.equal(failedCleanupData.deleted_document_id, failedCleanupDocId);
    assert.equal(failedCleanupData.database_deleted, true);
    assert.equal(failedCleanupData.files_cleaned, false);
    assert.ok(Array.isArray(failedCleanupData.cleanup_warnings));
    assert.ok(failedCleanupData.cleanup_warnings.length > 0);

    const failedDocCheck = await pool.query('SELECT id FROM documents WHERE id = $1', [failedCleanupDocId]);
    assert.equal(failedDocCheck.rows.length, 0);

    await fs.rmdir(lockedDirPath).catch(() => {});
    console.log('PASS: Physical file cleanup failure reported correctly with database_deleted=true and files_cleaned=false');

    const deleteMissingDoc = await fetch(`${baseUrl}/999999999`, {
      method: 'DELETE'
    });
    assert.equal(deleteMissingDoc.status, 404);
    console.log('PASS: Delete nonexistent document returns 404');

    const deleteInvalidId = await fetch(`${baseUrl}/invalid_id`, {
      method: 'DELETE'
    });
    assert.equal(deleteInvalidId.status, 400);

    const deleteNegativeId = await fetch(`${baseUrl}/-10`, {
      method: 'DELETE'
    });
    assert.equal(deleteNegativeId.status, 400);
    console.log('PASS: Delete with invalid ID returns 400');

    console.log('\nALL CRUD SEARCH AND DELETION TESTS PASSED.');
  } finally {
    for (const id of createdDocIds) {
      await pool.query('DELETE FROM documents WHERE id = $1', [id]).catch(() => {});
    }
    await pool.query("DELETE FROM categories WHERE name = 'CRUD Search Category'").catch(() => {});
    await teardown();
  }
}

run().catch((err) => {
  console.error('CRUD search test failed:', err);
  process.exitCode = 1;
  teardown().catch(() => {});
});
