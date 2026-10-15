MATCH (m:Memory)-[:SUPPORTS_FIX]->(f:Fix {id:$fix_id})
SET m.uses = coalesce(m.uses, 0) + 1,
    m.confidence = CASE WHEN $result = 'success'
                        THEN m.confidence + (1 - m.confidence) * 0.2
                        ELSE m.confidence * 0.6 END,
    m.updated_at = $now
RETURN m.id AS id, m.confidence AS confidence