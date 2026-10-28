import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import healthRouter from './routes/health.js';
import documentsRouter from './routes/documents.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

const uploadsDir = path.join(__dirname, '../uploads');
const outputsDir = path.join(__dirname, '../outputs');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir, { recursive: true });
}

app.use(cors());
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/documents', documentsRouter);

app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

app.listen(PORT, () => {
  console.log(`Readify Server running on http://localhost:${PORT}`);
});
