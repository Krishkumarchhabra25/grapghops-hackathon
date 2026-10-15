MATCH (s:Service {id:$id})
OPTIONAL MATCH (p:Person)-[:OWNS]->(s)
OPTIONAL MATCH (t:Team)-[:OWNS]->(s)
OPTIONAL MATCH (rb:Document {type:'Runbook'})-[:DESCRIBES]->(s)
WITH s,
     collect(DISTINCT {id: p.id, name: p.name}) AS owners,
     collect(DISTINCT {id: t.id, name: t.name}) AS teams,
     collect(DISTINCT {id: rb.id, title: rb.title}) AS runbooks
RETURN s.id AS id, s.name AS name, s.env AS env, s.status AS status,
       s.health AS health, s.latency_ms AS latency_ms, s.error_rate AS error_rate,
       s.version AS version, s.repo AS repo, s.description AS description,
       s.updated_at AS updated_at,
       [o IN owners WHERE o.id IS NOT NULL] AS owners,
       [t IN teams WHERE t.id IS NOT NULL] AS teams,
       [r IN runbooks WHERE r.id IS NOT NULL] AS runbooks