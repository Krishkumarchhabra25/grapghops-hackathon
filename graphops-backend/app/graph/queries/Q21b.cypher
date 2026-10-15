CALL db.idx.fulltext.queryNodes('Memory', $q)
YIELD node AS m, score
WHERE ($type IS NULL OR m.type = $type)
  AND ($status IS NULL OR m.status = $status)
RETURN m.id AS id, m.type AS type, m.title AS title, m.summary AS summary,
       m.confidence AS confidence, m.status AS status, m.uses AS uses,
       m.source AS source, m.updated_at AS updated_at, m.created_at AS created_at,
       score
ORDER BY score DESC, m.updated_at DESC
LIMIT $limit