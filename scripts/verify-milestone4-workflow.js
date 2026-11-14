import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { createCanvas } from '@napi-rs/canvas';
import pool from '../server/db/index.js';

function createPdf(objects) {
  const parts = [Buffer.from('%PDF-1.4\n%READIFY\n', 'ascii')];
  const offsets = [0];
  let offset = parts[0].length;

  for (let i = 0; i < objects.length; i++) {
    const header = Buffer.from(`${i + 1} 0 obj\n`, 'ascii');
    const body = Buffer.isBuffer(objects[i]) ? objects[i] : Buffer.from(objects[i], 'ascii');
    const footer = Buffer.from('\nendobj\n', 'ascii');
    offsets.push(offset);
    parts.push(header, body, footer);
    offset += header.length + body.length + footer.length;
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'ascii'));
  return Buffer.concat(parts);
}

function createTextPdf(text = 'READIFY TEST SUITE WORKFLOW VERIFICATION 9841') {
  const content = Buffer.from(`BT\n/F1 16 Tf\n30 70 Td\n(${text}) Tj\nET`, 'ascii');
  const stream = Buffer.concat([
    Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'ascii'),
    content,
    Buffer.from('\nendstream', 'ascii')
  ]);
  return createPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 120] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    stream,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]);
}

function createTestDocx(text = 'Readify DOCX Workflow Text Extraction 8291') {
  const zip = new AdmZip();
  zip.addFile(
    '[Content_Types].xml',
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>'
    )
  );
  zip.addFile(
    '_rels/.rels',
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'
    )
  );
  zip.addFile(
    'word/document.xml',
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' +
      `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>` +
      '</w:body>' +
      '</w:document>'
    )
  );
  return zip.toBuffer();
}

function createTestPng() {
  const canvas = createCanvas(400, 100);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 400, 100);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 24px Arial';
  ctx.fillText('READIFY TEST', 20, 50);
  return canvas.toBuffer('image/png');
}

