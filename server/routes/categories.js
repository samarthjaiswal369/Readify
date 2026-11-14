import express from 'express';
import pool from '../db/index.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, description FROM categories ORDER BY id ASC');
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
