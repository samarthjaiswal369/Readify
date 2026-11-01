import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { createCanvas } from '@napi-rs/canvas';

import {
  processPdf,
  processDocx,
  processImage,
  DocumentProcessingError,
  terminateOcrWorker
} from '../server/services/documentProcessor.js';

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

function createStream(buffer, dictionary = '') {
  return Buffer.concat([
    Buffer.from(`<< ${dictionary} /Length ${buffer.length} >>\nstream\n`, 'ascii'),
    buffer,
    Buffer.from('\nendstream', 'ascii')
  ]);
}

function createTextPdf() {
  const content = Buffer.from(
    'BT\n/F1 20 Tf\n35 75 Td\n(READIFY PDF EXTRACTION TEST 48291) Tj\nET',
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
  ctx.fillText('READIFY OCR CHECK 48291', 40, 165);

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

function createDocx() {
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
      '<w:p><w:r><w:t>READIFY DOCX EXTRACTION TEST 73915</w:t></w:r></w:p>' +
      '</w:body></w:document>'
    )
  );

  return zip.toBuffer();
}

function normalize(text) {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

let passed = 0;
let failed = 0;

async function test(name, callback) {
  try {
    await callback();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(error.stack || error.message);
  }
}

async function main() {
  const image = createTestImage();
  const textPdf = createTextPdf();
  const scannedPdf = createScannedPdf(image);
  const docx = createDocx();

  try {
    await test('Text-based PDF extraction without OCR', async () => {
      const result = await processPdf(textPdf);

      assert.ok(normalize(result.text).includes('READIFYPDFEXTRACTIONTEST'));
      assert.equal(result.isScanned, false);
      assert.equal(result.ocrEngine, null);
      assert.equal(result.pageCount, 1);
    });

    await test('DOCX text extraction', async () => {
      const result = await processDocx(docx);

      assert.ok(normalize(result.text).includes('READIFYDOCXEXTRACTIONTEST'));
      assert.equal(result.isScanned, false);
    });

    await test('Image OCR', async () => {
      const result = await processImage(image);

      assert.ok(normalize(result.text).includes('READIFYOCRCHECK'));
      assert.ok(normalize(result.text).includes('48291'));
      assert.equal(result.isScanned, true);
      assert.equal(result.ocrEngine, 'tesseract.js');
    });

    await test('Scanned PDF OCR', async () => {
      const result = await processPdf(scannedPdf);

      assert.ok(normalize(result.text).includes('READIFYOCRCHECK'));
      assert.ok(normalize(result.text).includes('48291'));
      assert.equal(result.isScanned, true);
      assert.deepEqual(result.ocrPages, [1]);
    });

    await test('Invalid PDF returns a controlled error', async () => {
      await assert.rejects(
        processPdf(Buffer.from('This is not a PDF')),
        error => error instanceof DocumentProcessingError
      );
    });

    await test('Invalid image returns a controlled error', async () => {
      await assert.rejects(
        processImage(Buffer.from('This is not an image')),
        error => error instanceof DocumentProcessingError
      );
    });

    await test('Empty PDF is handled correctly', async () => {
      const blankPdf = createPdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 150] /Resources << >> /Contents 4 0 R >>',
        createStream(Buffer.alloc(0))
      ]);

      const result = await processPdf(blankPdf);

      assert.equal(result.text, '');
      assert.ok(result.warnings.length > 0);
    });

    console.log('\n===== PROCESSING TEST SUMMARY =====');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
  } finally {
    await terminateOcrWorker();
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(async error => {
  console.error('Test runner failed:', error);
  await terminateOcrWorker();
  process.exitCode = 1;
});
