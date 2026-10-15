CREATE (i:Incident {
    id: $id,
    title: $title,
    severity: $severity,
    status: $status,
    summary: $summary,
    impact: $impact,
    started_at: $started_at,
    created_at: $now,
    updated_at: $now
})
RETURN i.id AS id