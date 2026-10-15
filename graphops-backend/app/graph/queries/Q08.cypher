CALL algo.pageRank('Service', 'DEPENDS_ON')
YIELD node, score
RETURN node.id AS service, score
ORDER BY score DESC
LIMIT 5