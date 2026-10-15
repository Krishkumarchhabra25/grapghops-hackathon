MATCH p = (c {id: $center})-[*1..{HOPS}]-(n)
WITH p
LIMIT 100
RETURN
  [node IN nodes(p) | {
    id: node.id,
    type: labels(node)[0],
    name: coalesce(node.name, node.title, node.id),
    status: coalesce(node.status, '')
  }] AS path_nodes,
  [rel IN relationships(p) | {
    source: startNode(rel).id,
    target: endNode(rel).id,
    type: type(rel)
  }] AS path_rels