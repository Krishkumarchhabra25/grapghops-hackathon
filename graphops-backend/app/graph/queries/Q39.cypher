MATCH (a:AuditEvent)
WHERE ($actor IS NULL OR a.actor = $actor)
  AND ($verb IS NULL OR a.verb = $verb)
  AND ($target_id IS NULL OR a.target_id = $target_id)
  AND ($since IS NULL OR a.ts >= $since)
  AND ($until IS NULL OR a.ts <= $until)
RETURN a.id AS id, a.actor AS actor, a.verb AS verb,
       a.target_id AS target_id, a.ts AS ts, a.detail AS detail
ORDER BY a.ts DESC
SKIP $offset
LIMIT $limit