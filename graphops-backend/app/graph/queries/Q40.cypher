MATCH (a:AuditEvent)
RETURN DISTINCT a.verb AS verb
ORDER BY verb ASC