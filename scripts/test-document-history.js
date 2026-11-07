import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  Document,
  Packer,
  Paragraph
} from 'docx';
import pool from '../server/db/index.js';

const API = 'http://localhost:5001/api/documents';
const uploadsDir = path.resolve('uploads');
const outputsDir = path.resolve('outputs');

const UUID_FILE_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(pdf|docx|png|jpg|jpeg|txt)$/i;

async function createDocx() {
  const document = new Document({
    creator: 'Readify Test',
    title: 'Readify History Test',
    sections: [
      {
        children: [
          new Paragraph('READIFY HISTORY TEST 58241'),
          new Paragraph('This document checks upload, processing and export history.'),
          new Paragraph('Final verification line.')
        ]
      }
    ]
  });

  return Packer.toBuffer(document);
}

async function uploadDocx(buffer) {
  const form = new FormData();
  form.append(
    'file',
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }),
    'readify-history-test.docx'
  );

  const response = await fetch(`${API}/upload`, {
    method: 'POST',
    body: form
  });

  const data = await response.json();

  assert.equal(
    response.status,
    201,
    `DOCX upload failed: ${JSON.stringify(data)}`
  );

  return data.document.id;
}

async function getHistory(documentId) {
  const response = await fetch(`${API}/${documentId}/history`);
  const data = await response.json();

  assert.equal(
    response.status,
    200,
    `History request failed: ${JSON.stringify(data)}`
  );

  assert.equal(data.document_id, documentId);
  assert.ok(Array.isArray(data.events));

  return data.events;
}

async function createMissingFileDocument() {
  const storedFilename = `${crypto.randomUUID()}.pdf`;

  const result = await pool.query(
    `INSERT INTO documents (
       original_name,
       stored_filename,
       mime_type,
       file_size,
       file_type,
       status
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      'readify-history-missing-file.pdf',
      storedFilename,
      'application/pdf',
      1,
      'pdf',
      'uploaded'
    ]
  );

  return result.rows[0].id;
}

async function cleanup(ids) {
  if (ids.length === 0) return;

  const records = await pool.query(
    `SELECT stored_filename, txt_output_path, docx_output_path
     FROM documents
     WHERE id = ANY($1::int[])`,
    [ids]
  );

  for (const row of records.rows) {
    for (const [directory, filename] of [
      [uploadsDir, row.stored_filename],
      [outputsDir, row.txt_output_path],
      [outputsDir, row.docx_output_path]
    ]) {
      if (
        filename &&
        path.basename(filename) === filename &&
        UUID_FILE_PATTERN.test(filename)
      ) {
        await fs.unlink(path.join(directory, filename)).catch(error => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
    }
  }

  await pool.query(
    'DELETE FROM documents WHERE id = ANY($1::int[])',
    [ids]
  );

  console.log('Temporary documents, generated files and history records cleaned.');
}

async function main() {
  const ids = [];

  try {
    console.log('\n========== HISTORY API VALIDATION ==========');

    const invalidResponse = await fetch(`${API}/abc/history`);
    assert.equal(invalidResponse.status, 400);
    console.log('PASS: Invalid history document ID rejected');

    const missingResponse = await fetch(`${API}/2147483647/history`);
    assert.equal(missingResponse.status, 404);
    console.log('PASS: Missing document history returns 404');

    console.log('\n========== SUCCESSFUL DOCUMENT LIFECYCLE ==========');

    const buffer = await createDocx();
    const documentId = await uploadDocx(buffer);
    ids.push(documentId);

    let events = await getHistory(documentId);

    assert.equal(events.length, 1);
    assert.equal(events[0].event_type, 'uploaded');
    assert.equal(events[0].metadata.file_type, 'docx');

    console.log('PASS: Upload event recorded');

    const processResponse = await fetch(
      `${API}/${documentId}/process`,
      { method: 'POST' }
    );

    const processData = await processResponse.json();

    assert.equal(
      processResponse.status,
      200,
      `Processing failed: ${JSON.stringify(processData)}`
    );

    assert.equal(processData.document.status, 'completed');
    assert.ok(
      processData.document.extracted_text.includes('READIFY HISTORY TEST 58241')
    );

    events = await getHistory(documentId);

    const eventTypes = events.map(event => event.event_type);

    assert.ok(eventTypes.includes('uploaded'));
    assert.ok(eventTypes.includes('processing_started'));
    assert.ok(eventTypes.includes('processing_completed'));

    const completedEvent = events.find(
      event => event.event_type === 'processing_completed'
    );

    assert.ok(completedEvent.metadata.extracted_character_count > 0);
    assert.ok(completedEvent.metadata.extracted_word_count > 0);

    console.log('PASS: Processing start and completion events recorded');

    const conversionResponse = await fetch(
      `${API}/${documentId}/convert`,
      { method: 'POST' }
    );

    const conversionData = await conversionResponse.json();

    assert.equal(
      conversionResponse.status,
      201,
      `Conversion failed: ${JSON.stringify(conversionData)}`
    );

    events = await getHistory(documentId);

    const outputEvent = events.find(
      event => event.event_type === 'outputs_generated'
    );

    assert.ok(outputEvent);
    assert.ok(outputEvent.metadata.txt_file_size > 0);
    assert.ok(outputEvent.metadata.docx_file_size > 0);
    assert.deepEqual(
      outputEvent.metadata.created_formats,
      ['txt', 'docx']
    );

    console.log('PASS: TXT and DOCX generation event recorded');

    console.log('\n========== FAILED PROCESSING LIFECYCLE ==========');

    const failedId = await createMissingFileDocument();
    ids.push(failedId);

    const failedResponse = await fetch(
      `${API}/${failedId}/process`,
      { method: 'POST' }
    );

    const failedData = await failedResponse.json();

    assert.equal(failedResponse.status, 500);
    assert.equal(failedData.status, 'failed');

    events = await getHistory(failedId);

    const failedTypes = events.map(event => event.event_type);

    assert.ok(failedTypes.includes('processing_started'));
    assert.ok(failedTypes.includes('processing_failed'));

    const failureEvent = events.find(
      event => event.event_type === 'processing_failed'
    );

    assert.ok(failureEvent.metadata.error_message);
    console.log('PASS: Failed processing event recorded');

    console.log('\n========== EVENT ORDER AND DATABASE ==========');

    const databaseEvents = await pool.query(
      `SELECT event_type, description, created_at, metadata
       FROM document_events
       WHERE document_id = $1
       ORDER BY created_at ASC, id ASC`,
      [documentId]
    );

    const chronologicalTypes = databaseEvents.rows.map(
      event => event.event_type
    );

    assert.deepEqual(chronologicalTypes, [
      'uploaded',
      'processing_started',
      'processing_completed',
      'outputs_generated'
    ]);

    console.table(databaseEvents.rows.map(event => ({
      event_type: event.event_type,
      description: event.description,
      created_at: event.created_at
    })));

    console.log('\nAll document history integration checks passed.');
  } finally {
    try {
      await cleanup(ids);
    } finally {
      await pool.end();
    }
  }
}

main().catch(error => {
  console.error('\nDocument history integration test failed:', error);
  process.exitCode = 1;
});
