MATCH (s:Service {id:$service_id})
OPTIONAL MATCH (p:Person)-[:OWNS]->(s)
OPTIONAL MATCH (t:Team)-[:OWNS]->(s)
OPTIONAL MATCH (rb:Document {type:'Runbook'})-[:DESCRIBES]->(s)
RETURN s.id AS service,
       collect(DISTINCT p.name) AS owners,
       collect(DISTINCT t.name) AS teams,
       collect(DISTINCT {id: rb.id, title: rb.title}) AS runbooks