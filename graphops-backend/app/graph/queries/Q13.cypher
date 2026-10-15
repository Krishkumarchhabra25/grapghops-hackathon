MATCH (p:Person)-[:OWNS]->(s:Service {id:$service_id})
RETURN p.id AS person, p.name AS name, 'owner' AS via, 1 AS weight
UNION ALL
MATCH (p:Person)-[:RESOLVED]->(:Incident)-[:AFFECTED]->(s:Service {id:$service_id})
RETURN p.id AS person, p.name AS name, 'resolved_incident' AS via, count(*) AS weight
UNION ALL
MATCH (p:Person)-[:AUTHORED]->(:Document)-[:DESCRIBES]->(s:Service {id:$service_id})
RETURN p.id AS person, p.name AS name, 'authored_doc' AS via, count(*) AS weight