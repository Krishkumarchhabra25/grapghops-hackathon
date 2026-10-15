MATCH (d:Document)
WHERE ($status IS NULL OR d.status = $status)
  AND ($type IS NULL OR d.type = $type)
  AND d.visibility IN $allowed
RETURN d.id AS id, d.title AS title, d.type AS type,
       d.source_url AS url, d.visibility AS visibility,
       d.status AS status, d.content_hash AS content_hash,
       d.updated_at AS updated_at, d.created_at AS created_at
ORDER BY d.updated_at DESC
LIMIT $limit