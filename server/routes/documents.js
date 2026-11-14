import express from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pool from '../db/index.js';
import { recordDocumentEvent } from '../utils/documentHistory.js';
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  validateFileSignature,
  safeDeleteFile
} from '../utils/fileValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../../uploads');
const outputsDir = path.resolve(__dirname, '../../outputs');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const rawExt = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.includes(rawExt) ? rawExt : '';
    const randomServerName = `${crypto.randomUUID()}${safeExt}`;
    cb(null, randomServerName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1
  }
});

const uploadSingleFile = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'File size limit exceeded. Maximum allowed file size is 15 MB.'
        });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          error: 'Unexpected field or multiple files received. Only one file is accepted in the "file" field.'
        });
      }
      return res.status(400).json({
        error: `File upload error: ${err.message}`
      });
    } else if (err) {
      return res.status(400).json({
        error: `File upload failed: ${err.message}`
      });
    }
    next();
  });
};

const router = express.Router();

router.get('/stats', async (req, res) => {
  try {
    const statsQuery = `
      SELECT
        COUNT(*) AS total_documents,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_documents,
        COUNT(*) FILTER (WHERE status = 'processing') AS processing_documents,
        COUNT(*) FILTER (WHERE status = 'uploaded') AS uploaded_documents,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed_documents,
        COALESCE(SUM(extracted_character_count), 0) AS total_characters_extracted
      FROM documents;
    `;
    const result = await pool.query(statsQuery);
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { search, status, type, category_id } = req.query;
    const conditions = [];
    const params = [];

    if (search !== undefined) {
      if (typeof search !== 'string') {
        return res.status(400).json({ error: 'Invalid search parameter. Expected a text string.' });
      }
      const trimmedSearch = search.trim();
      if (trimmedSearch.length > 255) {
        return res.status(400).json({ error: 'Search term too long. Maximum length is 255 characters.' });
      }
      if (trimmedSearch.length > 0) {
        params.push(`%${trimmedSearch}%`);
        conditions.push(`(documents.original_name ILIKE $${params.length} OR (documents.extracted_text IS NOT NULL AND documents.extracted_text ILIKE $${params.length}))`);
      }
    }

    if (status !== undefined) {
      if (typeof status !== 'string') {
        return res.status(400).json({ error: 'Invalid status filter. Expected a string.' });
      }
      const normalizedStatus = status.trim().toLowerCase();
      const allowedStatuses = ['uploaded', 'processing', 'completed', 'failed'];
      if (!allowedStatuses.includes(normalizedStatus)) {
        return res.status(400).json({
          error: `Invalid status filter "${status}". Allowed values: ${allowedStatuses.join(', ')}.`
        });
      }
      params.push(normalizedStatus);
      conditions.push(`documents.status = $${params.length}`);
    }

    if (type !== undefined) {
      if (typeof type !== 'string') {
        return res.status(400).json({ error: 'Invalid type filter. Expected a string.' });
      }
      const normalizedType = type.trim().toLowerCase();
      const allowedTypes = ['pdf', 'docx', 'png', 'jpg', 'jpeg'];
      if (!allowedTypes.includes(normalizedType)) {
        return res.status(400).json({
          error: `Invalid type filter "${type}". Allowed values: ${allowedTypes.join(', ')}.`
        });
      }
      params.push(normalizedType);
      conditions.push(`documents.file_type = $${params.length}`);
    }

    if (category_id !== undefined) {
      const rawCategoryId = String(category_id).trim();
      if (!/^\d+$/.test(rawCategoryId) || !Number.isSafeInteger(Number(rawCategoryId)) || Number(rawCategoryId) < 1) {
        return res.status(400).json({ error: 'Invalid category_id filter. Expected a positive integer.' });
      }
      params.push(Number(rawCategoryId));
      conditions.push(`documents.category_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT
        documents.id,
        documents.category_id,
        categories.name AS category_name,
        documents.original_name,
        documents.file_size,
        documents.file_type,
        documents.mime_type,
        documents.is_scanned,
        documents.status,
        documents.ocr_engine,
        (documents.txt_output_path IS NOT NULL) AS has_txt_output,
        (documents.docx_output_path IS NOT NULL) AS has_docx_output,
        documents.extracted_character_count,
        documents.created_at,
        documents.updated_at
      FROM documents
      LEFT JOIN categories ON documents.category_id = categories.id
      ${whereClause}
      ORDER BY documents.created_at DESC
      LIMIT 50
    `;

    const result = await pool.query(sql, params);
    const formattedRows = result.rows.map((row) => ({
      ...row,
      file_size: Number(row.file_size)
    }));

    return res.json(formattedRows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/:id/history', async (req, res) => {
  const idValue = req.params.id;

  if (!/^\d+$/.test(idValue) || !Number.isSafeInteger(Number(idValue)) || Number(idValue) < 1) {
    return res.status(400).json({ error: 'Invalid document ID.' });
  }

  const documentId = Number(idValue);

  try {
    const document = await pool.query(
      'SELECT id FROM documents WHERE id = $1',
      [documentId]
    );

    if (document.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const result = await pool.query(
      `SELECT id, event_type, description, metadata, created_at
       FROM document_events
       WHERE document_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      [documentId]
    );

    return res.json({
      document_id: documentId,
      events: result.rows
    });
  } catch (error) {
    console.error('Document history retrieval failed:', error);
    return res.status(500).json({
      error: 'Unable to retrieve document activity history.'
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const documentId = parseInt(id, 10);
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID.' });
    }

    const result = await pool.query(
      `SELECT
        id,
        category_id,
        original_name,
        file_size,
        file_type,
        mime_type,
        is_scanned,
        status,
        ocr_engine,
        extracted_text,
        extracted_character_count,
        extracted_word_count,
        error_message,
        processing_time_ms,
        (txt_output_path IS NOT NULL) AS has_txt_output,
        (docx_output_path IS NOT NULL) AS has_docx_output,
        created_at,
        updated_at
      FROM documents
      WHERE id = $1`,
      [documentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const doc = result.rows[0];
    return res.json({
      ...doc,
      file_size: Number(doc.file_size)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', async (req, res) => {
  const idValue = req.params.id;

  if (!/^\d+$/.test(idValue) || !Number.isSafeInteger(Number(idValue)) || Number(idValue) < 1) {
    return res.status(400).json({ error: 'Invalid document ID.' });
  }

  const documentId = Number(idValue);

  if (req.body?.extracted_text === undefined || typeof req.body.extracted_text !== 'string') {
    return res.status(400).json({
      error: 'Invalid request body. Expected "extracted_text" string parameter.'
    });
  }

  const updatedText = req.body.extracted_text;
  const characterCount = updatedText.length;
  const wordCount = updatedText.trim()
    ? updatedText.trim().split(/\s+/u).length
    : 0;

  try {
    const existing = await pool.query(
      'SELECT id, original_name, status, txt_output_path, docx_output_path FROM documents WHERE id = $1',
      [documentId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const doc = existing.rows[0];

    // Clean up previous stale output files since the source text changed
    if (doc.txt_output_path) {
      const safeTxt = path.basename(doc.txt_output_path);
      await safeDeleteFile(path.resolve(outputsDir, safeTxt)).catch(() => {});
    }
    if (doc.docx_output_path) {
      const safeDocx = path.basename(doc.docx_output_path);
      await safeDeleteFile(path.resolve(outputsDir, safeDocx)).catch(() => {});
    }

    const updateSql = `
      UPDATE documents
      SET extracted_text = $1,
          extracted_character_count = $2,
          extracted_word_count = $3,
          txt_output_path = NULL,
          docx_output_path = NULL,
          updated_at = NOW()
      WHERE id = $4
      RETURNING
        id,
        category_id,
        original_name,
        file_size,
        file_type,
        mime_type,
        is_scanned,
        status,
        ocr_engine,
        extracted_text,
        extracted_character_count,
        extracted_word_count,
        error_message,
        processing_time_ms,
        (txt_output_path IS NOT NULL) AS has_txt_output,
        (docx_output_path IS NOT NULL) AS has_docx_output,
        created_at,
        updated_at;
    `;

    const result = await pool.query(updateSql, [
      updatedText,
      characterCount,
      wordCount,
      documentId
    ]);

    const updatedDoc = result.rows[0];

    try {
      await recordDocumentEvent(
        pool,
        documentId,
        'processing_completed',
        'Extracted text manually edited and saved.',
        {
          extracted_character_count: characterCount,
          extracted_word_count: wordCount
        }
      );
    } catch (_) {}

    return res.status(200).json({
      message: 'Document extracted text updated successfully.',
      document: {
        ...updatedDoc,
        file_size: Number(updatedDoc.file_size)
      }
    });
  } catch (err) {
    console.error('Failed to update document text:', err);
    return res.status(500).json({
      error: 'Failed to update document text.',
      details: err.message
    });
  }
});

router.delete('/:id', async (req, res) => {
  const idValue = req.params.id;

  if (!/^\d+$/.test(idValue) || !Number.isSafeInteger(Number(idValue)) || Number(idValue) < 1) {
    return res.status(400).json({ error: 'Invalid document ID.' });
  }

  const documentId = Number(idValue);

  let document;
  try {
    const documentResult = await pool.query(
      'SELECT id, original_name, stored_filename, txt_output_path, docx_output_path FROM documents WHERE id = $1',
      [documentId]
    );

    if (documentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    document = documentResult.rows[0];
  } catch (dbReadError) {
    return res.status(500).json({
      error: 'Failed to retrieve document for deletion.',
      details: dbReadError.message,
      database_deleted: false,
      files_cleaned: false
    });
  }

  try {
    await pool.query('DELETE FROM documents WHERE id = $1', [documentId]);
  } catch (dbDeleteError) {
    return res.status(500).json({
      error: 'Failed to delete document from database.',
      details: dbDeleteError.message,
      database_deleted: false,
      files_cleaned: false
    });
  }

  const filesToDelete = [];

  if (document.stored_filename && typeof document.stored_filename === 'string') {
    const safeStoredName = path.basename(document.stored_filename);
    const targetUploadPath = path.resolve(uploadsDir, safeStoredName);
    const relUploadPath = path.relative(uploadsDir, targetUploadPath);
    if (!relUploadPath.startsWith('..') && !path.isAbsolute(relUploadPath)) {
      filesToDelete.push({ type: 'upload', path: targetUploadPath });
    }
  }

  if (document.txt_output_path && typeof document.txt_output_path === 'string') {
    const safeTxtName = path.basename(document.txt_output_path);
    const targetTxtPath = path.resolve(outputsDir, safeTxtName);
    const relTxtPath = path.relative(outputsDir, targetTxtPath);
    if (!relTxtPath.startsWith('..') && !path.isAbsolute(relTxtPath)) {
      filesToDelete.push({ type: 'txt_output', path: targetTxtPath });
    }
  }

  if (document.docx_output_path && typeof document.docx_output_path === 'string') {
    const safeDocxName = path.basename(document.docx_output_path);
    const targetDocxPath = path.resolve(outputsDir, safeDocxName);
    const relDocxPath = path.relative(outputsDir, targetDocxPath);
    if (!relDocxPath.startsWith('..') && !path.isAbsolute(relDocxPath)) {
      filesToDelete.push({ type: 'docx_output', path: targetDocxPath });
    }
  }

  let allFilesDeleted = true;
  const cleanupWarnings = [];

  for (const item of filesToDelete) {
    try {
      await safeDeleteFile(item.path);
    } catch (fileError) {
      allFilesDeleted = false;
      cleanupWarnings.push(`Could not delete associated ${item.type} file.`);
    }
  }

  if (!allFilesDeleted) {
    return res.status(200).json({
      message: 'Document database record deleted, but physical file cleanup was incomplete.',
      deleted_document_id: documentId,
      database_deleted: true,
      files_cleaned: false,
      cleanup_warnings: cleanupWarnings
    });
  }

  return res.status(200).json({
    message: 'Document deleted successfully.',
    deleted_document_id: documentId,
    database_deleted: true,
    files_cleaned: true
  });
});

router.post('/upload', uploadSingleFile, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'No file uploaded. Please provide a file in the "file" field.'
    });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname || 'unnamed_file';
  const ext = path.extname(originalName).toLowerCase();
  const rawMimeType = (req.file.mimetype || '').split(';')[0].trim().toLowerCase();

  try {
    if (req.file.size === 0) {
      await safeDeleteFile(filePath);
      return res.status(400).json({
        error: 'Uploaded file is empty (0 bytes).'
      });
    }

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      await safeDeleteFile(filePath);
      return res.status(400).json({
        error: `Unsupported file extension "${ext}". Supported types: PDF, DOCX, PNG, JPG, JPEG.`
      });
    }

    const allowedMimes = ALLOWED_MIME_TYPES[ext];
    if (!allowedMimes || !allowedMimes.includes(rawMimeType)) {
      await safeDeleteFile(filePath);
      return res.status(400).json({
        error: `Invalid or mismatched MIME type "${rawMimeType}" for file extension "${ext}".`
      });
    }

    const signatureCheck = await validateFileSignature(filePath, ext);
    if (!signatureCheck.valid) {
      await safeDeleteFile(filePath);
      return res.status(400).json({
        error: signatureCheck.reason
      });
    }

    const fileType = signatureCheck.fileType;

    let categoryId = null;
    if (req.body && req.body.category_id) {
      const rawCatId = String(req.body.category_id).trim();
      if (/^\d+$/.test(rawCatId) && Number.isSafeInteger(Number(rawCatId)) && Number(rawCatId) > 0) {
        categoryId = Number(rawCatId);
      }
    }

    const insertSql = `
      INSERT INTO documents (
        category_id,
        original_name,
        stored_filename,
        mime_type,
        file_size,
        file_type,
        status,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING
        id,
        category_id,
        original_name,
        file_size,
        file_type,
        mime_type,
        status,
        created_at,
        updated_at;
    `;

    const values = [
      categoryId,
      originalName.slice(0, 255),
      req.file.filename,
      rawMimeType,
      req.file.size,
      fileType,
      'uploaded'
    ];

    let dbResult;
    try {
      dbResult = await pool.query(insertSql, values);
    } catch (dbError) {
      await safeDeleteFile(filePath);
      console.error('Database insertion failed:', dbError);
      return res.status(500).json({
        error: 'Database error: Failed to record uploaded document.',
        details: dbError.message
      });
    }

    const newDoc = dbResult.rows[0];

    try {
      await recordDocumentEvent(
        pool,
        newDoc.id,
        'uploaded',
        'Document uploaded successfully.',
        {
          original_name: newDoc.original_name,
          file_type: newDoc.file_type,
          file_size: Number(newDoc.file_size)
        }
      );
    } catch (historyError) {
      console.error('Could not record document upload history:', historyError);
    }

    return res.status(201).json({
      message: 'Document uploaded successfully',
      document: {
        id: newDoc.id,
        category_id: newDoc.category_id,
        original_name: newDoc.original_name,
        file_size: Number(newDoc.file_size),
        file_type: newDoc.file_type,
        mime_type: newDoc.mime_type,
        status: newDoc.status,
        created_at: newDoc.created_at,
        updated_at: newDoc.updated_at
      }
    });
  } catch (error) {
    await safeDeleteFile(filePath);
    console.error('Unhandled upload processing error:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while processing the upload.',
      details: error.message
    });
  }
});

export default router;
