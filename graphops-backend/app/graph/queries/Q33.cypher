MATCH (i:Incident {id:$incident_id}), (p:Person {id:$person_id})
MERGE (p)-[:RESOLVED]->(i)
RETURN p.id AS person_id