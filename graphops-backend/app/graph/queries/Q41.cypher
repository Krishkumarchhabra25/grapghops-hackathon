MATCH (p:Person)
OPTIONAL MATCH (p)-[:MEMBER_OF]->(t:Team)
OPTIONAL MATCH (p)-[:OWNS]->(s:Service)
RETURN p.id AS id, p.name AS name, p.email AS email, p.role AS role,
       t.id AS team_id, t.name AS team_name,
       s.id AS service_id
ORDER BY p.name ASC
LIMIT $limit