MATCH (m:Memory)-[:ABOUT]->(e)
WHERE e.id IN $entity_ids
  AND m.status IN ['verified', 'pinned']
  AND (m.expires_at IS NULL OR m.expires_at > $now)
WITH m, count(DISTINCT e) AS overlap
OPTIONAL MATCH (m)-[:SUPPORTS_FIX]->(f:Fix)
RETURN m.id AS id, m.type AS type, m.title AS title, m.summary AS summary,
       m.confidence AS confidence, overlap, collect(DISTINCT f.id) AS fixes
ORDER BY overlap DESC, confidence DESC
LIMIT $k