MATCH (f:Fix {id:$fix_id}), (i:Incident {id:$incident_id}), (r:AgentRun {id:$run_id})
CREATE (o:Outcome {
  id: $outcome_id, result: $result, evidence: $evidence,
  verified_at: $now, verified_by: $verified_by,
  created_at: $now, updated_at: $now
})
MERGE (i)-[:RESOLVED_BY]->(f)
MERGE (f)-[:VERIFIED_BY]->(o)
MERGE (r)-[:PRODUCED]->(o)
RETURN o.id AS outcome