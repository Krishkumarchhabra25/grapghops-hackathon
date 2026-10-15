# GraphOps Brain — React + TypeScript frontend

A multi-page React + TypeScript + Tailwind CSS prototype for one GraphOps product designed to cover all three FalkorDB Graph Hacks tracks.

> **Important status:** this ZIP contains the frontend prototype and backend planning documents. All data/actions in the UI are mocked or simulated. It does not yet connect to FalkorDB, run real agents, ingest company sources, execute production actions, send mail, or provide production authentication.

## The three hackathon tracks

### Track 1 — Agents That Act on Connected Data

Investigate incidents and dependencies using multi-hop graph queries, provide evidence-backed findings, and propose safe actions with approval and verification. Frontend: **Incidents**, **Investigations**, **Graph Explorer**, **Services**.

### Track 2 — Agent Memory & Coordination

Persist agent run history, episodic/semantic/procedural/policy memory, shared state, and verified outcomes so later runs can use previous experience. Frontend: **Agent Runs**, **Agent Memory**, **Investigation timelines**.

### Track 3 — Company Brain

Connect documents, people, teams, projects, services, repositories, incidents, runbooks, and decisions; answer with source provenance and access controls. Frontend: **Knowledge Base**, **Services**, **Team**, **Integrations**.

All tracks are intended to be delivered as one product with FalkorDB as a shared context layer. The `/tracks` screen maps each track to its frontend pages and proposed backend functionality.

## Frontend features

- Overview dashboard with incident, service-health, graph-context, and agent-run metrics.
- Incident list, search and filters, incident detail, evidence and timeline panels, and simulated recovery actions.
- Investigation list and detail, traces, evidence, progress, and start-investigation flows.
- Interactive graph explorer with selectable nodes/edges, relationship inspection, and Cypher query preview.
- Agent runs, run details, execution traces, model/tokens/cost mock data, and output views.
- Agent memory library for episodic, semantic, procedural, and policy memories, including confidence, sources, entities, pinning, and verification states.
- Company knowledge base with sources, filtering, details, and simulated sync actions.
- Services and service details with dependencies, incidents, and telemetry mock charts.
- Team directory with demo invitations, role changes, and removal confirmation.
- Integration catalogue with simulated connect/disconnect flows.
- Settings for profile, workspace, notifications, AI/model routing, memory policy, security, and usage/billing.
- Sign-in, sign-up, forgot password, and SSO demo screens.
- Global search (Ctrl/Cmd + K), notification drawer, profile menu, toast messages, dialogs, responsive mobile navigation.
- **Track coverage page (`/tracks`)** that explains all three tracks and the backend modules planned for each.

## Backend plan included

`docs/BACKEND_IMPLEMENTATION_PLAN.md` details the proposed FastAPI + LangGraph + FalkorDB architecture, Postgres/Redis roles, graph schema, backend responsibilities for each track, API routes, security guardrails, milestones, and definition of done.

`docs/HACKATHON_TRACK_MAPPING.md` maps tracks to frontend pages and objective backend acceptance tests.

`docs/API_CONTRACT.md` contains proposed endpoint patterns, SSE events, and evidence/error payload examples. These documents are a plan only; the endpoints and backend services are not implemented yet.

## Requirements

- Node.js 20 or newer (Node.js 22 recommended)
- npm

## Run locally

```bash
npm install
npm run dev
```

Vite prints the local URL, usually `http://localhost:5173`.

To run the type checker and production build:

```bash
npm run typecheck
npm run build
```

## Demo access

Open `/login`. The fields are pre-filled:

- Email: `krish@graphops.dev`
- Password: `graphops-demo`

Click **Sign in to workspace**. Authentication is simulated client-side only. The `/` route opens the dashboard directly for quick preview. Sign-out returns to `/login`.

## Project structure

```text
src/
  App.tsx       App shell, routes, pages, dialogs, and demo interactions
  data.ts       Related mock incidents, services, agents, memory, graph, and users
  index.css     Tailwind layers and design tokens / component styles
  main.tsx      React entry point
docs/
  BACKEND_IMPLEMENTATION_PLAN.md
  HACKATHON_TRACK_MAPPING.md
  API_CONTRACT.md
tsconfig.json
vite.config.ts
```

## Dependencies

React, React DOM, React Router, Vite, Tailwind CSS, Lucide React, and Recharts.
