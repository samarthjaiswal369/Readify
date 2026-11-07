export async function recordDocumentEvent(
  database,
  documentId,
  eventType,
  description,
  metadata = {}
) {
  await database.query(
    `INSERT INTO document_events (
       document_id,
       event_type,
       description,
       metadata
     )
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      documentId,
      eventType,
      description,
      JSON.stringify(metadata)
    ]
  );
}
