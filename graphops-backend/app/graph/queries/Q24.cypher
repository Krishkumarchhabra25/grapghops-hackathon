MATCH (d:Document {id:$id})
WHERE d.visibility IN $allowed
OPTIONAL MATCH (d)-[:DESCRIBES]->(s:Service)
OPTIONAL MATCH (p:Person)-[:AUTHORED]->(d)
OPTIONAL MATCH (dec:Decision)-[:RECORDED_IN]->(d)
RETURN d.id AS id, d.title AS title, d.body AS body, d.type AS type,
       d.source_url AS url, d.visibility AS visibility,
       d.status AS status, d.content_hash AS content_hash,
       d.updated_at AS updated_at, d.created_at AS created_at,
       s.id AS service_id, s.name AS service_name,
       p.id AS author_id, p.name AS author_name,
       dec.id AS decision_id, dec.title AS decision_title