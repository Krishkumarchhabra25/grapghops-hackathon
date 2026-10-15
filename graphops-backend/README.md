# GraphOps Brain: backend setup

FastAPI project skeleton for Graph Hacks 2026. It contains **setup only**: config, database clients, the graph schema, data models, the Grok client and health routes. The feature APIs and services (incidents, investigations, memory, Ask and so on) are not here yet.

## Run it

Needs Python 3.11+ and Docker.

```bash
cp .env.example .env              # already included as .env; add your XAI_API_KEY
docker compose up -d              # FalkorDB :6379 (Browser :3000) and Redis :6380
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs and call:

| Route | Meaning |
|---|---|
| `GET /api/v1/health/live` | Process is up. Never touches a database |
| `GET /api/v1/health/ready` | `ok`, `degraded` (HTTP 200) or `down` (HTTP 503). FalkorDB is required. Redis, schema and the Grok key are optional |
| `GET /api/v1/health/ready?deep=true` | Also lists models on your xAI account (no tokens used) and checks that `LLM_MODEL_REASONING` and `LLM_MODEL_FAST` exist |

The API starts even if a database is down. It reports `down` and sets up the schema by itself once FalkorDB becomes reachable.

## What is inside

```text
.env / .env.example      all configuration (table below)
docker-compose.yml       FalkorDB + Redis only
requirements.txt         pinned versions (falkordb, redis, openai SDK, fastapi ...)
app/
  main.py                app factory, startup (connect + schema), CORS, request ids, error envelope
  config.py              typed settings loaded from .env
  db/falkor.py           async FalkorDB client, control graph and ws_<id> graph helpers, ping
  db/redis.py            async Redis client, ping
  graph/schema.py        indexes, UNIQUE id constraints, full-text, optional vector index (idempotent)
  models/enums.py        all status/type enums
  models/nodes.py        Pydantic model for every node label (21), to_props / from_props
  models/relations.py    all relationship types with allowed from/to labels
  models/common.py       error envelope and health response models
  llm/client.py          Grok client (OpenAI-compatible), model tiers, chat(), model check
  api/health.py          the health routes
scripts/init_schema.py   run schema setup by hand: python -m scripts.init_schema
```

## Which store does what

| Store | Used for |
|---|---|
| FalkorDB `ws_<id>` graph | All domain data: services, incidents, memory, runs, approvals, outcomes, documents |
| FalkorDB `control` graph | Users and workspaces |
| Redis (port 6380) | Not a source of truth. Later: demo LLM cache and live-event fan-out for SSE |
| Grok (xAI API) | Reasoning and structured output only. Never talks to the database |

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `APP_NAME`, `ENV`, `HOST`, `PORT` | see file | Server basics. `ENV=development` enables reload |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated browser origins |
| `JWT_SECRET` | `change-me...` | Login cookie signing (used later) |
| `FALKORDB_HOST`, `FALKORDB_PORT` | `localhost`, `6379` | FalkorDB address |
| `FALKORDB_USERNAME`, `FALKORDB_PASSWORD` | empty | Only if your instance needs auth (e.g. FalkorDB Cloud) |
| `CONTROL_GRAPH` | `control` | Graph for users and workspaces |
| `DEFAULT_WORKSPACE_ID` | `acme` | Workspace graph `ws_acme` created at startup |
| `ENABLE_VECTOR_INDEX`, `EMBEDDING_DIM` | `false`, `768` | Optional vector index on `Memory.embedding` |
| `REDIS_URL` | `redis://localhost:6380/0` | Redis address |
| `XAI_API_KEY` | empty | Your key from console.x.ai |
| `LLM_BASE_URL` | `https://api.x.ai/v1` | xAI OpenAI-compatible endpoint |
| `LLM_MODEL_REASONING`, `LLM_MODEL_FAST` | `grok-4.7`, `grok-build-0.1` | Model ids. These are guesses from the console display names: confirm with `?deep=true` |
| `LLM_TIMEOUT_SECONDS`, `LLM_MAX_OUTPUT_TOKENS` | `60`, `2000` | Call limits |
| `DEMO_CACHE` | `0` | Reserved for replaying cached responses in the demo |

## FalkorDB notes found while testing

Checked against a real FalkorDB module (v4.18 line). Use these forms:

- `algo.CDLP` is not available. Use `algo.WCC` or `algo.betweenness` for clusters and importance. `algo.pageRank('Service', 'DEPENDS_ON')` works.
- `shortestPath` must be directed and used in `RETURN` or `WITH`, not in `MATCH p = shortestPath(...)`:
  `MATCH (a {id:$a}), (b {id:$b}) WITH shortestPath((a)-[:DEPENDS_ON*..6]->(b)) AS p RETURN [n IN nodes(p) | n.id]`
- Working: `CREATE INDEX FOR (n:Label) ON (n.prop)`, full-text and vector indexes, `*0..2` ranges, `[:A|B]` relationship alternatives, unique constraints (they need the index first).
- Creating an index that exists raises an error. The schema code treats that as "already there".

## Not done yet

Auth, seed data, all feature endpoints, agent workflow, SSE, MCP. See the spec document for the plan.
