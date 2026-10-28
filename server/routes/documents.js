import express from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pool from '../db/index.js';
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

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer disk storage: securely store with a random UUID server-side filename
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

// Middleware wrapper to handle Multer errors gracefully
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

/**
 * GET /api/documents/stats
 * Returns overall document digitization statistics
 */
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

/**
 * GET /api/documents
 * Returns list of documents without exposing filesystem paths
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        original_name,
        file_size,
        file_type,
        mime_type,
        is_scanned,
        status,
        ocr_engine,
        extracted_character_count,
        created_at,
        updated_at
      FROM documents
      ORDER BY created_at DESC
      LIMIT 50`
    );

    const formattedRows = result.rows.map((row) => ({
      ...row,
      file_size: Number(row.file_size)
    }));

    return res.json(formattedRows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/documents/:id
 * Returns a single document's metadata without exposing filesystem paths
 */
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
        original_name,
        file_size,
        file_type,
        mime_type,
        is_scanned,
        status,
        ocr_engine,
        extracted_character_count,
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

/**
 * POST /api/documents/upload
 * Securely uploads and registers a single document
 */
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
    // 1. Enforce non-zero file size
    if (req.file.size === 0) {
      await safeDeleteFile(filePath);
      return res.status(400).json({
        error: 'Uploaded file is empty (0 bytes).'
      });
    }

    // 2. Enforce explicit file extension allowlist
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      await safeDeleteFile(filePath);
      return res.status(400).json({
        error: `Unsupported file extension "${ext}". Supported types: PDF, DOCX, PNG, JPG, JPEG.`
      });
    }

    // 3. Enforce MIME type allowlist
    const allowedMimes = ALLOWED_MIME_TYPES[ext];
    if (!allowedMimes || !allowedMimes.includes(rawMimeType)) {
      await safeDeleteFile(filePath);
      return res.status(400).json({
        error: `Invalid or mismatched MIME type "${rawMimeType}" for file extension "${ext}".`
      });
    }

    // 4. Enforce file signature (magic bytes) & container integrity
    const signatureCheck = await validateFileSignature(filePath, ext);
    if (!signatureCheck.valid) {
      await safeDeleteFile(filePath);
      return res.status(400).json({
        error: signatureCheck.reason
      });
    }

    const fileType = signatureCheck.fileType;

    // 5. Insert metadata into PostgreSQL using parameterized query
    const insertSql = `
      INSERT INTO documents (
        original_name,
        stored_filename,
        mime_type,
        file_size,
        file_type,
        status,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING
        id,
        original_name,
        file_size,
        file_type,
        mime_type,
        status,
        created_at,
        updated_at;
    `;

    const values = [
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
      // Remove uploaded file on DB failure to avoid orphaned files
      await safeDeleteFile(filePath);
      console.error('Database insertion failed:', dbError);
      return res.status(500).json({
        error: 'Database error: Failed to record uploaded document.',
        details: dbError.message
      });
    }

    const newDoc = dbResult.rows[0];

    // 6. Return response with metadata and NO filesystem paths
    return res.status(201).json({
      message: 'Document uploaded successfully',
      document: {
        id: newDoc.id,
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
    // Catch-all cleanup to guarantee no orphaned files on disk
    await safeDeleteFile(filePath);
    console.error('Unhandled upload processing error:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred while processing the upload.',
      details: error.message
    });
  }
});

export default router;
