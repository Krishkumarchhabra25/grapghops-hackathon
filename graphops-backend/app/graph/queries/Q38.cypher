MATCH (s:Service {id:$id})
OPTIONAL MATCH (d1:Deployment)-[:CHANGED]->(s)
OPTIONAL MATCH (s)-[:DEPENDS_ON]->(dep)
OPTIONAL MATCH (d2:Deployment)-[:BUMPED]->(dep)
WITH collect(DISTINCT d1) + collect(DISTINCT d2) AS deploy_list
UNWIND deploy_list AS d
WITH DISTINCT d
WHERE d IS NOT NULL
RETURN d.id AS id, d.version AS version, d.deployed_at AS deployed_at,
       d.deployed_by AS deployed_by, d.status AS status
ORDER BY d.deployed_at DESC
LIMIT 10