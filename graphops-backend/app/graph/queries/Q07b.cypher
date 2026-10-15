MATCH (a {id: $from}), (b {id: $to})
MATCH p = (a)-[*..6]-(b)
WITH p, length(p) AS len
ORDER BY len ASC
LIMIT 1
RETURN [n IN nodes(p) | {label: labels(n)[0], id: n.id}] AS path,
       [r IN relationships(p) | type(r)] AS rels