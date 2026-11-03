import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import mammoth from 'mammoth';
import pool from '../server/db/index.js';

const API = 'http://localhost:5001/api/documents';
const outputsDir = path.resolve('outputs');

const UUID_FILE_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(txt|docx)$/i;

const sampleText = [
  'READIFY CONVERSION API TEST',
  'This is a temporary document used to verify TXT and DOCX conversion.',
  'Unicode check: café — résumé.',
  'Final line: conversion should preserve this text.'
].join('\n');

async function createDocument(status, extractedText) {
  const storedFilename = `${crypto.randomUUID()}.pdf`;

  const result = await pool.query(
    `INSERT INTO documents (
       original_name,
       stored_filename,
       mime_type,
       file_size,
       file_type,
       status,
       extracted_text
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      `readify-conversion-test-${status}.pdf`,
      storedFilename,
      'application/pdf',
      1,
      'pdf',
      status,
      extractedText
    ]
  );

  return result.rows[0].id;
}

async function readJson(response) {
  return response.json();
}

async function main() {
  const ids = [];

  try {
    const completedId = await createDocument('completed', sampleText);
    ids.push(completedId);

    const uploadedId = await createDocument('uploaded', null);
    ids.push(uploadedId);

    const emptyTextId = await createDocument('completed', '');
    ids.push(emptyTextId);

    console.log('Created temporary conversion test records:', ids.join(', '));

    const invalidIdResponse = await fetch(`${API}/abc/convert`, {
      method: 'POST'
    });

    assert.equal(invalidIdResponse.status, 400);
    console.log('PASS: Invalid document ID rejected');

    const missingId = 2147483647;
    const missingCheck = await pool.query(
      'SELECT id FROM documents WHERE id = $1',
      [missingId]
    );

    assert.equal(missingCheck.rows.length, 0);

    const missingResponse = await fetch(`${API}/${missingId}/convert`, {
      method: 'POST'
    });

    assert.equal(missingResponse.status, 404);
    console.log('PASS: Non-existent document rejected');

    const unprocessedResponse = await fetch(`${API}/${uploadedId}/convert`, {
      method: 'POST'
    });

    assert.equal(unprocessedResponse.status, 409);
    console.log('PASS: Unprocessed document rejected');

    const emptyResponse = await fetch(`${API}/${emptyTextId}/convert`, {
      method: 'POST'
    });

    assert.equal(emptyResponse.status, 422);
    console.log('PASS: Empty extracted text rejected');

    const concurrentResponses = await Promise.all([
      fetch(`${API}/${completedId}/convert`, { method: 'POST' }),
      fetch(`${API}/${completedId}/convert`, { method: 'POST' })
    ]);

    const concurrentResults = await Promise.all(
      concurrentResponses.map(async response => ({
        status: response.status,
        data: await readJson(response)
      }))
    );

    assert.deepEqual(
      concurrentResults.map(result => result.status).sort(),
      [200, 201]
    );

    for (const result of concurrentResults) {
      assert.equal(result.data.document.id, completedId);
      assert.ok(result.data.outputs.txt.download_url);
      assert.ok(result.data.outputs.docx.download_url);
      assert.ok(result.data.outputs.txt.file_size > 0);
      assert.ok(result.data.outputs.docx.file_size > 0);
    }

    console.log('PASS: Concurrent conversion requests handled safely');

    const firstConversion = concurrentResults.find(
      result => result.status === 201
    );

    console.log('PASS: TXT and DOCX outputs generated');
    console.log('  TXT size:', firstConversion.data.outputs.txt.file_size);
    console.log('  DOCX size:', firstConversion.data.outputs.docx.file_size);

    let dbResult = await pool.query(
      `SELECT txt_output_path, docx_output_path
       FROM documents
       WHERE id = $1`,
      [completedId]
    );

    let savedPaths = dbResult.rows[0];

    assert.match(savedPaths.txt_output_path, UUID_FILE_PATTERN);
    assert.match(savedPaths.docx_output_path, UUID_FILE_PATTERN);
    assert.ok(!savedPaths.txt_output_path.includes('/'));
    assert.ok(!savedPaths.docx_output_path.includes('/'));

    console.log('PASS: PostgreSQL stores safe output filenames only');

    const txtResponse = await fetch(
      `${API}/${completedId}/download/txt`
    );

    assert.equal(txtResponse.status, 200);
    assert.ok(txtResponse.headers.get('content-type').includes('text/plain'));
    assert.ok(
      txtResponse.headers.get('content-disposition').includes('attachment')
    );

    const downloadedText = await txtResponse.text();
    assert.equal(downloadedText, sampleText);

    console.log('PASS: TXT download returns the original extracted text');

    const docxResponse = await fetch(
      `${API}/${completedId}/download/docx`
    );

    assert.equal(docxResponse.status, 200);
    assert.ok(
      docxResponse.headers
        .get('content-type')
        .includes('application/vnd.openxmlformats-officedocument')
    );
    assert.ok(
      docxResponse.headers.get('content-disposition').includes('attachment')
    );

    const docxBuffer = Buffer.from(await docxResponse.arrayBuffer());

    assert.deepEqual(
      docxBuffer.subarray(0, 2),
      Buffer.from('PK')
    );

    const extractedDocx = await mammoth.extractRawText({
      buffer: docxBuffer
    });

    assert.ok(extractedDocx.value.includes('READIFY CONVERSION API TEST'));
    assert.ok(extractedDocx.value.includes('café'));
    assert.ok(extractedDocx.value.includes('résumé'));

    console.log('PASS: DOCX download is valid and preserves text');

    const originalPaths = { ...savedPaths };

    const repeatResponse = await fetch(
      `${API}/${completedId}/convert`,
      { method: 'POST' }
    );

    assert.equal(repeatResponse.status, 200);

    dbResult = await pool.query(
      `SELECT txt_output_path, docx_output_path
       FROM documents
       WHERE id = $1`,
      [completedId]
    );

    savedPaths = dbResult.rows[0];

    assert.deepEqual(savedPaths, originalPaths);

    console.log('PASS: Repeated conversion reuses existing output files');

    await fs.unlink(
      path.join(outputsDir, savedPaths.docx_output_path)
    );

    const missingOutputResponse = await fetch(
      `${API}/${completedId}/download/docx`
    );

    assert.equal(missingOutputResponse.status, 404);
    console.log('PASS: Missing generated output is detected');

    const regenerationResponse = await fetch(
      `${API}/${completedId}/convert`,
      { method: 'POST' }
    );

    assert.equal(regenerationResponse.status, 201);

    dbResult = await pool.query(
      `SELECT txt_output_path, docx_output_path
       FROM documents
       WHERE id = $1`,
      [completedId]
    );

    savedPaths = dbResult.rows[0];

    assert.equal(savedPaths.txt_output_path, originalPaths.txt_output_path);
    assert.notEqual(savedPaths.docx_output_path, originalPaths.docx_output_path);

    const regeneratedDocxResponse = await fetch(
      `${API}/${completedId}/download/docx`
    );

    assert.equal(regeneratedDocxResponse.status, 200);

    console.log('PASS: Missing DOCX output regenerated successfully');

    const invalidDownloadResponse = await fetch(
      `${API}/abc/download/txt`
    );

    assert.equal(invalidDownloadResponse.status, 400);
    console.log('PASS: Invalid download ID rejected');

    console.log('\nAll conversion API integration checks passed.');
  } finally {
    try {
      if (ids.length > 0) {
        const stored = await pool.query(
          `SELECT txt_output_path, docx_output_path
           FROM documents
           WHERE id = ANY($1::int[])`,
          [ids]
        );

        for (const row of stored.rows) {
          for (const filename of [
            row.txt_output_path,
            row.docx_output_path
          ]) {
            if (
              filename &&
              UUID_FILE_PATTERN.test(filename) &&
              path.basename(filename) === filename
            ) {
              await fs.unlink(
                path.join(outputsDir, filename)
              ).catch(error => {
                if (error.code !== 'ENOENT') throw error;
              });
            }
          }
        }

        await pool.query(
          'DELETE FROM documents WHERE id = ANY($1::int[])',
          [ids]
        );

        console.log('Temporary conversion records and output files cleaned.');
      }
    } finally {
      await pool.end();
    }
  }
}

main().catch(error => {
  console.error('\nConversion API integration test failed:', error);
  process.exitCode = 1;
});
