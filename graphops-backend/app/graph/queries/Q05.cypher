MATCH (i:Incident {id:$incident_id})-[:AFFECTED]->(s:Service)
MATCH (s)-[:DEPENDS_ON*0..2]->(t)
MATCH (d:Deployment)-[:CHANGED|BUMPED]->(t)
WHERE d.deployed_at >= $since AND d.deployed_at <= i.started_at
RETURN DISTINCT d.id AS deployment, d.version AS version, t.id AS touched, d.deployed_at AS at
ORDER BY at DESC