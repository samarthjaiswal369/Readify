import express from 'express';
import pool from '../db/index.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT NOW() as current_time, current_database() as database');
    return res.json({
      status: 'online',
      message: 'Readify API is operating normally',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        db_name: dbResult.rows[0].database,
        server_time: dbResult.rows[0].current_time
      }
    });
  } catch (error) {
    return res.status(500).json({
      status: 'degraded',
      message: 'Database connection error',
      error: error.message
    });
  }
});

export default router;