async function uploadFile(baseUrl, filename, buffer, mimeType, categoryId = null) {
  const boundary = `----FormBoundary${crypto.randomUUID()}`;
  const parts = [];

  if (categoryId !== null) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="category_id"\r\n\r\n` +
      `${categoryId}\r\n`
    );
  }

  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  );

  const payload = Buffer.concat([
    Buffer.from(parts.join(''), 'utf-8'),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
  ]);

  const res = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body: payload
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function run() {
  const base = 'http://localhost:5001/api/documents';
  const trackedDocIds = [];

  try {
    const catsRes = await fetch('http://localhost:5001/api/categories');
    assert.equal(catsRes.status, 200);
    const categories = await catsRes.json();
    assert.ok(categories.length >= 5);
    const testCatId = categories[0].id;

    const pdfBuffer = createTextPdf('READIFY DIGITAL PDF CONTENT ALPHA 1122');
    const pdfUpload = await uploadFile(base, 'test_workflow_doc.pdf', pdfBuffer, 'application/pdf', testCatId);
    assert.equal(pdfUpload.status, 201);
    assert.ok(pdfUpload.data.document?.id);
    const pdfDocId = pdfUpload.data.document.id;
    trackedDocIds.push(pdfDocId);
    console.log('STEP 1: Upload a PDF - PASSED (Doc ID: ' + pdfDocId + ')');

    const docxBuffer = createTestDocx('READIFY DOCX WORKFLOW CONTENT BETA 3344');
    const docxUpload = await uploadFile(base, 'test_workflow_doc.docx', docxBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', testCatId);
    assert.equal(docxUpload.status, 201);
    assert.ok(docxUpload.data.document?.id);
    const docxDocId = docxUpload.data.document.id;
    trackedDocIds.push(docxDocId);
    console.log('STEP 2: Upload a DOCX - PASSED (Doc ID: ' + docxDocId + ')');

    const pngBuffer = createTestPng();
    const pngUpload = await uploadFile(base, 'test_workflow_image.png', pngBuffer, 'image/png', testCatId);
    assert.equal(pngUpload.status, 201);
    assert.ok(pngUpload.data.document?.id);
    const pngDocId = pngUpload.data.document.id;
    trackedDocIds.push(pngDocId);
    console.log('STEP 3: Upload an Image - PASSED (Doc ID: ' + pngDocId + ')');

    const badExt = await uploadFile(base, 'script.exe', Buffer.from('fake exe content'), 'application/octet-stream');
    assert.equal(badExt.status, 400);

    const emptyFile = await uploadFile(base, 'empty.pdf', Buffer.alloc(0), 'application/pdf');
    assert.equal(emptyFile.status, 400);

    const mimeMismatch = await uploadFile(base, 'test.pdf', Buffer.from('not pdf content'), 'image/png');
    assert.equal(mimeMismatch.status, 400);
    console.log('STEP 4: Verify file validation - PASSED');

    const pdfProcRes = await fetch(`${base}/${pdfDocId}/process`, { method: 'POST' });
    assert.equal(pdfProcRes.status, 200);
    const pdfProcData = await pdfProcRes.json();
    assert.equal(pdfProcData.document.status, 'completed');

    const docxProcRes = await fetch(`${base}/${docxDocId}/process`, { method: 'POST' });
    assert.equal(docxProcRes.status, 200);
    const docxProcData = await docxProcRes.json();
    assert.equal(docxProcData.document.status, 'completed');
    console.log('STEP 5: Process documents - PASSED');

    assert.ok(pdfProcData.document.extracted_text.includes('READIFY DIGITAL PDF CONTENT ALPHA 1122'));
    assert.ok(docxProcData.document.extracted_text.includes('READIFY DOCX WORKFLOW CONTENT BETA 3344'));
    assert.ok(pdfProcData.document.extracted_character_count > 0);
    assert.ok(docxProcData.document.extracted_word_count > 0);
    console.log('STEP 6: Verify extracted text - PASSED');

    const previewRes = await fetch(`${base}/${pdfDocId}`);
    assert.equal(previewRes.status, 200);
    const previewData = await previewRes.json();
    assert.equal(previewData.id, pdfDocId);
    assert.equal(previewData.original_name, 'test_workflow_doc.pdf');
    assert.equal(previewData.status, 'completed');
    console.log('STEP 7: View document details and preview - PASSED');

    const convertRes = await fetch(`${base}/${pdfDocId}/convert`, { method: 'POST' });
    assert.equal(convertRes.status, 201);

    const downloadTxt = await fetch(`${base}/${pdfDocId}/download/txt`);
    assert.equal(downloadTxt.status, 200);
    const txtContent = await downloadTxt.text();
    assert.ok(txtContent.includes('READIFY DIGITAL PDF CONTENT ALPHA 1122'));
    console.log('STEP 8: Export/download TXT - PASSED');

    const downloadDocx = await fetch(`${base}/${pdfDocId}/download/docx`);
    assert.equal(downloadDocx.status, 200);
    const docxBlob = await downloadDocx.arrayBuffer();
    assert.ok(docxBlob.byteLength > 1000);
    console.log('STEP 9: Export/download DOCX - PASSED');

    const historyRes = await fetch(`${base}/${pdfDocId}/history`);
    assert.equal(historyRes.status, 200);
    const historyData = await historyRes.json();
    assert.ok(Array.isArray(historyData.events));
    const eventTypes = historyData.events.map(e => e.event_type);
    assert.ok(eventTypes.includes('uploaded'));
    assert.ok(eventTypes.includes('processing_started'));
    assert.ok(eventTypes.includes('processing_completed'));
    assert.ok(eventTypes.includes('outputs_generated'));
    console.log('STEP 10: Check document history - PASSED (' + historyData.events.length + ' events)');

    const searchFilenameRes = await fetch(`${base}?search=test_workflow_doc.pdf`);
    assert.equal(searchFilenameRes.status, 200);
    const searchFilenameDocs = await searchFilenameRes.json();
    assert.ok(searchFilenameDocs.some(d => d.id === pdfDocId));
    console.log('STEP 11: Search by filename - PASSED');

    const searchTextRes = await fetch(`${base}?search=ALPHA+1122`);
    assert.equal(searchTextRes.status, 200);
    const searchTextDocs = await searchTextRes.json();
    assert.ok(searchTextDocs.some(d => d.id === pdfDocId));
    console.log('STEP 12: Search by extracted text - PASSED');

    const multiFilterRes = await fetch(`${base}?status=completed&type=pdf&category_id=${testCatId}&search=workflow`);
    assert.equal(multiFilterRes.status, 200);
    const multiFilterDocs = await multiFilterRes.json();
    assert.ok(multiFilterDocs.some(d => d.id === pdfDocId));
    console.log('STEP 13: Combine status, type, and category filters - PASSED');

    const resetRes = await fetch(base);
    assert.equal(resetRes.status, 200);
    const resetDocs = await resetRes.json();
    assert.ok(resetDocs.length >= 3);
    console.log('STEP 14: Reset filters - PASSED');

    await pool.query(
      `INSERT INTO document_summaries (document_id, summary_type, summary_text, word_count)
       VALUES ($1, 'extractive', 'Temporary summary for cascade test', 5)`,
      [pdfDocId]
    );

    const deleteRes = await fetch(`${base}/${pdfDocId}`, { method: 'DELETE' });
    assert.equal(deleteRes.status, 200);
    const deleteData = await deleteRes.json();
    assert.equal(deleteData.database_deleted, true);
    assert.equal(deleteData.files_cleaned, true);
    console.log('STEP 15: Delete a temporary document - PASSED');

    const dbCheck = await pool.query('SELECT id FROM documents WHERE id = $1', [pdfDocId]);
    assert.equal(dbCheck.rows.length, 0);
    const eventsCheck = await pool.query('SELECT id FROM document_events WHERE document_id = $1', [pdfDocId]);
    assert.equal(eventsCheck.rows.length, 0);
    const summariesCheck = await pool.query('SELECT id FROM document_summaries WHERE document_id = $1', [pdfDocId]);
    assert.equal(summariesCheck.rows.length, 0);
    console.log('STEP 16: Verify related database records are removed (cascade) - PASSED');

    const lockedDirName = `cleanup_locked_${crypto.randomUUID()}`;
    const lockedDirPath = path.resolve('uploads', lockedDirName);
    await fs.mkdir(lockedDirPath, { recursive: true });

    const failedDocResult = await pool.query(
      `INSERT INTO documents (category_id, original_name, stored_filename, mime_type, file_size, file_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [testCatId, 'fail_cleanup.pdf', lockedDirName, 'application/pdf', 100, 'pdf', 'uploaded']
    );
    const failedDocId = failedDocResult.rows[0].id;
    trackedDocIds.push(failedDocId);

    const failedDelRes = await fetch(`${base}/${failedDocId}`, { method: 'DELETE' });
    assert.equal(failedDelRes.status, 200);
    const failedDelData = await failedDelRes.json();
    assert.equal(failedDelData.database_deleted, true);
    assert.equal(failedDelData.files_cleaned, false);
    assert.ok(Array.isArray(failedDelData.cleanup_warnings));
    assert.ok(failedDelData.cleanup_warnings.length > 0);
    await fs.rmdir(lockedDirPath).catch(() => {});
    console.log('STEP 17: Verify physical file cleanup and cleanup warnings - PASSED');

    console.log('\nALL 17 DOCUMENT WORKFLOW VERIFICATION STEPS PASSED SUCCESSFULLY.');
  } finally {
    for (const id of trackedDocIds) {
      await pool.query('DELETE FROM documents WHERE id = $1', [id]).catch(() => {});
    }
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Workflow verification failed:', err);
  process.exitCode = 1;
});
