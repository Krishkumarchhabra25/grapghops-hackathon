# Backend implementation plan — GraphOps Brain

## Status

**Planned only.** The current ZIP is a React + TypeScript + Tailwind frontend prototype with mock data and simulated actions. This document describes the backend to implement; none of the endpoints, database connections, agents, authentication providers, or live integrations described below are implemented in the current frontend ZIP.

## Goal

Deliver one product that genuinely covers all three FalkorDB Graph Hacks tracks:

1. **Track 1 — Agents That Act on Connected Data:** query connected entities, investigate incidents, support evidence-based decisions, and execute approved actions.
2. **Track 2 — Agent Memory & Coordination:** persist agent episodes, facts, procedures, run checkpoints, handoffs, and verified outcomes in graph-backed memory.
3. **Track 3 — Company Brain:** connect documents, people, teams, services, projects, repositories, runbooks, incidents, and decisions with provenance and access controls.

All three capabilities should use a shared, tenant-isolated FalkorDB context graph. Build and submit one coherent product and select all tracks in the hackathon submission if the finished implementation meets each track's criteria.

## Recommended architecture

- **API:** Python + FastAPI + Pydantic request/response models.
- **Agent orchestration:** LangGraph for bounded investigation and memory workflows, with explicit steps, checkpoints, retries, timeouts, and trace IDs.
- **Graph context:** FalkorDB using Cypher queries for relationships, multi-hop traversal, impact analysis, and linked memory retrieval.
- **Durable application records:** PostgreSQL for users, workspaces, role bindings, connector configuration, action approvals, durable run metadata, audit events, and job state. FalkorDB is the context/relationship layer, not a replacement for every transactional record.
- **Background jobs and cache:** Redis-backed workers/queue for ingestion, sync, retries, and long-running work.
- **Live updates:** Server-sent events (SSE) for run progress, findings, and approval-state events; use WebSockets only where bidirectional realtime interaction is truly required.
- **Model providers:** server-side provider adapter with configurable primary/fallback models, structured outputs, timeouts, and token/cost accounting. Keep credentials on the server.
- **File storage:** object storage for uploaded source files and run artifacts if required; store source IDs and metadata in PostgreSQL/FalkorDB.
- **Frontend:** the existing React + TypeScript app consumes versioned JSON APIs and typed generated client contracts.

## Track 1 backend: connected-data action

Implement:

1. Ingest incident alerts, deployment events, service dependencies, code changes, traces, and test results from permitted sources or seed data.
2. Normalize entities into the graph, including `Workspace`, `Service`, `Deployment`, `CodeChange`, `Incident`, `ErrorSignature`, `Dependency`, `Runbook`, `Person`, `AgentRun`, `Fix`, and `Outcome`.
3. Preserve provenance on each source-derived node/edge: source system, source record ID, observed time, ingestion job, and confidence where applicable.
4. Provide graph tools that execute parameterized/allow-listed Cypher templates for multi-hop incident investigation, dependency impact, related incident discovery, ownership resolution, and historical recovery lookup.
5. Orchestrate an investigation that separates retrieved facts from LLM-generated hypotheses. Return evidence IDs and graph paths alongside each finding.
6. Produce a proposed-action object with rationale, risks, preconditions, and rollback/verification plan. Require human approval before production-changing actions.
7. Execute only allow-listed actions through scoped integration credentials; record request, approver, executor, before/after state, idempotency key, and test result.
8. Store the confirmed outcome back into the graph and run history so it becomes usable evidence for future runs.

## Track 2 backend: persistent agent memory and coordination

Implement:

