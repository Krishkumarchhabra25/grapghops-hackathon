CALL algo.WCC('Service', 'DEPENDS_ON')
YIELD node, componentId
RETURN componentId AS community, collect(node.id) AS services