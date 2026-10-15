MATCH (d:Deployment {id:$deployment_id}), (i:Incident {id:$incident_id})
MATCH p = (d)-[*..6]-(i)
WITH p, length(p) AS len
ORDER BY len ASC
LIMIT 1
RETURN [n IN nodes(p) | {label: labels(n)[0], id: n.id}] AS path,
       [r IN relationships(p) | type(r)] AS rels