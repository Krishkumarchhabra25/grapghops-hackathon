MATCH (s:Service)
WHERE ($env IS NULL OR s.env = $env)
  AND ($status IS NULL OR s.status = $status)
  AND ($q IS NULL
       OR toLower(s.name) CONTAINS toLower($q)
       OR toLower(coalesce(s.description, '')) CONTAINS toLower($q))
RETURN s.id AS id, s.name AS name, s.env AS env, s.status AS status,
       s.health AS health, s.latency_ms AS latency_ms, s.error_rate AS error_rate,
       s.version AS version, s.repo AS repo, s.description AS description,
       s.updated_at AS updated_at
ORDER BY s.name ASC
LIMIT $limit