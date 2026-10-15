MATCH (i:Incident {id:$incident_id})-[:AFFECTED]->(s:Service)
OPTIONAL MATCH (s)<-[:DEPENDS_ON*0..2]-(d:Service)
RETURN s.id AS primary_service, collect(DISTINCT d.id) AS downstream