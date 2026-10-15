MATCH (m:Memory {id:$memory_id}), (f:Fix {id:$fix_id})
MERGE (m)-[:SUPPORTS_FIX]->(f)
RETURN m.id AS id