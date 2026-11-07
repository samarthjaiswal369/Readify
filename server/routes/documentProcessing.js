import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/index.js';
import { recordDocumentEvent } from '../utils/documentHistory.js';
import {
  processDocument,
  DocumentProcessingError
} from '../services/documentProcessor.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../../uploads');

router.post('/:id/process', async (req, res) => {
  const idValue = req.params.id;

  if (!/^\d+$/.test(idValue) || !Number.isSafeInteger(Number(idValue)) || Number(idValue) < 1) {
    return res.status(400).json({ error: 'Invalid document ID.' });
  }

  const documentId = Number(idValue);
  const startedAt = Date.now();

  try {
    const claim = await pool.query(
      `UPDATE documents
       SET status = 'processing',
           error_message = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND status IN ('uploaded', 'failed')
       RETURNING id, original_name, stored_filename, file_type, mime_type`,
      [documentId]
    );

    if (claim.rows.length === 0) {
      const existing = await pool.query(
        'SELECT id, status FROM documents WHERE id = $1',
        [documentId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found.' });
      }

      if (existing.rows[0].status === 'processing') {
        return res.status(409).json({
          error: 'This document is already being processed.'
        });
      }

      if (existing.rows[0].status === 'completed') {
        return res.status(409).json({
          error: 'This document has already been processed.'
        });
      }

      return res.status(409).json({
        error: `Document cannot be processed from status "${existing.rows[0].status}".`
      });
    }

    const document = claim.rows[0];

    try {
      await recordDocumentEvent(
        pool,
        documentId,
        'processing_started',
        'Document text extraction started.',
        { file_type: document.file_type }
      );
    } catch (historyError) {
      console.error('Could not record processing start history:', historyError);
    }

    try {
      const storedFilename = document.stored_filename;

      if (
        !storedFilename ||
        path.basename(storedFilename) !== storedFilename ||
        !/^[a-f0-9-]{36}\.(pdf|docx|png|jpg|jpeg)$/i.test(storedFilename)
      ) {
        throw new DocumentProcessingError(
          'Stored document filename is invalid.',
          'INVALID_STORED_FILENAME'
        );
      }

      const filePath = path.resolve(uploadsDir, storedFilename);
      const relativePath = path.relative(uploadsDir, filePath);

      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new DocumentProcessingError(
          'Document path is outside the upload directory.',
          'INVALID_FILE_PATH'
        );
      }

      const fileStat = await fs.promises.lstat(filePath);

      if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
        throw new DocumentProcessingError(
          'Stored document is not a regular file.',
          'INVALID_DOCUMENT_FILE'
        );
      }

      const result = await processDocument(filePath, {
        fileType: document.file_type,
        mimeType: document.mime_type,
        originalName: document.original_name
      });

      const extractedText = result.text || '';
      const characterCount = extractedText.length;
      const wordCount = extractedText.trim()
        ? extractedText.trim().split(/\s+/u).length
        : 0;

      const processingTime = Math.min(
        Date.now() - startedAt,
        2147483647
      );

      const updated = await pool.query(
        `UPDATE documents
         SET is_scanned = $1,
             status = 'completed',
             extracted_text = $2,
             extracted_character_count = $3,
             extracted_word_count = $4,
             ocr_engine = $5,
             error_message = NULL,
             processing_time_ms = $6,
             updated_at = NOW()
         WHERE id = $7
         RETURNING
           id,
           original_name,
           file_size,
           file_type,
           is_scanned,
           status,
           extracted_character_count,
           extracted_word_count,
           ocr_engine,
           processing_time_ms,
           extracted_text,
           created_at,
           updated_at`,
        [
          result.isScanned,
          extractedText,
          characterCount,
          wordCount,
          result.ocrEngine,
          processingTime,
          documentId
        ]
      );

      const savedDocument = updated.rows[0];

      try {
        await recordDocumentEvent(
          pool,
          documentId,
          'processing_completed',
          'Document text extraction completed successfully.',
          {
            is_scanned: result.isScanned,
            ocr_engine: result.ocrEngine,
            extracted_character_count: characterCount,
            extracted_word_count: wordCount,
            processing_time_ms: processingTime
          }
        );
      } catch (historyError) {
        console.error('Could not record processing completion history:', historyError);
      }

      return res.status(200).json({
        message: 'Document processed successfully.',
        document: {
          ...savedDocument,
          file_size: Number(savedDocument.file_size)
        },
        processing: {
          page_count: result.pageCount,
          ocr_pages: result.ocrPages,
          warnings: result.warnings
        }
      });
    } catch (processingError) {
      const processingTime = Math.min(
        Date.now() - startedAt,
        2147483647
      );

      const errorMessage = processingError instanceof DocumentProcessingError
        ? processingError.message
        : 'Document processing failed due to an unexpected error.';

      console.error(`Document ${documentId} processing failed:`, processingError);

      try {
        await pool.query(
          `UPDATE documents
           SET status = 'failed',
               error_message = $1,
               processing_time_ms = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [errorMessage, processingTime, documentId]
        );

        try {
          await recordDocumentEvent(
            pool,
            documentId,
            'processing_failed',
            'Document text extraction failed.',
            {
              error_message: errorMessage,
              processing_time_ms: processingTime
            }
          );
        } catch (historyError) {
          console.error('Could not record processing failure history:', historyError);
        }
      } catch (databaseError) {
        console.error('Failed to update document error status:', databaseError);

        return res.status(500).json({
          error: 'Processing failed and the database status could not be updated.'
        });
      }

      const statusCode = processingError instanceof DocumentProcessingError
        ? 422
        : 500;

      return res.status(statusCode).json({
        error: errorMessage,
        document_id: documentId,
        status: 'failed'
      });
    }
  } catch (error) {
    console.error('Processing API error:', error);

    return res.status(500).json({
      error: 'Unable to start document processing.'
    });
  }
});

export default router;
