SELECT 'DE DEMONSTRATION 1: INSERT OPERATIONS' AS step;

INSERT INTO categories (name, description)
VALUES ('Demonstration Category', 'Temporary category created for DE demonstration')
ON CONFLICT (name) DO NOTHING;

INSERT INTO documents (
  category_id,
  original_name,
  stored_filename,
  mime_type,
  file_size,
  file_type,
  is_scanned,
  status,
  extracted_text,
  extracted_character_count,
  extracted_word_count,
  ocr_engine
) VALUES (
  (SELECT id FROM categories WHERE name = 'Demonstration Category' LIMIT 1),
  'sample_de_document_alpha.pdf',
  'de-demo-alpha-uuid.pdf',
  'application/pdf',
  204800,
  'pdf',
  false,
  'completed',
  'Readify advanced software development and data engineering sample document text.',
  83,
  10,
  NULL
) RETURNING id, original_name, status, file_size;

INSERT INTO documents (
  category_id,
  original_name,
  stored_filename,
  mime_type,
  file_size,
  file_type,
  is_scanned,
  status,
  extracted_text,
  extracted_character_count,
  extracted_word_count,
  ocr_engine
) VALUES (
  (SELECT id FROM categories WHERE name = 'Demonstration Category' LIMIT 1),
  'sample_de_document_beta.png',
  'de-demo-beta-uuid.png',
  'image/png',
  512000,
  'png',
  true,
  'completed',
  'Scanned invoice image containing optical character recognition text data.',
  71,
  9,
  'tesseract.js'
) RETURNING id, original_name, status, file_size;

INSERT INTO document_events (
  document_id,
  event_type,
  description,
  metadata
) VALUES (
  (SELECT id FROM documents WHERE original_name = 'sample_de_document_alpha.pdf' ORDER BY id DESC LIMIT 1),
  'uploaded',
  'Document recorded during DE demonstration run.',
  '{"batch": "de_demo"}'::jsonb
);

INSERT INTO document_events (
  document_id,
  event_type,
  description,
  metadata
) VALUES (
  (SELECT id FROM documents WHERE original_name = 'sample_de_document_alpha.pdf' ORDER BY id DESC LIMIT 1),
  'processing_completed',
  'Text extraction finished successfully.',
  '{"characters": 83, "words": 10}'::jsonb
);

INSERT INTO document_summaries (
  document_id,
  summary_type,
  summary_text,
  key_points,
  word_count
) VALUES (
  (SELECT id FROM documents WHERE original_name = 'sample_de_document_alpha.pdf' ORDER BY id DESC LIMIT 1),
  'extractive',
  'Readify provides document digitization transforming non-machine readable files.',
  'Key takeaway: Digital transformation of legacy files.',
  9
);

SELECT 'DE DEMONSTRATION 2: SELECT WITH FILTERING AND SORTING' AS step;

SELECT
  id,
  original_name,
  file_type,
  file_size,
  status,
  created_at
FROM documents
WHERE status = 'completed' AND file_size > 100000
ORDER BY file_size DESC
LIMIT 5;

SELECT 'DE DEMONSTRATION 3: UPDATE OPERATIONS' AS step;

UPDATE documents
SET extracted_character_count = 95,
    extracted_word_count = 12,
    updated_at = NOW()
WHERE original_name = 'sample_de_document_alpha.pdf'
RETURNING id, original_name, extracted_word_count, updated_at;

UPDATE document_summaries
SET summary_type = 'bullet_points',
    word_count = 14
WHERE document_id = (SELECT id FROM documents WHERE original_name = 'sample_de_document_alpha.pdf' ORDER BY id DESC LIMIT 1)
RETURNING id, document_id, summary_type, word_count;

SELECT 'DE DEMONSTRATION 4: INNER JOIN OPERATIONS' AS step;

SELECT
  d.id AS document_id,
  d.original_name,
  d.file_type,
  d.file_size,
  c.name AS category_name
