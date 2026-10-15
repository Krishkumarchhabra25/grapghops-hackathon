MATCH (d:Decision {id:$decision_id})
OPTIONAL MATCH (d)-[:SUPERSEDES*0..5]->(prev:Decision)
OPTIONAL MATCH (d)-[:RECORDED_IN]->(doc:Document)
OPTIONAL MATCH (d)-[:DECIDED_BY]->(p:Person)
OPTIONAL MATCH (d)-[:CONCERNS]->(s:Service)
RETURN d.id AS id, d.title AS title, d.rationale AS rationale,
       collect(DISTINCT prev.id) AS supersedes,
       collect(DISTINCT doc.source_url) AS sources,
       collect(DISTINCT p.name) AS decided_by,
       collect(DISTINCT s.id) AS services