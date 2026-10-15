MATCH (d:Document)
WHERE d.status = 'Needs review' OR d.updated_at < $older_than
RETURN d.id AS id, d.title AS title, d.status AS status, d.updated_at AS updated_at
ORDER BY d.updated_at ASC