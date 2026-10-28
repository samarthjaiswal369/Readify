import express from 'express';
import pool from '../db/index.js';

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
    const result = await pool.query(
      'SELECT id, original_name, file_size, file_type, is_scanned, status, ocr_engine, extracted_character_count, created_at FROM documents ORDER BY created_at DESC LIMIT 50'
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
