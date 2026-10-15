MATCH p = (d:Service)-[:DEPENDS_ON*1..3]->(s {id:$service_id})
RETURN d.id AS service, d.name AS name, min(length(p)) AS hops
ORDER BY hops, name