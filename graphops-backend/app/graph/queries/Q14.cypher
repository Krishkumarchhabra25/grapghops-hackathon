MATCH (d:Document)-[:DESCRIBES]->(s:Service {id:$service_id})
WHERE d.visibility IN $allowed
RETURN d.id AS id, d.title AS title, d.type AS type, d.source_url AS url,
       d.updated_at AS updated_at, d.status AS status
ORDER BY d.updated_at DESC