MATCH (r:AgentRun {id:$run_id, state_version:$expected_version})
SET r.state_version = $expected_version + 1,
    r.owner_agent = $agent,
    r.state = $new_state_json,
    r.status = $status,
    r.updated_at = $now
RETURN r.state_version AS version