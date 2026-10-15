MERGE (m:Memory {id:$memory_id})
SET m.type = $type,
    m.title = $title,
    m.summary = $summary,
    m.confidence = $confidence,
    m.status = coalesce(m.status, 'unverified'),
    m.uses = coalesce(m.uses, 0),
    m.created_at = coalesce(m.created_at, $now),
    m.updated_at = $now
WITH m
MATCH (r:AgentRun {id:$run_id})
MERGE (m)-[:DERIVED_FROM]->(r)
WITH m
UNWIND $entity_ids AS eid
MATCH (e {id: eid})
MERGE (m)-[:ABOUT]->(e)
RETURN m.id AS id