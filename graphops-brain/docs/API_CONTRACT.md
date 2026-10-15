# Proposed API contract (not implemented yet)

Base path: `/api/v1`. These are planned endpoint names, not live endpoints. All workspace data routes require server-side authentication and authorization.

## Example investigation request

`POST /investigations`

```json
{
  "title": "Investigate checkout timeout",
  "incident_id": "INC-2048",
  "tracks": ["connected_data", "agent_memory", "company_brain"],
  "options": {
    "include_historical_memory": true,
    "include_company_context": true,
    "require_approval_for_actions": true
  }
}
```

Proposed response: `202 Accepted` with `investigation_id`, `run_id`, `status`, `created_at`, and an event stream URL.

## Proposed stream events

`run.started`, `agent.started`, `tool.started`, `tool.completed`, `graph.path_found`, `memory.retrieved`, `finding.created`, `action.proposed`, `approval.required`, `action.executed`, `verification.completed`, `memory.written`, `run.completed`, `run.failed`. Every event should contain a run ID, monotonic sequence number, timestamp, and trace ID. Avoid emitting secrets or unredacted sensitive data.

## Proposed evidence format

```json
{
  "id": "evidence_01",
  "kind": "graph_path",
  "claim": "The checkout deployment introduced the dependency associated with the timeout",
  "confidence": 0.87,
  "source_refs": ["deployment:dep_42", "incident:INC-2048"],
  "path": [
    {"label": "Service", "id": "checkout-api"},
    {"label": "Deployment", "id": "dep_42"},
    {"label": "Dependency", "id": "payment-sdk@3.2"}
  ],
  "verification_status": "unverified_hypothesis"
}
```

Confidence is a calibrated estimate, not proof. Source facts, model-generated hypotheses, proposed actions, and verified outcomes must be represented separately.

## Error envelope

```json
{
  "error": {
    "code": "permission_denied",
    "message": "You do not have access to this resource.",
    "request_id": "req_..."
  }
}
```

Never include stack traces, credentials, or restricted source content in client-facing errors.
