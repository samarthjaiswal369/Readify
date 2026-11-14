CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  is_scanned BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) NOT NULL DEFAULT 'uploaded',
  extracted_text TEXT,
  extracted_character_count INTEGER DEFAULT 0,
  extracted_word_count INTEGER DEFAULT 0,
  ocr_engine VARCHAR(50),
  error_message TEXT,
  txt_output_path VARCHAR(255),
  docx_output_path VARCHAR(255),
  processing_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS chk_documents_status;

ALTER TABLE documents
  ADD CONSTRAINT chk_documents_status CHECK (
    status IN ('uploaded', 'processing', 'completed', 'failed')
  );

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS chk_documents_file_size;

ALTER TABLE documents
  ADD CONSTRAINT chk_documents_file_size CHECK (file_size > 0);

CREATE TABLE IF NOT EXISTS document_events (
  id BIGSERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL
    REFERENCES documents(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE document_events
  DROP CONSTRAINT IF EXISTS document_events_event_type_check;

ALTER TABLE document_events
  ADD CONSTRAINT document_events_event_type_check CHECK (
    event_type IN (
      'uploaded',
      'processing_started',
      'processing_completed',
      'processing_failed',
      'outputs_generated',
      'conversion_failed',
      'summary_generated'
    )
  );

CREATE TABLE IF NOT EXISTS document_summaries (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  summary_type VARCHAR(50) NOT NULL DEFAULT 'extractive',
  summary_text TEXT NOT NULL,
  key_points TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_summary_word_count CHECK (word_count >= 0),
  CONSTRAINT chk_summary_type CHECK (
    summary_type IN ('extractive', 'abstractive', 'bullet_points')
  )
);

INSERT INTO categories (name, description) VALUES
  ('Invoices & Receipts', 'Financial and transaction documents'),
  ('Contracts & Legal', 'Legal agreements and official documents'),
  ('Scanned Notes', 'Handwritten or printed scanned study notes'),
  ('Technical Reports', 'Documentation, research papers, and technical reports'),
  ('General Archive', 'Uncategorized or general documents')
ON CONFLICT (name) DO NOTHING;
