# GraphOps Brain

> **An AI reliability platform that turns scattered engineering context into a living graph — and gives AI agents the ability to investigate incidents, learn from verified outcomes, and answer questions with citations.**

Built for the **FalkorDB Hackathon 2026** — Tracks 01 (Connected Data), 02 (Agent Memory), and 03 (Company Brain).

## 🌐 Live Deployment

- **Frontend:** [graphops.krishchhabra.com](https://graphops.krishchhabra.com)
- **API:** [api.graphops.krishchhabra.com](https://api.graphops.krishchhabra.com)
- **API Docs:** [api.graphops.krishchhabra.com/docs](https://api.graphops.krishchhabra.com/docs)

---

## 📌 What It Does

When a production service breaks, engineers can lose time jumping between PagerDuty, Jira, Confluence, GitHub, and Slack just to answer questions such as:

- Who owns this service?
- What was deployed right before it broke?
- Has this exact error happened before?
- What fixed it last time?
- What else breaks if this service goes down?

**GraphOps Brain puts this engineering context into a FalkorDB graph and explores it with an AI agent.**

The agent:

1. **Investigates** an incident by traversing the graph.
2. **Retrieves** a verified fix from a past incident with the same error signature.
3. **Proposes** that fix to a human, with an evidence path.
4. **Pauses** for approval; nothing runs automatically.
5. **Executes** the approved action against a simulated environment.
6. **Verifies** the outcome and writes a Memory node so future runs can learn from it.

Every claim made by the LLM is grounded in graph evidence. The LLM never writes Cypher.

---

## 🎯 Track Coverage

### Track 01 — Agents That Act on Connected Data

| Requirement | How It's Done |
|---|---|
| Multi-hop reasoning | `Q01` (blast radius, 1–3 hops), `Q07b` (evidence path, up to 6 hops) |
| Graph queries as agent tools | 40+ allow-listed `.cypher` files loaded by ID; no LLM-written Cypher |
| Graph algorithms | `Q08` (PageRank), `Q09` (Weakly Connected Components) |
| Actions grounded in the graph | The proposed fix comes from `Q04` — a fix that worked in a past incident |
| Explainable results | Every finding carries an `evidence_refs` array; the UI renders the causal chain `deploy-42 → svc-payment-gateway → svc-checkout → inc-2481` |

### Track 02 — Agent Memory and Coordination

| Requirement | How It's Done |
|---|---|
| Episodic memory | Workflow step 11 writes `Memory {type: 'episodic'}` after verified outcomes |
| Procedural memory | Step 11 also writes `Memory {type: 'procedural'}` for reusable rollback steps |
| Persistent history | `AgentRun` + `RunEvent` nodes persist every step and survive server restarts |
| Shared state and handoffs | `Q19` compare-and-set on `AgentRun.state_version`; agent roles cycle investigator → graph_researcher → memory_analyst → resolver |
| High-concurrency safety | Async FalkorDB client, Redis pub/sub for SSE, and CAS to prevent lost updates |
| Separate memory per tenant | One graph per workspace (`ws_acme`, `ws_beta`); the control graph holds users and workspaces |

### Track 03 — Company Brain

| Requirement | How It's Done |
|---|---|
| Knowledge from docs in one graph | `Document` nodes represent runbooks, RFCs, architecture docs, and SLOs |
| Who owns what | `Q06` (owners + runbooks), `Q13` (who knows) |
| Tracing decisions | `Q15` (decision → document → author → superseding decisions) |
| Keeping knowledge current | `Q17` (stale documents needing review) |
| Answers with sources | `Q16` (full-text search + graph expansion); the LLM cites `[c1]`, `[c2]` |
| Permission-aware retrieval | `workspace` vs. `team:<id>` visibility; `filtered_count` in every Ask response |

---

## 🏗️ Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                         React Frontend                          │
│  (Vite + TypeScript + Tailwind + React Router + SSE)            │
└────────────────┬────────────────────────────────────────────────┘
                 │ HTTPS · Cookie session (JWT)
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Python 3.12)                │
│  ┌───────────┐  ┌────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │  /auth    │  │/investigat.│  │ /runs (SSE)  │  │ /memory  │  │
│  ├───────────┤  ├────────────┤  ├──────────────┤  ├──────────┤  │
│  │/incidents │  │/approvals  │  │   /graph     │  │/knowledge│  │
│  ├───────────┤  ├────────────┤  ├──────────────┤  ├──────────┤  │
│  │ /services │  │  /team     │  │   /audit     │  │ /health  │  │
│  └───────────┘  └────────────┘  └──────────────┘  └──────────┘  │
└─────┬──────────────────────────────────────┬────────────────────┘
      │                                      │
      │ Async queries via falkordb-py        │ Redis pub/sub
      ▼                                      ▼
┌──────────────────────┐         ┌──────────────────────┐
│       FalkorDB       │         │        Redis         │
│  ┌────────────────┐  │         │  (SSE fan-out,       │
│  │ control graph  │  │         │   demo LLM cache)    │
│  │  · User        │  │         └──────────────────────┘
│  │  · Workspace   │  │
│  └────────────────┘  │         ┌──────────────────────┐
│  ┌────────────────┐  │         │       xAI Grok       │
│  │    ws_acme     │  │◄────────┤  (LLM hypotheses,    │
│  │  · 19 labels   │  │  LLM    │   Ask composition)   │
│  │  · 20 rel types│  │  never  └──────────────────────┘
│  └────────────────┘  │  writes
└──────────────────────┘  Cypher
```

**Core design rules:**

1. **FalkorDB holds domain state** — entities, relationships, memory, runs, approvals, and outcomes.
2. **The LLM never talks directly to the database.** It calls fixed, parameterized query templates as tools.
3. **Retrieved facts, LLM hypotheses, proposed actions, and verified outcomes are stored separately.**
4. **One FalkorDB graph per workspace.** A small `control` graph holds users and workspaces.
5. **Only synthetic data goes into the graph.**
6. **All timestamps are epoch milliseconds** for range queries.

---

## 🗺️ Graph Data Model

### Node Labels (19 in workspace graphs, 2 in the control graph)

Every node carries `id` (a prefixed string), `created_at`, and `updated_at`. Source-derived nodes also carry `source`, `source_id`, and `observed_at`.

| Label | Purpose | Key Properties |
|---|---|---|
| `Service` | A running application | `name`, `env`, `status`, `health`, `latency_ms`, `error_rate`, `version`, `repo`, `description` |
| `Dependency` | A library, database, queue, or external API | `name`, `version`, `kind` (`library` / `database` / `queue` / `external-api`) |
| `Deployment` | A versioned release event | `version`, `deployed_at`, `deployed_by`, `status` |
| `Incident` | A production problem | `title`, `severity`, `status`, `summary`, `impact`, `started_at`, `resolved_at`, `root_cause` |
| `ErrorSignature` | A normalized error message | `pattern`, `normalized_message`, `first_seen` |
| `Fix` | A known remedy | `title`, `kind` (`rollback` / `config` / `patch`), `steps` (JSON array), `risk` |
| `Outcome` | Verified result of applying a fix | `result` (`success` / `failure` / `partial`), `evidence`, `verified_at`, `verified_by` |
| `Person` | A human | `name`, `email`, `role`, `team_id` |
| `Team` | A group of people | `name` |
| `Document` | A runbook, RFC, architecture doc, or SLO | `title`, `type`, `body`, `source_url`, `content_hash`, `visibility` (`workspace` or `team:<id>`), `status` |
| `Decision` | A recorded architectural choice | `title`, `rationale`, `decided_at`, `status` |
| `Agent` | An agent role definition | `name`, `role`, `model` |
| `AgentRun` | One execution of the investigation workflow | `goal`, `status`, `state` (JSON checkpoint), `state_version`, `owner_agent`, `started_at`, `ended_at`, `tokens`, `cost_usd` |
| `RunEvent` | One log line emitted by a run | `seq` (monotonic), `type`, `payload` (JSON), `ts` |
| `Finding` | A fact or hypothesis discovered by the agent | `kind` (`fact` / `hypothesis`), `claim`, `confidence`, `verification`, `evidence_refs` (JSON array) |
| `Memory` | What the agent learned from a past run | `type` (`episodic` / `semantic` / `procedural` / `policy`), `title`, `summary`, `confidence`, `status`, `uses` |
| `Approval` | A human decision on a proposed action | `status` (`pending` / `approved` / `rejected` / `expired`), `requested_at`, `decided_at`, `decided_by` |
| `Action` | A proposed remediation | `kind` (`rollback_dependency` / `scale_consumers` / `reset_connection_pool`), `params` (JSON), `status`, `idempotency_key` |
| `AuditEvent` | An immutable record of a privileged action | `actor`, `verb`, `target_id`, `ts`, `detail` (JSON) |
| **Control graph** |  |  |
| `User` | Login identity | `name`, `email`, `password_hash`, `role` |
| `Workspace` | Tenant container | `name`, `graph_name` |

### Relationship Types (20)

| Type | From → To | Properties | Written By |
|---|---|---|---|
| `DEPENDS_ON` | Service → Service or Dependency | `criticality` | seed, sync |
| `OWNS` | Person / Team → Service | `since` | seed, sync |
| `MEMBER_OF` | Person → Team | — | seed |
| `CHANGED` | Deployment → Service | — | seed, webhook |
| `BUMPED` | Deployment → Dependency | `from_version`, `to_version` | seed |
| `AFFECTED` | Incident → Service | — | incident create |
| `HAS_SIGNATURE` | Incident → ErrorSignature | `match_score` | investigator |
| `RELATED_TO` | Incident → Incident | `via` | investigator |
| `RESOLVED_BY` | Incident → Fix | — | Q12a |
| `VERIFIED_BY` | Fix → Outcome | — | Q12a |
| `RESOLVED` | Person → Incident | — | incident close |
| `DESCRIBES` | Document → Service | — | sync |
| `AUTHORED` | Person → Document | — | seed |
| `RECORDED_IN` | Decision → Document | — | seed |
| `DECIDED_BY` | Decision → Person | — | seed |
| `CONCERNS` | Decision → Service | — | seed |
| `SUPERSEDES` | Decision → Decision | — | seed |
| `RAN` / `FOR_INCIDENT` / `HAS_EVENT` / `PRODUCED` / `PROPOSES` / `REQUIRES` / `FOR_FIX` | AgentRun relationships | — | workflow |
| `ABOUT` | Memory → any entity | — | memory write |
| `DERIVED_FROM` | Memory → AgentRun / Incident | — | memory write |
| `SUPPORTS_FIX` | Memory → Fix | — | memory write |
| `MEMBER_OF_WORKSPACE` | User → Workspace | `role` | control graph |

### Example Subgraph

The seed data creates this causal chain for the demo:

```text
deploy-42  ──CHANGED──▶  svc-payment-gateway  ◀──DEPENDS_ON──  svc-checkout
   │                                                               │
   │ BUMPED                                                        │ AFFECTED
   ▼                                                               ▼
dep-payment-sdk-3-2                                             inc-2481
   ▲                                                               │
   │ DEPENDS_ON                                                    │ HAS_SIGNATURE
svc-payment-gateway  ◀───────────  sig-timeout-001  ───────────────┘
                                   │
                                   │ HAS_SIGNATURE
                                   ▼
                                inc-2410
                                   │ RESOLVED_BY
                                   ▼
                         fix-rollback-sdk-3-1-8
                                   │ VERIFIED_BY
                                   ▼
                              out-100 (success)
```

When the agent investigates `inc-2481`, it finds `inc-2410` via their shared signature and then finds `fix-rollback-sdk-3-1-8` via `Q04`. **That is the memory proof.**

---

## 🔍 Cypher Query Catalogue

All queries live in `graphops-backend/app/graph/queries/` as `.cypher` files. The runner loads them by ID and passes parameters — **raw Cypher never reaches FalkorDB from the LLM or the client.**

### Track 01 — Investigate and Act

| ID | Purpose |
|---|---|
| `Q01` | Blast radius — which services depend on this one (1–3 hops) |
| `Q02` | Services directly affected by an incident, plus downstream services |
| `Q03` | Related incidents by shared error signature |
| `Q04` | Historical fixes ranked by proven successes |
| `Q05` | Recent deployments on the affected service or its dependencies |
| `Q06` | Owners and runbooks for a service |
| `Q07` | Evidence path: deployment → dependency → service → incident |
| `Q07b` | Generic undirected shortest path between any two nodes (up to 6 hops) |
| `Q08` | Service criticality via PageRank |
| `Q09` | Service communities via Weakly Connected Components |
| `Q12a` | Record the verified outcome of an executed fix |
| `Q20` | Write an ErrorSignature (idempotent, hash-keyed) |

### Track 02 — Memory and Coordination

| ID | Purpose |
|---|---|
| `Q10` | Recall memories about the entities in play (verified first, by confidence) |
| `Q11` | Write a memory and link it to a run and entities |
| `Q11b` | Link a memory to a Fix via `SUPPORTS_FIX` |
| `Q11m` | Manual memory creation (no run required) |
| `Q12b` | Update memory confidence after a verified outcome |
| `Q19` | Claim state — compare-and-set handoff between agents |

**Confidence heuristic:** on success, `confidence += (1 - confidence) * 0.2`; on failure, `confidence *= 0.6`.

### Track 03 — Company Brain

| ID | Purpose |
|---|---|
| `Q13` | Who knows about a service (owners + resolvers + authors) |
| `Q14` | Documents describing a service, filtered by visibility |
| `Q15` | Decision trace: sources, superseding decisions, and deciders |
| `Q16` | Ask retrieval: full-text match + graph expansion, permission-filtered |
| `Q17` | Stale documents needing review |

### Shared

| ID | Purpose |
|---|---|
| `Q18` | Subgraph neighborhood for the Graph Explorer |
| `Q21` / `Q21b` | List memories, with or without full-text search |
| `Q22` | Memory detail with linked entities and fixes |
| `Q23` / `Q24` | Document list and detail |
| `Q25` | Full update of a memory (used by PATCH) |
| `Q26` | Count total full-text matches (no visibility filter) |
| `Q30`–`Q42` | Incidents, Services, Team listings and details |

### The “No LLM-Written Cypher” Guardrail

`graphops-backend/app/graph/service.py`:

```python
def _load(query_id: str) -> str:
    if query_id not in _TEMPLATES:
        path = QUERY_DIR / f'{query_id}.cypher'
        if not path.exists():
            raise ValueError(f'Unknown query template: {query_id}')
        _TEMPLATES[query_id] = path.read_text(encoding='utf-8')
    return _TEMPLATES[query_id]


async def run_template(query_id, params, workspace_id):
    if not query_id or not query_id.startswith('Q'):
        raise ValueError('Invalid query id')
    # Clamp hop depths, interpolate {HOPS}, and execute against FalkorDB.
```

The LLM only emits a JSON object such as:

```json
{
  "hypotheses": [
    {
      "claim": "The payment-sdk 3.2.0 retry-policy change causes checkout timeouts",
      "confidence": 0.87,
      "supporting_finding_ids": ["find-xxxx"],
      "supporting_memory_ids": ["mem-yyyy"],
      "missing_evidence": ["No trace spans from the payment call yet"]
    }
  ],
  "recommended_fix_id": "fix-rollback-sdk-3-1-8"
}
```

Any ID the LLM cites that was not present in its input is dropped before persistence.

---

## 🚀 Local Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker Desktop
- An xAI API key from the [xAI Console](https://console.x.ai/) for the LLM steps

### Step 1 — Clone the repository

```bash
git clone <your-repo-url>
cd Grapops-hackathon
```

The repository contains two main folders:

- `graphops-backend/` — FastAPI + FalkorDB + workflow
- `graphops-brain/` — React + TypeScript + Tailwind frontend

### Step 2 — Install backend dependencies

```bash
cd graphops-backend
python -m venv .venv
```

Activate the environment:

```bash
# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# macOS / Linux
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and set the required values:

```env
XAI_API_KEY=xai-...
JWT_SECRET=change-me-to-a-long-random-string
```

Use your own secrets in your local `.env` file. Do not commit real API keys or production secrets.

### Step 3 — Start FalkorDB and Redis

```bash
docker compose up -d
```

Verify the containers:

```bash
docker ps
```

The local setup is expected to expose FalkorDB on port `6379` (browser UI at port `3000`) and Redis on port `6380`, based on the provided Docker Compose configuration.

### Step 4 — Initialize the schema and seed data

From `graphops-backend/`:

```bash
python -m scripts.init_schema
python -m seed.seed
python -m scripts.seed_auth
```

This initializes indexes and constraints, seeds demo graph data, and creates demo users. The project seed is described as containing:

- Indexes on `id` for every label and unique constraints
- Full-text indexes on `Document.title/body` and `Memory.title/summary`
- Demo graph data for services, people, teams, incidents, deployments, documents, fixes, and verified outcomes
- 6 demo users in the control graph

### 🔐 Demo Users & Permissions

All six accounts are seeded by `python -m scripts.seed_auth`. The passwords are stored as **bcrypt hashes** in the control graph, not as plaintext. These are demo credentials; do not reuse them in production.

#### Demo Users

| Email | Password | Role | Team | What They Can Do |
|---|---|---|---|---|
| `krish@graphops.dev` | `graphops-demo` | **Owner** | Core Platform | Full access. Can approve actions, delete memories, create incidents and investigations, and view workspace data. |
| `priya@graphops.dev` | `graphops-demo` | **Admin** | Infrastructure | Can approve actions, manage the team, and create memories; cannot delete the workspace. |
| `ananya@graphops.dev` | `graphops-demo` | **Engineer** | Payments | Can start investigations, approve actions, create incidents, and write memories. Sees `team:payments`-scoped documents. |
| `vikram@graphops.dev` | `graphops-demo` | **Engineer** | Infrastructure | Engineer access for the Infrastructure team; sees `team:infrastructure`-scoped documents. |
| `rahul@graphops.dev` | `graphops-demo` | **Engineer** | Core Platform | Engineer access for the Core Platform team; demonstrates team-level isolation. |
| `neha@graphops.dev` | `graphops-demo` | **Viewer** | Payments | Read-only access to incidents, runs, memories, and documents. Cannot approve actions, write memories, or start investigations. |

#### Permission Matrix

| Action | Viewer | Engineer | Admin | Owner |
|---|:---:|:---:|:---:|:---:|
| View dashboard, incidents, runs, memory, and knowledge | ✅ | ✅ | ✅ | ✅ |
| Read documents scoped to `workspace` | ✅ | ✅ | ✅ | ✅ |
| Read documents scoped to their `team:<id>` | ✅ | ✅ | ✅ | ✅ |
| Read documents scoped to other teams | ❌ | ❌ | ❌ | ❌ |
| Ask questions about the knowledge base | ✅ | ✅ | ✅ | ✅ |
| Start an investigation | ❌ | ✅ | ✅ | ✅ |
| Approve or reject a proposed action | ❌ | ✅ | ✅ | ✅ |
| Retry a failed run | ❌ | ✅ | ✅ | ✅ |
| Create incidents | ❌ | ✅ | ✅ | ✅ |
| Update incidents | ❌ | ✅ | ✅ | ✅ |
| Create memories manually | ❌ | ✅ | ✅ | ✅ |
| Verify, pin, or deprecate memories | ❌ | ✅ | ✅ | ✅ |
| Delete memories | ❌ | ✅ | ✅ | ✅ |
| Run allow-listed templates via Graph Explorer | ❌ | ✅ | ✅ | ✅ |
| Manage mock integrations | ✅ | ✅ | ✅ | ✅ |
| Edit workspace settings | ❌ | ❌ | ✅ | ✅ |
| Invite team members | ❌ | ❌ | ✅ | ✅ |
| Delete workspace | ❌ | ❌ | ❌ | ✅ |
| View audit log | ✅ | ✅ | ✅ | ✅ |

#### Two RBAC Demo Moments

**1. Approval gating**

- Log in as **Neha** (Viewer) and open a paused run. The approval panel should explain that a Viewer can see the approval but cannot decide on it.
- Log in as **Ananya** (Engineer) and open the same run. The **Approve & resume** control should be available.

**2. Document visibility**

- Log in as **Krish** (Owner, Core Platform) and ask, “What is the payment SDK migration policy?” The restricted RFC should be excluded and reflected in `filtered_count`.
- Log in as **Ananya** (Engineer, Payments) and ask the same question. The answer should include a citation such as `[c1]` to `doc-18`.

**Same question, different users, different answers:** document visibility is intended to be enforced by the API, not just hidden by the UI. Confirm these behaviors against the current checkout before treating them as verified test results.

### Step 5 — Run the backend

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Check readiness at:

```text
http://localhost:8000/api/v1/health/ready
```

The expected response reports `ok` for `falkordb`, `redis`, `schema`, and `llm` when all dependencies and configuration are ready.

### Step 6 — Run the frontend

Open a second terminal:

```bash
cd graphops-brain
npm install
```

Create `.env.local` with the backend URL:

```env
VITE_API_BASE_URL=http://localhost:8000
```

Start the frontend:

```bash
npm run dev
```

Open `http://localhost:5173` and log in using the demo credentials.

### Using FalkorDB Cloud Instead of Docker

1. Create an instance at [FalkorDB Cloud](https://app.falkordb.cloud/).
2. Copy the endpoint host, port, username, and password from the instance details.
3. Update the `.env` file using the connection settings required by your configuration, for example:

   ```env
   FALKORDB_HOST=your-instance-host
   FALKORDB_PORT=52382
   FALKORDB_USERNAME=falkordb
   FALKORDB_PASSWORD=your-instance-password
   ```

4. Run `python -m scripts.init_schema` to apply the schema to the cloud instance.
5. Skip `docker compose up` if you are using cloud-hosted FalkorDB. Redis is still used for SSE fan-out; if needed, you can run it separately:

   ```bash
   docker run -p 6380:6379 redis:7-alpine
   ```

---

## ⚙️ Environment Configuration

The project uses a backend `graphops-backend/.env` file and a frontend `graphops-brain/.env.local` file. Keep both local files out of version control. The backend template belongs in `graphops-backend/.env.example`; the frontend only needs `VITE_API_BASE_URL`.

### Backend — `graphops-backend/.env`

From `graphops-backend/`, copy `.env.example` to `.env` and set values for your environment. The following is a reference configuration; use the variable names supported by your current `app/config.py`.

```env
# ---------- App ----------
APP_NAME=GraphOps Brain API
APP_VERSION=0.1.0
ENV=development
HOST=0.0.0.0
PORT=8000
# Comma-separated list of allowed browser origins
CORS_ORIGINS=http://localhost:5173
# Generate a strong secret, for example: openssl rand -hex 32
JWT_SECRET=change-me-to-a-long-random-string
JWT_ALGORITHM=HS256
JWT_TTL_SECONDS=43200
COOKIE_NAME=graphops_session
COOKIE_SECURE=false
COOKIE_SAMESITE=lax

# ---------- FalkorDB (primary graph database) ----------
# Local Docker: host=localhost, port=6379, username/password blank
# Cloud: use the host, port, username, and password from your instance
FALKORDB_HOST=localhost
FALKORDB_PORT=6379
FALKORDB_USERNAME=
FALKORDB_PASSWORD=
CONTROL_GRAPH=control
DEFAULT_WORKSPACE_ID=acme
# Enable only when vector search is configured
ENABLE_VECTOR_INDEX=false
EMBEDDING_DIM=768

# ---------- Redis (SSE fan-out + demo cache) ----------
# Host port 6380 maps to container port 6379 in docker-compose.yml
REDIS_URL=redis://localhost:6380/0

# ---------- xAI Grok (LLM) ----------
# Get a key from https://console.x.ai/team/default/api-keys
XAI_API_KEY=xai-your-key-here
LLM_BASE_URL=https://api.x.ai/v1
LLM_MODEL_REASONING=grok-4.7
LLM_MODEL_FAST=grok-build-0.1
LLM_TIMEOUT_SECONDS=60
LLM_MAX_OUTPUT_TOKENS=2000
# 1 = replay cached responses; 0 = call the API
DEMO_CACHE=0
```

**Where settings are read:** `app/config.py` (Pydantic Settings). If settings are cached at startup, restart the backend after editing `.env`; `uvicorn --reload` normally restarts the app when Python files change, but a change to an env file may still require a manual restart.

| Variable | Requirement | Effect if unavailable or misconfigured |
|---|---|---|
| `FALKORDB_HOST` / `FALKORDB_PORT` | Required | Graph queries cannot run if FalkorDB is unreachable. |
| `REDIS_URL` | Required for live run streaming | SSE event fan-out may not work. |
| `JWT_SECRET` | Required for authentication | Session signing and login can fail. Use a strong private value. |
| `XAI_API_KEY` | Required for LLM features | Hypothesis generation and the Ask endpoint may be unavailable without it. |
| `CORS_ORIGINS` | Must include the frontend origin | Browser requests may be blocked by CORS. |
| `ENABLE_VECTOR_INDEX` | Optional | Vector index creation is skipped when disabled. |

For production, use a strong `JWT_SECRET`, serve the app over HTTPS, set `COOKIE_SECURE=true`, restrict `CORS_ORIGINS` to trusted origins, and never commit real API keys or credentials.

### Frontend — `graphops-brain/.env.local`

Create this file in the frontend directory:

```env
# Local development
VITE_API_BASE_URL=http://localhost:8000

# Example production value (replace with your deployed backend URL)
# VITE_API_BASE_URL=https://your-backend.example.com
```

The frontend reads this variable from `src/lib/api.ts`; if it is unset, the documented fallback is `http://localhost:8000`. Vite exposes variables prefixed with `VITE_` to the browser, so do not put secrets in frontend environment variables. Restart `npm run dev` after changing `.env.local`.

### Docker Compose — `graphops-backend/docker-compose.yml`

The Compose file starts FalkorDB and Redis. In the default local setup, no extra Compose `.env` file is required if these values are hardcoded in the checked-in Compose file.

```yaml
services:
  falkordb:
    image: falkordb/falkordb:latest
    ports:
      - '6379:6379'    # FalkorDB
      - '3000:3000'    # FalkorDB Browser UI
    volumes:
      - falkordb_data:/var/lib/falkordb/data

  redis:
    image: redis:7-alpine
    ports:
      - '6380:6379'    # host port 6380 -> container port 6379
    volumes:
      - redis_data:/data

volumes:
  falkordb_data:
  redis_data:
```

| Host port | Service | Purpose |
|---|---|---|
| `6379` | FalkorDB | Graph queries from the backend |
| `3000` | FalkorDB Browser | Visual graph explorer |
| `6380` | Redis | SSE pub/sub and cache |
| `8000` | FastAPI | Backend API, run with Uvicorn |
| `5173` | Vite | Frontend development server |

### Switching Between Local and Cloud FalkorDB

For local Docker, use:

```env
FALKORDB_HOST=localhost
FALKORDB_PORT=6379
FALKORDB_USERNAME=
FALKORDB_PASSWORD=
```

For FalkorDB Cloud, use the exact instance values shown in the provider dashboard:

```env
FALKORDB_HOST=your-instance-host
FALKORDB_PORT=your-instance-port
FALKORDB_USERNAME=falkordb
FALKORDB_PASSWORD=your-instance-password
```

After switching endpoints, initialize the schema against the selected database from `graphops-backend/`:

```bash
python -m scripts.init_schema
```

If you use cloud-hosted FalkorDB, you can skip the local FalkorDB container. Redis is still needed for SSE fan-out unless you have changed the application architecture; start Redis locally if required:

```bash
docker run -p 6380:6379 redis:7-alpine
```

### Common Environment Issues

| Symptom | Likely cause / check |
|---|---|
| `invalid username-password pair` | Cloud credentials are configured while the backend points at local Docker, or the cloud credentials are incorrect. |
| FalkorDB is not reachable | Docker may not be running, or `FALKORDB_HOST` / `FALKORDB_PORT` may be incorrect. |
| `XAI_API_KEY is not set` | `graphops-backend/.env` is missing, the key is blank, or the backend was not restarted after the change. |
| `Missing parameters` during a query | Check the query template's expected parameters and the parameter coercion in `app/graph/service.py`. |
| Frontend shows “Failed to fetch” | The backend may not be running, or `VITE_API_BASE_URL` points to the wrong host or port. |
| CORS error in browser DevTools | Ensure `CORS_ORIGINS` includes the exact frontend origin, including scheme and port. |

---

## 🎬 The Demo Journey

1. **Log in** as `krish@graphops.dev`.
2. **Overview:** inspect the services, incidents, and runs.
3. **Incidents:** open `inc-2481` (Checkout error spike).
4. **Start an investigation** and watch the SSE stream. Expected events include `run.started`, `tool.completed` (×5), `graph.path_found`, `memory.retrieved`, `finding.created` (×2), `action.proposed`, and `approval.required`.
5. The **Approval** panel appears. Click **Approve & resume**.
6. Watch for `action.executed`, `verification.completed`, `memory.written`, and `run.completed`.
7. **Agent Memory:** inspect the episodic and procedural memories created by the run.
8. **Graph Explorer:** explore an evidence path such as `deploy-42 → inc-2481`.
9. **Knowledge Base:** ask, “What is the payment SDK migration policy?”
   - As **Krish** (`team-core`), `filtered_count: 1` indicates the RFC is hidden.
   - As **Ananya** (`team-payments`), the answer includes the relevant `[c1]` citation.

**Track 02 proof:** start a second investigation on a different incident with the same error signature. The second run should recall the memory from the first run and propose the same fix, citing a memory such as `mem-xxxx`.

---

## 📂 Repository Layout

```text
Grapops-hackathon/
├── README.md
├── LICENSE
├── docs/
│   └── screenshots/              # Demo screenshots
│
├── graphops-backend/
│   ├── app/
│   │   ├── api/                  # FastAPI routers
│   │   ├── agents/               # Workflow, tools, LLM adapter, events
│   │   ├── auth/                 # Password hashing, JWT, session service
│   │   ├── db/                   # FalkorDB + Redis clients
│   │   ├── graph/
│   │   │   ├── queries/          # .cypher files loaded by ID
│   │   │   ├── schema.py         # Indexes + constraints
│   │   │   └── service.py        # Query runner; no LLM-written Cypher
│   │   ├── models/               # Pydantic schemas
│   │   └── services/             # Audit helper
│   ├── scripts/                  # init_schema, seed_auth
│   ├── seed/                     # data.json + seed.py
│   ├── docker-compose.yml
│   ├── requirements.txt
│   └── .env.example
│
└── graphops-brain/
    ├── src/
    │   ├── components/           # Layout, UI primitives, modals
    │   ├── contexts/             # Auth, Toast, Modal
    │   ├── lib/                  # API client, hooks, SSE, utilities
    │   └── pages/                # Pages, including auth flow
    ├── index.html
    └── vite.config.ts
```

---

## 🤖 AI-Use Disclosure

Per the hackathon rules, this section transparently documents the AI assistance used in this project. **GraphOps Brain was built solo by Krish Chhabra; there are no teammates.**

### AI tools used

| Tool | Role in the project |
|---|---|
| **Claude (Anthropic, free tier)** | Primary coding assistant for backend logic, graph queries, debugging, architecture design, and README drafting. |
| **DeepSeek (free tier)** | Planning, architecture discussions, troubleshooting, and implementation sanity checks through the chat interface. |
| **ChatGPT (free tier)** | Frontend UI design and layout inspiration for the React pages. Usage was limited and focused mainly on design thinking rather than generating large blocks of production code. |
| **xAI Grok** | Runtime LLM inside the product for investigation-hypothesis generation and Ask answer composition. This is a product dependency, separate from the development assistants. |

### What was AI-assisted

**Backend — Claude (primary assistant):**

- Boilerplate and initial implementations for FastAPI routers, Pydantic models, and service layers.
- Initial drafts of some `.cypher` query templates; these were reviewed and executed manually against FalkorDB to check their results.
- The SSE event-streaming hook and Redis pub/sub wiring.
- Docker Compose configuration, Dockerfile, and GitHub Actions CI/CD pipeline.
- Debugging sessions involving async task lifecycles, Pydantic schemas, and dependency issues.

**Frontend — ChatGPT free tier (UI design help):**

- Visual design and layout inspiration for the Overview, Incidents, Runs, Memory, Graph Explorer, and Knowledge React pages.
- Ideas for component structure and Tailwind styling patterns.
- ChatGPT was used mainly for design thinking, not for generating large blocks of production code.

**Planning and architecture — DeepSeek free tier:**

- Discussions about the graph schema and workflow steps.
- Troubleshooting deployment issues, including DNS, Docker, and Nginx.
- Sanity-checking technical decisions before implementation.

**Runtime LLM — xAI Grok:**

- Generates investigation hypotheses in workflow step 6 and composes cited answers for the Ask feature.
- The LLM does not write Cypher. It works with fixed, parameterized query templates exposed by the application.

### What I verified by hand

- The graph data model, including 19 node labels and 20 relationship types, was designed and validated manually.
- Cypher queries were tested against the seed data in FalkorDB Browser to check that they return the expected rows.
- The 12-step workflow was exercised end-to-end: investigate → approve → execute → verify → learn.
- The permission-aware Ask feature was checked with demo users from different teams: Krish sees `filtered_count: 1`, while Ananya can access the payment RFC.
- FalkorDB is the primary graph database; the product relies on it for graph-backed functionality.
- The production deployment on AWS EC2 was configured with an Nginx reverse proxy, Let's Encrypt SSL, hardened SSH on port `44422`, and GitHub Actions CI/CD with independent frontend/backend detection.
- The application was connected to FalkorDB Cloud and demo seed data was loaded into the managed instance.

### Statement of understanding and originality

Every line of code in this repository can be explained by me. AI was used as a coding accelerator, not as a substitute for understanding the architecture, graph schema, or agent workflow. The core design decisions—including one FalkorDB graph per workspace, preventing the LLM from writing Cypher, human-in-the-loop approvals, and agent memory that compounds across runs—are my original design decisions. I can walk through how the submitted code works if asked by a judge.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| Graph database | FalkorDB 4.22 |
| Frontend | React 18 + TypeScript + Vite + Tailwind |
| Backend | FastAPI + Pydantic v2 + Uvicorn |
| LLM | xAI Grok models via the OpenAI SDK |
| Streaming | Server-Sent Events (SSE) + Redis pub/sub |
| Auth | JWT (HS256) in HTTP-only cookies |
| Deployment | Docker Compose locally or a container host |

---

## 📊 Test Coverage

The project notes the following manual smoke-test acceptance criteria. Confirm these again against the current checkout before presenting them as verified results in a submission.

**Track 01:**

- [ ] Removing `Q05` or `Q07` changes the findings and evidence path.
- [ ] The evidence path renders in the UI.
- [ ] The proposed action waits for human approval.
- [ ] The outcome is stored as an `Outcome` node.

**Track 02:**

- [ ] Run 2 retrieves information stored by Run 1.
- [ ] Run 2's proposed action uses recalled memory.
- [ ] Run state survives an API restart.
- [ ] Handoffs are reflected in `owner_agent` changes across `RunEvent` entries.
- [ ] Two workspaces cannot see each other's memories.

**Track 03:**

- [ ] One answer spans at least three entity types (Person + Service + Document).
- [ ] Every answer claim has a `[cN]` citation.
- [ ] A restricted document is excluded and counted in `filtered_count`.
- [ ] Missing evidence is reported in `gaps`, not invented.

---

## 📜 License

MIT — see [`LICENSE`](LICENSE).

---

## 👤 Builder

Built solo during the FalkorDB Hackathon 2026 by:

- **Krish Chhabra** — project design, backend, graph schema, agent workflow, frontend, and deployment.

---

*Built with FalkorDB because a graph makes relationships such as “this deployment changed this dependency, which this service uses, and this incident affected” first-class and explorable.*
