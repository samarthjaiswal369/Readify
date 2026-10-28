CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
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

CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
