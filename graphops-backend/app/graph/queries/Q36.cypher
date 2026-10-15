MATCH (s:Service {id:$id})-[r:DEPENDS_ON]->(d)
RETURN d.id AS id, labels(d)[0] AS type,
       coalesce(d.name, d.id) AS name,
       coalesce(d.version, '') AS version,
       coalesce(d.kind, '') AS kind,
       coalesce(r.criticality, 'medium') AS criticality
ORDER BY criticality DESC, name ASC