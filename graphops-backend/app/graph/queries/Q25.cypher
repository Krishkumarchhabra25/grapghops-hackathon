MATCH (m:Memory {id:$id})
SET m.title = $title,
    m.summary = $summary,
    m.confidence = $confidence,
    m.status = $status,
    m.updated_at = $now
RETURN m.id AS id