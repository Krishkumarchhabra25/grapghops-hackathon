# Hackathon track mapping

GraphOps Brain is one product designed to satisfy all three Graph Hacks tracks. Each track has a concrete user workflow and backend acceptance test. All pages in the current frontend remain demo/mock-only until connected to the planned backend.

| Official track | Frontend areas | Core backend capability | Demo acceptance test |
|---|---|---|---|
| Track 1 — Agents That Act on Connected Data | Incidents, Investigations, Graph Explorer, Service details | FalkorDB multi-hop investigation, graph tools, evidence/provenance, approved actions, post-action verification | Seed an incident linked to a deployment and dependency; investigation follows the graph, surfaces an evidence path, recommends a fix, waits for approval, and stores the test outcome. |
| Track 2 — Agent Memory & Coordination | Agent Runs, Run details, Agent Memory, Investigation timeline | Durable execution state/checkpoints, episodic/semantic/procedural/policy memory, shared state across agent roles, retrieval and confidence/verification | Execute a first incident and record a verified fix; run a second related incident; retrieve that memory from FalkorDB and demonstrate that it influences the next action. |
| Track 3 — Company Brain | Knowledge Base, Services, Team, Integrations | Authorized document/service ingestion, entities and relationships, source provenance, refresh jobs, permission-aware retrieval | Ask who owns a service, what depends on it, and which runbook/incident is relevant; return linked evidence and enforce user/workspace permissions. |

## Shared product behaviour

The three tracks share a single workspace-aware knowledge graph. An incident investigation can use company context to resolve service ownership, previous agent memory to retrieve earlier fixes, and then write a verified outcome back to the graph for future sessions.

## What is in the frontend ZIP today

- Implemented as a React + TypeScript frontend: layout, routes, mock data, and simulated interactions.
- Presentational track map: `/tracks` explains the three tracks and the backend work associated with each.
- Not yet implemented: real FalkorDB queries, API routes, data ingestion, live agent orchestration, production authentication/SSO, action execution, or real integrations.

See [`BACKEND_IMPLEMENTATION_PLAN.md`](./BACKEND_IMPLEMENTATION_PLAN.md) for the proposed architecture, API contract, graph schema, safety controls, and implementation milestones.
