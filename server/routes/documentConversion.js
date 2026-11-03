import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../db/index.js';
import {
  generateTxt,
  generateDocx,
  DocumentExportError
} from '../services/documentExporter.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputsDir = path.resolve(__dirname, '../../outputs');

const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(txt|docx)$/i;

function getDocumentId(value) {
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1
  ) {
    return null;
  }

  return Number(value);
}

async function findOutputFile(filename, extension) {
  if (
    typeof filename !== 'string' ||
    !UUID_PATTERN.test(filename) ||
    path.basename(filename) !== filename ||
    !filename.toLowerCase().endsWith(`.${extension}`)
  ) {
    return null;
  }

  const filePath = path.resolve(outputsDir, filename);

  if (path.dirname(filePath) !== outputsDir) {
    return null;
  }

  try {
    const stats = await fs.lstat(filePath);

    if (!stats.isFile() || stats.isSymbolicLink()) {
      return null;
    }

    return {
      fileName: filename,
      filePath,
      fileSize: stats.size
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function removeOutputFile(filename, extension) {
  const output = await findOutputFile(filename, extension);

  if (output) {
    await fs.unlink(output.filePath);
  }
}

function createConversionResponse(documentId, txtFile, docxFile, alreadyConverted) {
  return {
    message: alreadyConverted
      ? 'Machine-readable outputs already exist.'
      : 'Machine-readable outputs generated successfully.',
    document: {
      id: documentId,
      status: 'completed'
    },
    outputs: {
      txt: {
        download_url: `/api/documents/${documentId}/download/txt`,
        file_size: txtFile.fileSize
      },
      docx: {
        download_url: `/api/documents/${documentId}/download/docx`,
        file_size: docxFile.fileSize
      }
    }
  };
}

router.post('/:id/convert', async (req, res) => {
  const documentId = getDocumentId(req.params.id);

  if (!documentId) {
    return res.status(400).json({ error: 'Invalid document ID.' });
  }

  let client;
  let transactionOpen = false;
  const generatedFiles = [];

  try {
    client = await pool.connect();

    await client.query('BEGIN');
    transactionOpen = true;

    const result = await client.query(
      `SELECT
         id,
         original_name,
         status,
         extracted_text,
         txt_output_path,
         docx_output_path
       FROM documents
       WHERE id = $1
       FOR UPDATE`,
      [documentId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      transactionOpen = false;

      return res.status(404).json({ error: 'Document not found.' });
    }

    const document = result.rows[0];

    if (document.status !== 'completed') {
      await client.query('ROLLBACK');
      transactionOpen = false;

      return res.status(409).json({
        error: `Document must be processed before conversion. Current status: "${document.status}".`
      });
    }

    if (
      typeof document.extracted_text !== 'string' ||
      !document.extracted_text.trim()
    ) {
      await client.query('ROLLBACK');
      transactionOpen = false;

      return res.status(422).json({
        error: 'This document has no extracted text to convert.'
      });
    }

    const existingTxt = await findOutputFile(
      document.txt_output_path,
      'txt'
    );

    const existingDocx = await findOutputFile(
      document.docx_output_path,
      'docx'
    );

    if (existingTxt && existingDocx) {
      await client.query('COMMIT');
      transactionOpen = false;

      return res.status(200).json(
        createConversionResponse(
          documentId,
          existingTxt,
          existingDocx,
          true
        )
      );
    }

    const txtFile = existingTxt || await generateTxt(
      document.extracted_text,
      { outputDir: outputsDir }
    );

    if (!existingTxt) {
      generatedFiles.push({ fileName: txtFile.fileName, extension: 'txt' });
    }

    const docxFile = existingDocx || await generateDocx(
      document.extracted_text,
      {
        outputDir: outputsDir,
        title: document.original_name
      }
    );

    if (!existingDocx) {
      generatedFiles.push({ fileName: docxFile.fileName, extension: 'docx' });
    }

    await client.query(
      `UPDATE documents
       SET txt_output_path = $1,
           docx_output_path = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [
        txtFile.fileName,
        docxFile.fileName,
        documentId
      ]
    );

    await client.query('COMMIT');
    transactionOpen = false;

    if (
      document.txt_output_path &&
      document.txt_output_path !== txtFile.fileName
    ) {
      await removeOutputFile(document.txt_output_path, 'txt').catch(error => {
        console.error('Could not remove previous TXT output:', error);
      });
    }

    if (
      document.docx_output_path &&
      document.docx_output_path !== docxFile.fileName
    ) {
      await removeOutputFile(document.docx_output_path, 'docx').catch(error => {
        console.error('Could not remove previous DOCX output:', error);
      });
    }

    return res.status(201).json(
      createConversionResponse(
        documentId,
        txtFile,
        docxFile,
        false
      )
    );
  } catch (error) {
    if (transactionOpen && client) {
      await client.query('ROLLBACK').catch(rollbackError => {
        console.error('Conversion rollback failed:', rollbackError);
      });
    }

    for (const file of generatedFiles) {
      await removeOutputFile(file.fileName, file.extension).catch(cleanupError => {
        console.error('Generated output cleanup failed:', cleanupError);
      });
    }

    console.error(`Document ${documentId} conversion failed:`, error);

    if (error instanceof DocumentExportError) {
      const statusCode = error.code === 'EMPTY_TEXT' ? 422 : 500;

      return res.status(statusCode).json({ error: error.message });
    }

    return res.status(500).json({
      error: 'Unable to generate machine-readable document outputs.'
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

function buildDownloadName(originalName, extension) {
  const original = path.basename(originalName || 'document');
  const base = path.basename(original, path.extname(original));

  const safeBase = base
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 100);

  return `${safeBase || 'document'}-readify.${extension}`;
}

async function downloadOutput(req, res, extension) {
  const documentId = getDocumentId(req.params.id);

  if (!documentId) {
    return res.status(400).json({ error: 'Invalid document ID.' });
  }

  try {
    const column = extension === 'txt'
      ? 'txt_output_path'
      : 'docx_output_path';

    const result = await pool.query(
      `SELECT id, original_name, status, ${column} AS output_filename
       FROM documents
       WHERE id = $1`,
      [documentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const document = result.rows[0];

    if (document.status !== 'completed') {
      return res.status(409).json({
        error: 'Document must be processed before downloading.'
      });
    }

    const output = await findOutputFile(
      document.output_filename,
      extension
    );

    if (!output) {
      return res.status(404).json({
        error: 'Generated file is missing or invalid. Convert the document again.'
      });
    }

    res.setHeader('Cache-Control', 'no-store');

    if (extension === 'txt') {
      res.type('text/plain');
    } else {
      res.type(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
    }

    return res.download(
      output.filePath,
      buildDownloadName(document.original_name, extension),
      error => {
        if (error) {
          console.error(`Document ${documentId} download failed:`, error);

          if (!res.headersSent) {
            res.status(500).json({ error: 'Unable to download generated file.' });
          }
        }
      }
    );
  } catch (error) {
    console.error(`Document ${documentId} download error:`, error);

    return res.status(500).json({
      error: 'Unable to retrieve generated document.'
    });
  }
}

router.get('/:id/download/txt', (req, res) => {
  return downloadOutput(req, res, 'txt');
});

router.get('/:id/download/docx', (req, res) => {
  return downloadOutput(req, res, 'docx');
});

export default router;
