# Readify

Readify is an audio-console inspired document digitization workstation that transforms non-machine-readable documents into structured, machine-readable formats.

## Tech Stack

- **Frontend**: React, Vite, Vanilla CSS (Light Skeuomorphic Audio Console design)
- **Backend**: Node.js, Express
- **Database**: PostgreSQL (`pg`)
- **Document Processing**: `pdfjs-dist`, `tesseract.js`, `mammoth`, `docx`, `multer`

## Setup

1. **Clone & Install Dependencies**
   ```bash
   git clone https://github.com/samarthjaiswal369/Readify.git
   cd Readify
   npm install
   ```

2. **Environment Configuration**
   Copy `.env.example` to `.env` and fill in your PostgreSQL credentials:
   ```bash
   cp .env.example .env
   ```

3. **Initialize Database**
   Ensure PostgreSQL is running, then create the database and initialize the schema:
   ```bash
   createdb readify_db
   npm run db:init
   ```

## Running the Application

Run both the backend API and frontend Vite development server concurrently:
```bash
npm run dev
```

- **Frontend**: `http://localhost:5173`
- **Backend API**: `http://localhost:5001`
- **API Health Check**: `http://localhost:5001/api/health`

## 5-Day Implementation Roadmap

- [x] **Day 1**: Project Architecture, Express Backend, PostgreSQL Schema, and Audio-Console UI Foundation
- [ ] **Day 2**: File Ingestion (Multer), Validation (PDF, DOCX, PNG, JPG, JPEG) & Document Tracking
- [ ] **Day 3**: Document Processing Engine (pdfjs-dist, tesseract.js OCR, mammoth) & Text Extraction
- [ ] **Day 4**: Output Generation (TXT, DOCX via docx library), Download Endpoints & Export Controls
- [ ] **Day 5**: Document History Log, Audio-Console Skeuomorphic Polish, End-to-End Testing & README Finalization
