import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import pool from '../server/db/index.js';

const API = 'http://localhost:5001/api/documents';
const uploadsDir = path.resolve('uploads');
const createdIds = [];

function createImage(text, rows = 1) {
  const canvas = createCanvas(2200, Math.max(250, rows * 60 + 100));
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 36px Arial';

  for (let i = 0; i < rows; i++) {
    ctx.fillText(`${text} ${i + 1} 12345`, 40, 70 + i * 60);
  }

  return canvas.toBuffer('image/jpeg', 90);
}

async function uploadImage(buffer, name) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/jpeg' }), name);

  const response = await fetch(`${API}/upload`, {
    method: 'POST',
    body: form
  });

  const data = await response.json();

  assert.equal(response.status, 201, JSON.stringify(data));

  createdIds.push(data.document.id);
  return data.document.id;
}

async function processDocument(id) {
  const response = await fetch(`${API}/${id}/process`, {
    method: 'POST'
  });

  const data = await response.json();

  return {
    status: response.status,
    data
  };
}

async function cleanup() {
  if (createdIds.length === 0) return;

  const result = await pool.query(
    'SELECT stored_filename FROM documents WHERE id = ANY($1::int[])',
    [createdIds]
  );

  for (const row of result.rows) {
    const filename = row.stored_filename;

    if (filename && path.basename(filename) === filename) {
      await fs.unlink(path.join(uploadsDir, filename)).catch(error => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }

  await pool.query(
    'DELETE FROM documents WHERE id = ANY($1::int[])',
    [createdIds]
  );

  console.log('Temporary safety-test records and files cleaned.');
}

async function main() {
  try {
    console.log('===== CONCURRENT PROCESSING TEST =====');

    const largeImage = createImage(
      'READIFY CONCURRENT PROCESSING CHECK',
      25
    );

    const concurrentId = await uploadImage(
      largeImage,
      'readify-concurrent-test.jpg'
    );

    console.log('Test document ID:', concurrentId);
    console.log('Sending two processing requests simultaneously...');

    const results = await Promise.all([
      processDocument(concurrentId),
      processDocument(concurrentId)
    ]);

    console.log('HTTP responses:', results.map(result => result.status));

    const statuses = results.map(result => result.status).sort(
      (a, b) => a - b
    );

    assert.deepEqual(statuses, [200, 409]);

    const completed = results.find(result => result.status === 200);
    assert.equal(completed.data.document.status, 'completed');

    const conflict = results.find(result => result.status === 409);
    console.log('Conflict response:', conflict.data.error);

    const concurrentRecord = await pool.query(
      `SELECT status, is_scanned, extracted_character_count
       FROM documents WHERE id = $1`,
      [concurrentId]
    );

    assert.equal(concurrentRecord.rows[0].status, 'completed');
    assert.equal(concurrentRecord.rows[0].is_scanned, true);
    assert.ok(concurrentRecord.rows[0].extracted_character_count > 0);

    console.log('PASS: Concurrent duplicate processing prevented.');

    console.log('\n===== MISSING FILE FAILURE TEST =====');

    const smallImage = createImage('READIFY MISSING FILE CHECK');
    const missingId = await uploadImage(
      smallImage,
      'readify-missing-file-test.jpg'
    );

    const stored = await pool.query(
      'SELECT stored_filename FROM documents WHERE id = $1',
      [missingId]
    );

    const filename = stored.rows[0].stored_filename;

    assert.equal(path.basename(filename), filename);

    await fs.unlink(path.join(uploadsDir, filename));

    console.log('Removed the test document from storage.');
    console.log('Requesting processing for the missing file...');

    const failure = await processDocument(missingId);

    console.log('HTTP response:', failure.status);
    console.log('Error response:', failure.data);

    assert.equal(failure.status, 500);

    const failedRecord = await pool.query(
      `SELECT status, error_message
       FROM documents WHERE id = $1`,
      [missingId]
    );

    assert.equal(failedRecord.rows[0].status, 'failed');
    assert.ok(failedRecord.rows[0].error_message);

    console.log('PASS: Missing file recorded as failed.');
    console.log('\nAll safety tests passed.');
  } finally {
    try {
      await cleanup();
    } finally {
      await pool.end();
    }
  }
}

main().catch(error => {
  console.error('Safety verification failed:', error);
  process.exitCode = 1;
});
