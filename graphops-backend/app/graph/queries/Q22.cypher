MATCH (m:Memory {id:$id})
OPTIONAL MATCH (m)-[:ABOUT]->(e)
OPTIONAL MATCH (m)-[:SUPPORTS_FIX]->(f:Fix)
RETURN m.id AS id, m.type AS type, m.title AS title, m.summary AS summary,
       m.confidence AS confidence, m.status AS status, m.uses AS uses,
       m.source AS source, m.expires_at AS expires_at,
       m.created_at AS created_at, m.updated_at AS updated_at,
       e.id AS entity_id,
       labels(e)[0] AS entity_type,
       coalesce(e.name, e.title, e.id) AS entity_name,
       f.id AS fix_id,
       f.title AS fix_title,
       f.kind AS fix_kind