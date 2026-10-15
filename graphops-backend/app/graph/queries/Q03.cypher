MATCH (i:Incident {id:$incident_id})-[:HAS_SIGNATURE]->(sig:ErrorSignature)<-[:HAS_SIGNATURE]-(o:Incident)
WHERE o.id <> i.id
OPTIONAL MATCH (o)-[:RESOLVED_BY]->(f:Fix)
RETURN o.id AS incident, o.title AS title, o.status AS status,
       sig.id AS signature, collect(DISTINCT f.id) AS fixes