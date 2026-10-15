CALL db.idx.fulltext.queryNodes('Document', $text)
YIELD node AS doc, score
WHERE doc.visibility IN $allowed
OPTIONAL MATCH (doc)-[:DESCRIBES]->(s:Service)
OPTIONAL MATCH (o:Person)-[:OWNS]->(s)
RETURN doc.id AS id, doc.title AS title, doc.body AS body, doc.type AS type,
       doc.source_url AS url, doc.visibility AS visibility,
       doc.updated_at AS updated_at, doc.status AS status, score,
       collect(DISTINCT s.id) AS services,
       collect(DISTINCT s.name) AS service_names,
       collect(DISTINCT o.name) AS owners
ORDER BY score DESC
LIMIT 8