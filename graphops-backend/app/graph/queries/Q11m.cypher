
MERGE (m:Memory {id:$memory_id})
SET m.type = $type,
    m.title = $title,
    m.summary = $summary,
    m.confidence = $confidence,
    m.status = coalesce(m.status, 'unverified'),
    m.uses = coalesce(m.uses, 0),
    m.created_at = coalesce(m.created_at, $now),
    m.updated_at = $now,
    m.source = coalesce($source, m.source)
RETURN m.id AS id