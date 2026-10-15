MATCH (i:Incident {id:$incident_id})-[:HAS_SIGNATURE]->(sig:ErrorSignature)<-[:HAS_SIGNATURE]-(o:Incident)
      -[:RESOLVED_BY]->(f:Fix)-[:VERIFIED_BY]->(out:Outcome {result:'success'})
RETURN f.id AS fix, f.title AS title, count(DISTINCT o) AS times_worked,
       max(out.verified_at) AS last_verified
ORDER BY times_worked DESC, last_verified DESC
LIMIT 5