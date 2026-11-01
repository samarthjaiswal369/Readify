import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mammoth from 'mammoth';

import {
  generateTxt,
  generateDocx,
  DocumentExportError
} from '../server/services/documentExporter.js';

const testDirectory = await fs.mkdtemp(
  path.join(os.tmpdir(), 'readify-export-test-')
);

const sampleText = [
  'READIFY DOCUMENT EXPORT TEST 48291',
  'This is the second line of the document.',
  '',
  'Unicode test: café — document processing.'
].join('\n');

function normalize(text) {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

async function main() {
  try {
    console.log('===== TXT GENERATION TEST =====');

    const txt = await generateTxt(sampleText, {
      outputDir: testDirectory
    });

    assert.match(txt.fileName, /^[a-f0-9-]{36}\.txt$/i);

    const txtContent = await fs.readFile(txt.filePath, 'utf8');

    assert.equal(txtContent, sampleText);
    assert.ok(txt.fileSize > 0);

    console.log('PASS: TXT generated successfully.');
    console.log('Filename:', txt.fileName);
    console.log('Size:', txt.fileSize, 'bytes');

    console.log('\n===== DOCX GENERATION TEST =====');

    const docx = await generateDocx(sampleText, {
      outputDir: testDirectory,
      title: 'Readify Export Verification'
    });

    assert.match(docx.fileName, /^[a-f0-9-]{36}\.docx$/i);

    const docxBuffer = await fs.readFile(docx.filePath);

    assert.equal(
      docxBuffer.subarray(0, 4).toString('hex'),
      '504b0304'
    );

    assert.ok(docx.fileSize > 0);

    const extracted = await mammoth.extractRawText({
      path: docx.filePath
    });

    assert.ok(
      normalize(extracted.value).includes(
        normalize('READIFY DOCUMENT EXPORT TEST 48291')
      )
    );

    assert.ok(
      normalize(extracted.value).includes(
        normalize('Unicode test: café — document processing.')
      )
    );

    console.log('PASS: DOCX generated and read back successfully.');
    console.log('Filename:', docx.fileName);
    console.log('Size:', docx.fileSize, 'bytes');
    console.log('Read-back text:', extracted.value.trim());

    console.log('\n===== EMPTY TEXT VALIDATION =====');

    await assert.rejects(
      () => generateTxt('   \n  ', { outputDir: testDirectory }),
      error => error instanceof DocumentExportError &&
        error.code === 'EMPTY_TEXT'
    );

    await assert.rejects(
      () => generateDocx('', { outputDir: testDirectory }),
      error => error instanceof DocumentExportError &&
        error.code === 'EMPTY_TEXT'
    );

    console.log('PASS: Empty TXT and DOCX content rejected.');

    console.log('\n===== OUTPUT FILE SAFETY =====');

    const files = await fs.readdir(testDirectory);

    assert.equal(files.length, 2);
    assert.ok(files.every(name => !name.endsWith('.tmp')));

    console.log('PASS: Only the two expected output files exist.');
    console.log('\nAll document exporter tests passed.');
  } finally {
    await fs.rm(testDirectory, {
      recursive: true,
      force: true
    });

    console.log('Temporary test directory cleaned.');
  }
}

main().catch(error => {
  console.error('Document exporter tests failed:', error);
  process.exitCode = 1;
});
