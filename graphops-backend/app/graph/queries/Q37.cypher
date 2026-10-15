MATCH (i:Incident)-[:AFFECTED]->(s:Service {id:$id})
RETURN i.id AS id, i.title AS title, i.severity AS severity,
       i.status AS status, i.started_at AS started_at,
       i.resolved_at AS resolved_at
ORDER BY i.started_at DESC
LIMIT 10