MATCH (i:Incident)
WHERE ($status IS NULL OR i.status = $status)
  AND ($severity IS NULL OR i.severity = $severity)
  AND ($q IS NULL
       OR toLower(i.title) CONTAINS toLower($q)
       OR toLower(coalesce(i.summary, '')) CONTAINS toLower($q))
OPTIONAL MATCH (i)-[:AFFECTED]->(s:Service)
RETURN i.id AS id, i.title AS title, i.severity AS severity,
       i.status AS status, i.summary AS summary, i.impact AS impact,
       i.started_at AS started_at, i.resolved_at AS resolved_at,
       i.root_cause AS root_cause, i.updated_at AS updated_at,
       collect(DISTINCT s.id) AS services
ORDER BY i.started_at DESC
LIMIT $limit