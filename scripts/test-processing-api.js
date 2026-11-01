import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import pool from '../server/db/index.js';

const API = 'http://localhost:5001/api/documents';
const uploadsDir = path.resolve('uploads');

function createPdf(objects) {
  const parts = [Buffer.from('%PDF-1.4\n%READIFY\n', 'ascii')];
  const offsets = [0];
  let offset = parts[0].length;

  for (let i = 0; i < objects.length; i++) {
    const header = Buffer.from(`${i + 1} 0 obj\n`, 'ascii');
    const body = Buffer.isBuffer(objects[i])
      ? objects[i]
      : Buffer.from(objects[i], 'ascii');
    const footer = Buffer.from('\nendobj\n', 'ascii');

    offsets.push(offset);
    parts.push(header, body, footer);
    offset += header.length + body.length + footer.length;
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += '0000000000 65535 f \n';

  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  xref += `startxref\n${xrefOffset}\n%%EOF\n`;

  parts.push(Buffer.from(xref, 'ascii'));
  return Buffer.concat(parts);
}

function createStream(buffer) {
  return Buffer.concat([
    Buffer.from(`<< /Length ${buffer.length} >>\nstream\n`, 'ascii'),
    buffer,
    Buffer.from('\nendstream', 'ascii')
  ]);
}

function createTextPdf() {
  const content = Buffer.from(
    'BT\n/F1 20 Tf\n35 75 Td\n(READIFY API PDF TEST 48291) Tj\nET',
    'ascii'
  );

  return createPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 130] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    createStream(content),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]);
}

function createTestImage() {
  const canvas = createCanvas(1400, 280);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1400, 280);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 64px Arial';
  ctx.fillText('READIFY API OCR TEST 73915', 40, 165);

  return canvas.toBuffer('image/jpeg', 92);
}

function createScannedPdf(jpegBuffer) {
  const content = Buffer.from(
    'q\n500 0 0 100 0 0 cm\n/Im0 Do\nQ',
    'ascii'
  );

  const image = Buffer.concat([
    Buffer.from(
      `<< /Type /XObject /Subtype /Image /Width 1400 /Height 280 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBuffer.length} >>\nstream\n`,
      'ascii'
    ),
    jpegBuffer,
    Buffer.from('\nendstream', 'ascii')
  ]);

  return createPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 100] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>',
    createStream(content),
    image
  ]);
}

function normalize(text) {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function upload(name, buffer, mime) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), name);

  const response = await fetch(`${API}/upload`, {
    method: 'POST',
    body: form
  });

  const data = await response.json();

  assert.equal(
    response.status,
    201,
    `Upload failed for ${name}: ${JSON.stringify(data)}`
  );

  console.log(`Uploaded ${name}, document ID: ${data.document.id}`);
  return data.document.id;
}

async function process(id, name, expectedText, expectOcr) {
  const response = await fetch(`${API}/${id}/process`, {
    method: 'POST'
  });

  const data = await response.json();

  assert.equal(
    response.status,
    200,
    `Processing failed for ${name}: ${JSON.stringify(data)}`
  );

  assert.equal(data.document.status, 'completed');
  assert.ok(normalize(data.document.extracted_text).includes(expectedText));

  assert.equal(data.document.is_scanned, expectOcr);
  assert.equal(data.document.ocr_engine !== null, expectOcr);

  console.log(`PASS: ${name}`);
  console.log(`  Extracted: ${data.document.extracted_text}`);
  console.log(`  OCR: ${data.document.ocr_engine || 'Not required'}`);
  console.log(`  Characters: ${data.document.extracted_character_count}`);
  console.log(`  Words: ${data.document.extracted_word_count}`);
  console.log(`  Time: ${data.document.processing_time_ms} ms`);
  console.log(`  Warnings: ${data.processing.warnings.length}`);
}

async function main() {
  const ids = [];

  try {
    const image = createTestImage();

    const textPdfId = await upload(
      'readify-api-text-test.pdf',
      createTextPdf(),
      'application/pdf'
    );
    ids.push(textPdfId);

    const scannedPdfId = await upload(
      'readify-api-scanned-test.pdf',
      createScannedPdf(image),
      'application/pdf'
    );
    ids.push(scannedPdfId);

    const imageId = await upload(
      'readify-api-image-test.jpg',
      image,
      'image/jpeg'
    );
    ids.push(imageId);

    await process(
      textPdfId,
      'Text-based PDF extraction',
      'READIFYAPIPDFTEST48291',
      false
    );

    await process(
      scannedPdfId,
      'Scanned PDF OCR',
      'READIFYAPIOCRTEST73915',
      true
    );

    await process(
      imageId,
      'Image OCR',
      'READIFYAPIOCRTEST73915',
      true
    );

    const duplicate = await fetch(`${API}/${textPdfId}/process`, {
      method: 'POST'
    });

    assert.equal(duplicate.status, 409);
    console.log('PASS: Duplicate processing rejected');

    const dbResult = await pool.query(
      `SELECT id, original_name, status, is_scanned,
              extracted_character_count, extracted_word_count, ocr_engine
       FROM documents
       WHERE id = ANY($1::int[])
       ORDER BY id`,
      [ids]
    );

    assert.equal(dbResult.rows.length, 3);
    assert.ok(dbResult.rows.every(row => row.status === 'completed'));

    console.log('\n===== POSTGRESQL VERIFICATION =====');
    console.table(dbResult.rows);

    console.log('\nAll API integration checks passed.');
    console.log('Test document IDs:', ids.join(', '));
  } finally {
    try {
      if (ids.length > 0) {
        const stored = await pool.query(
          'SELECT stored_filename FROM documents WHERE id = ANY($1::int[])',
          [ids]
        );

        for (const row of stored.rows) {
          const filename = row.stored_filename;

          if (filename && path.basename(filename) === filename) {
            await fs.unlink(path.join(uploadsDir, filename)).catch(error => {
              if (error.code !== 'ENOENT') throw error;
            });
          }
        }

        await pool.query(
          'DELETE FROM documents WHERE id = ANY($1::int[])',
          [ids]
        );

        console.log('Temporary API test records and files cleaned.');
      }
    } finally {
      await pool.end();
    }
  }
}

main().catch(error => {
  console.error('\nAPI integration test failed:', error);
  process.exitCode = 1;
});
