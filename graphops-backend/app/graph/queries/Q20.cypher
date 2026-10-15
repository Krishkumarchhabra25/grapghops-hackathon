MATCH (i:Incident {id:$incident_id})
MERGE (sig:ErrorSignature {id:$sig_id})
ON CREATE SET sig.pattern = $pattern,
              sig.normalized_message = $normalized,
              sig.first_seen = $now,
              sig.created_at = $now,
              sig.updated_at = $now
MERGE (i)-[r:HAS_SIGNATURE]->(sig)
ON CREATE SET r.match_score = 1.0
RETURN sig.id AS signature