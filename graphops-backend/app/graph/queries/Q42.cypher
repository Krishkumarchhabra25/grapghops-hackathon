MATCH (p:Person {id:$id})
OPTIONAL MATCH (p)-[:MEMBER_OF]->(t:Team)
OPTIONAL MATCH (p)-[:OWNS]->(s:Service)
OPTIONAL MATCH (p)-[:RESOLVED]->(i:Incident)
RETURN p.id AS id, p.name AS name, p.email AS email, p.role AS role,
       t.id AS team_id, t.name AS team_name,
       s.id AS service_id, s.name AS service_name, s.status AS service_status,
       i.id AS incident_id, i.title AS incident_title,
       i.severity AS incident_severity, i.status AS incident_status,
       i.resolved_at AS incident_resolved_at