- **Episodic memory:** what happened in a run—user goal, steps, tool observations, errors, outcomes, timestamps, and trace references.
- **Semantic memory:** verified facts about services, dependencies, owners, incidents, policies, and the environment.
- **Procedural memory:** reusable recovery procedures or workflows, including preconditions, steps, verification evidence, and known failure modes.
- **Policy memory:** constraints and approval requirements that agents must respect. Treat policy as authoritative configuration, not an untrusted free-text memory.
- **Retrieval:** search memories by exact entities, graph traversal, recency, verified outcomes, permissions, and optionally vector/full-text similarity when configured. Graph relationships must materially influence retrieval and decisions.
- **Coordination:** shared state and checkpoints for investigator, memory analyst, company-knowledge researcher, and resolver roles. Make ownership of state transitions explicit; support cancellation, retries, timeouts, and resume after failure.
- **Learning from outcomes:** update confidence and usefulness from verified test results and explicit operator feedback. Do not treat an LLM assertion alone as a verified success.
- **Lifecycle:** memory provenance, workspace/user scope, TTL/retention rules, corrections, deletion, pin/verify states, and duplicate handling.

## Track 3 backend: Company Brain

Implement ingestion adapters incrementally, starting with synthetic/manual upload and one real connector. Candidate sources are GitHub repositories and pull requests, runbooks/Markdown/PDF, service catalogues, incident tools, and team/project metadata. Do not scrape sources without authorization.

For every ingested item, store its canonical source URL/ID, workspace, access scope, fetched timestamp, content hash/version, sync status, and owning connector. Extract entities and relations such as `Person OWNS Service`, `Service DEPENDS_ON Service`, `Project USES Service`, `Document DESCRIBES Service`, `Incident AFFECTED Service`, and `Decision SUPERSEDES Decision`. Preserve the ability to trace an answer back to its source.

Question answering must filter by workspace and user permissions before returning evidence. It should say when evidence is missing or stale instead of inventing owners or relationships. Connector refreshes should be incremental, retryable, idempotent, and observable.

## Suggested API contract (v1)

All routes below are proposed. Use `/api/v1`, require authenticated workspace context, validate payloads with Pydantic, and return structured errors with a request/trace ID.

