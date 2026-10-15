MATCH (i:Incident {id:$id})
SET i.title = coalesce($title, i.title),
    i.severity = coalesce($severity, i.severity),
    i.status = coalesce($status, i.status),
    i.summary = coalesce($summary, i.summary),
    i.impact = coalesce($impact, i.impact),
    i.root_cause = coalesce($root_cause, i.root_cause),
    i.resolved_at = CASE
        WHEN $status = 'Resolved' AND i.resolved_at IS NULL THEN $now
        WHEN $status IS NOT NULL AND $status <> 'Resolved' THEN null
        ELSE i.resolved_at
    END,
    i.updated_at = $now
RETURN i.id AS id, i.status AS status, i.resolved_at AS resolved_at