FROM documents d
INNER JOIN categories c ON d.category_id = c.id
ORDER BY d.id DESC;

SELECT
  d.id AS document_id,
  d.original_name,
  c.name AS category_name,
  s.summary_type,
  s.summary_text
FROM documents d
INNER JOIN categories c ON d.category_id = c.id
INNER JOIN document_summaries s ON d.id = s.document_id
ORDER BY d.id DESC;

SELECT 'DE DEMONSTRATION 5: LEFT JOIN OPERATIONS' AS step;

SELECT
  c.id AS category_id,
  c.name AS category_name,
  COUNT(d.id) AS total_assigned_documents
FROM categories c
LEFT JOIN documents d ON c.id = d.category_id
GROUP BY c.id, c.name
ORDER BY c.id ASC;

SELECT
  d.id AS document_id,
  d.original_name,
  e.event_type,
  e.created_at AS event_time,
  s.summary_type
FROM documents d
LEFT JOIN document_events e ON d.id = e.document_id
LEFT JOIN document_summaries s ON d.id = s.document_id
ORDER BY d.id DESC, e.id ASC;

SELECT 'DE DEMONSTRATION 6: GROUP BY AND HAVING' AS step;

SELECT
  c.name AS category_name,
  COUNT(d.id) AS document_count,
  SUM(d.file_size) AS total_bytes,
  AVG(d.extracted_word_count) AS average_words
FROM categories c
INNER JOIN documents d ON c.id = d.category_id
GROUP BY c.name
HAVING COUNT(d.id) >= 1
ORDER BY document_count DESC;

SELECT
  file_type,
  COUNT(*) AS document_count,
  AVG(file_size) AS average_file_size,
  MAX(file_size) AS max_file_size
FROM documents
GROUP BY file_type
HAVING COUNT(*) >= 1
ORDER BY document_count DESC;

SELECT 'DE DEMONSTRATION 7: AGGREGATE FUNCTIONS' AS step;

SELECT
  COUNT(*) AS total_documents,
  SUM(file_size) AS total_bytes_stored,
  AVG(file_size) AS average_file_size_bytes,
  MIN(file_size) AS minimum_file_size_bytes,
  MAX(file_size) AS maximum_file_size_bytes,
  AVG(extracted_word_count) AS average_words_per_doc
FROM documents;

SELECT 'DE DEMONSTRATION 8: SUBQUERIES' AS step;

SELECT
  id,
  original_name,
  file_size
FROM documents
WHERE file_size > (SELECT AVG(file_size) FROM documents)
ORDER BY file_size DESC;

SELECT
  id,
  name,
  description
FROM categories
WHERE id IN (
  SELECT DISTINCT category_id
  FROM documents
  WHERE category_id IS NOT NULL AND is_scanned = true
);

SELECT
  d.id,
  d.original_name,
  d.status
FROM documents d
WHERE EXISTS (
  SELECT 1
  FROM document_summaries s
  WHERE s.document_id = d.id
);

SELECT
  d1.id,
  d1.original_name,
  d1.file_type,
  d1.file_size
FROM documents d1
WHERE d1.file_size >= (
  SELECT AVG(d2.file_size)
  FROM documents d2
  WHERE d2.file_type = d1.file_type
)
ORDER BY d1.file_type, d1.file_size DESC;

SELECT 'DE DEMONSTRATION 9: DELETE WITH FOREIGN KEY CASCADING' AS step;

DELETE FROM document_summaries
WHERE document_id = (SELECT id FROM documents WHERE original_name = 'sample_de_document_beta.png' ORDER BY id DESC LIMIT 1);

DELETE FROM documents
WHERE original_name = 'sample_de_document_beta.png';

DELETE FROM documents
WHERE original_name = 'sample_de_document_alpha.pdf';

DELETE FROM categories
WHERE name = 'Demonstration Category';

SELECT 'DE DEMONSTRATION COMPLETE: ALL OPERATIONS VERIFIED' AS status;