| Area | Proposed routes | Purpose |
|---|---|---|
| Auth and workspace | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /workspaces`, `POST /workspaces` | Session, user identity, workspace management |
| Incidents | `GET /incidents`, `POST /incidents`, `GET /incidents/{id}`, `PATCH /incidents/{id}` | Incident lifecycle and severity/status changes |
| Investigations | `POST /investigations`, `GET /investigations`, `GET /investigations/{id}`, `POST /investigations/{id}/cancel` | Start and inspect agent investigations |
| Runs and stream | `GET /runs`, `GET /runs/{id}`, `GET /runs/{id}/events` (SSE), `POST /runs/{id}/retry` | Durable trace, progress, retry and recovery |
| Graph | `GET /graph/nodes`, `GET /graph/edges`, `GET /graph/path`, `POST /graph/query` | Safe graph browsing and approved query templates |
| Memory | `GET /memory`, `POST /memory`, `GET /memory/{id}`, `POST /memory/{id}/verify`, `POST /memory/{id}/pin` | Memory retrieval, ingestion, confidence and lifecycle |
| Knowledge | `GET /knowledge/sources`, `POST /knowledge/sources`, `POST /knowledge/sources/{id}/sync`, `GET /knowledge/search` | Source management, sync, permission-aware retrieval |
| Services and team | `GET /services`, `GET /services/{id}`, `GET /team`, `POST /team/invitations`, `PATCH /team/{id}` | Service catalogue and workspace membership |
| Integrations | `GET /integrations`, `POST /integrations/{provider}/connect`, `POST /integrations/{provider}/disconnect`, `POST /webhooks/{provider}` | Connector lifecycle and signed webhooks |
| Approvals and audit | `GET /approvals`, `POST /approvals/{id}/approve`, `POST /approvals/{id}/reject`, `GET /audit-events` | Human review and immutable action history |
| Settings and health | `GET/PATCH /settings`, `GET /health/live`, `GET /health/ready`, `GET /usage` | Config, health, rate/usage reporting |

Never expose arbitrary database query execution to an untrusted client. `/graph/query` must enforce restricted, validated query templates or a tightly controlled query allow-list.

## Core graph schema proposal

### Node labels

`Workspace`, `Person`, `Team`, `Project`, `Repository`, `Document`, `Runbook`, `Service`, `Deployment`, `CodeChange`, `Incident`, `ErrorSignature`, `Agent`, `AgentRun`, `Memory`, `Fix`, `Action`, and `Outcome`.

### Relationship examples

`(:Person)-[:MEMBER_OF]->(:Team)`, `(:Person)-[:OWNS]->(:Service)`, `(:Service)-[:DEPENDS_ON]->(:Service)`, `(:Deployment)-[:CHANGED]->(:Service)`, `(:Incident)-[:AFFECTED]->(:Service)`, `(:Incident)-[:RELATED_TO]->(:Incident)`, `(:AgentRun)-[:OBSERVED]->(:ErrorSignature)`, `(:Memory)-[:ABOUT]->(:Service)`, `(:Memory)-[:SUPPORTS_FIX]->(:Fix)`, `(:Fix)-[:VERIFIED_BY]->(:Outcome)`, `(:Document)-[:DESCRIBES]->(:Service)`.

Add workspace scoping and source provenance to all applicable entities/relationships. Use stable external IDs and idempotent upserts so repeated ingestion does not create duplicate graph records.

## Security, safety, and reliability requirements

- Secure, HTTP-only, SameSite cookies or an equivalent safe session mechanism; production OAuth/OIDC/SSO must be server-validated. Never accept localStorage demo auth as proof of identity.
- Workspace isolation, RBAC, connector-level permissions, source document ACL enforcement, and tenant-aware graph query templates.
- Keep provider and connector secrets server-side in a secret manager; redact secrets and sensitive data from logs.
- Signed webhook verification, request size limits, rate limiting, input validation, SSRF protection for URL imports, and safe file parsing.
- Treat imported documents, issue text, logs, and repository content as untrusted input. They may contain prompt-injection attempts; they cannot override system policy or authorize actions.
- Human approval by default for production writes. Allow-listed tools, minimal scopes, idempotency, action timeouts, rollback plans, and post-action verification.
- Audit every privileged action, memory mutation, connector change, approval, and access-control change.
- Retry with backoff, cap LLM/tool iterations and spend, support cancellation, persist run checkpoints, and make recovery observable.
- Evaluate with reproducible synthetic scenarios: connected-path retrieval, previous-run memory recall, company-knowledge attribution, permission-boundary checks, false hypotheses, and rejected/failed actions.

## Implementation milestones

1. **Foundation:** FastAPI project, configuration, health routes, database migrations, workspace/auth model, and local Docker Compose for PostgreSQL/Redis/FalkorDB.
2. **Graph core:** schema, parameterized query service, sample seed graph, node/edge/path APIs, and graph provenance tests.
3. **Track 1 vertical slice:** create incident → investigate graph → present evidence and hypotheses → propose fix → approval → synthetic execution/verification → store outcome.
4. **Track 2 vertical slice:** persist run/agent checkpoints and episodic memory; run a second related incident and prove it retrieves the earlier verified outcome. Add semantic/procedural/policy memory after this works.
5. **Track 3 vertical slice:** ingest company docs/service ownership and dependencies; answer a question with source references and permission filtering.
6. **Frontend integration:** replace mock stores one page at a time; add typed API client, loading/empty/error states, SSE reconnection, and pagination.
7. **Hardening:** authz tests, idempotency, failure injection, audit logs, eval scenarios, public README, deployable demo, and recorded walkthrough.

## Definition of done for all three tracks

- Track 1: graph relationships change the investigation result; result includes evidence paths; a proposed action is approval-gated and its outcome is verified.
- Track 2: a later run retrieves a previous run's stored experience and changes its next action; agent state survives process restart and has provenance.
- Track 3: a user asks across at least three connected company entity types; the answer includes source references and respects permissions.
- Common: FalkorDB is central to the actual reasoning, not a decorative visualization; tests and the video demonstrate the graph's impact.
