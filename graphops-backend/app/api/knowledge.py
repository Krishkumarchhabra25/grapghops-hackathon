"""Knowledge endpoints: Advanced GraphRAG Ask, source list, direct search."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from app.agents.llm import compose_answer, rewrite_query
from app.api.deps import CurrentUser
from app.db import falkor
from app.graph.service import run_template
from app.models.knowledge import (
    AskRequest, AskResponse, Citation, DocumentAuthor, DocumentDecision,
    DocumentDetail, DocumentEntity, DocumentListItem, DocumentListResponse,
    SearchHit, SearchResponse,
)

log = logging.getLogger('graphops.api.knowledge')
router = APIRouter(prefix='/api/v1', tags=['knowledge'])

# In-Memory Cache for Ask queries (saves API cost & time on duplicate questions)
_ASK_CACHE: dict[str, AskResponse] = {}


def _ws(user: CurrentUser) -> str:
    return user.workspace_id


async def _allowed_visibilities(ws: str, user_id: str) -> list[str]:
    allowed = ['workspace']
    g = falkor.workspace_graph(ws)
    res = await g.query(
        'MATCH (p:Person {id:$id}) RETURN p.team_id AS team_id LIMIT 1',
        {'id': user_id},
    )
    if res.result_set and res.result_set[0][0]:
        allowed.append(f'team:{res.result_set[0][0]}')
    return allowed


async def _get_advanced_graph_context(ws: str, entities: list[str], start_ref: int) -> list[dict]:
    """
    Given a list of extracted entity names (from the LLM rewriter),
    find the exact nodes in FalkorDB and pull their 1-hop context.
    """
    g = falkor.workspace_graph(ws)
    facts = []
    current_ref = start_ref

    for entity in entities:
        # 1. Resolve the entity name to a Node ID using case-insensitive matching
        query = """
        MATCH (n) 
        WHERE (n:Service OR n:Person OR n:Team OR n:Dependency)
          AND toLower(n.name) = toLower($name)
        RETURN n.id AS id, labels(n)[0] AS type, n.name AS name
        LIMIT 1
        """
        res = await g.query(query, {'name': entity})
        if not res.result_set:
            continue
            
        node_id = res.result_set[0][0]
        node_type = res.result_set[0][1]
        node_name = res.result_set[0][2]

        # 2. Pull Graph Facts based on Node Type
        if node_type == 'Service':
            # Owners
            q06 = await run_template('Q06', {'service_id': node_id}, ws)
            if q06:
                row = q06[0]
                owners = ", ".join(row.get('owners') or []) or 'unknown'
                teams = ", ".join(row.get('teams') or [])
                facts.append({
                    'ref': f'c{current_ref}',
                    'fact': f"Service {node_name} is owned by {owners}. Teams: {teams}.",
                    'id': node_id,
                    'title': f"Graph: {node_name} ownership"
                })
                current_ref += 1

            # Blast Radius (Who depends on it)
            q01 = await run_template('Q01', {'service_id': node_id, 'depth': 1}, ws)
            if q01:
                inbound = ", ".join([r['service'] for r in q01])
                if inbound:
                    facts.append({
                        'ref': f'c{current_ref}',
                        'fact': f"Services that depend on {node_name}: {inbound}.",
                        'id': node_id,
                        'title': f"Graph: {node_name} blast radius"
                    })
                    current_ref += 1

            # Dependencies (What it depends on)
            q36 = await run_template('Q36', {'id': node_id}, ws)
            if q36:
                outbound = ", ".join([r['name'] for r in q36])
                if outbound:
                    facts.append({
                        'ref': f'c{current_ref}',
                        'fact': f"{node_name} depends on: {outbound}.",
                        'id': node_id,
                        'title': f"Graph: {node_name} dependencies"
                    })
                    current_ref += 1

        elif node_type == 'Person':
            # What they own
            res_owns = await g.query('MATCH (p:Person {id:$id})-[:OWNS]->(s:Service) RETURN s.name AS name', {'id': node_id})
            if res_owns.result_set:
                svcs = ", ".join([r[0] for r in res_owns.result_set if r[0]])
                facts.append({
                    'ref': f'c{current_ref}',
                    'fact': f"{node_name} owns the following services: {svcs}.",
                    'id': node_id,
                    'title': f"Graph: {node_name} ownership"
                })
                current_ref += 1

    return facts


@router.post('/ask', response_model=AskResponse)
async def ask(body: AskRequest, user: CurrentUser) -> AskResponse:
    ws = _ws(user)
    
    # 1. Cache Check
    cache_key = f"{ws}:{user.user_id}:{body.question.lower().strip()}"
    if cache_key in _ASK_CACHE:
        log.info('Cache hit for: %s', body.question)
        return _ASK_CACHE[cache_key]

    allowed = await _allowed_visibilities(ws, user.user_id)

    # 2. ADVANCED RAG: Query Rewriting & Entity Extraction
    rewrite_res = await rewrite_query(body.question)
    rewritten_q = rewrite_res['rewritten_query']
    entities = rewrite_res['entities']
    log.info('Ask rewritten: q=%r -> %r, entities=%s', body.question, rewritten_q, entities)

    # 3. Document Retrieval (Full-text search)
    visible = await run_template('Q16', {'text': rewritten_q, 'allowed': allowed}, ws)
    
    total_res = await run_template('Q26', {'text': rewritten_q}, ws)
    total = int(total_res[0]['total']) if total_res else 0
    filtered_count = max(0, total - len(visible))

    # 4. Graph Fact Retrieval (Dynamic entity resolution)
    graph_facts = await _get_advanced_graph_context(ws, entities, start_ref=len(visible) + 1)

    # 5. Context Synthesis (LLM)
    # REMOVED the hardcoded early return here.
    # We now pass empty lists to compose_answer, which will trigger
    # the polite fallback / sensitive data refusal logic in llm.py.
    result = await compose_answer(rewritten_q, visible, graph_facts)
    answer = result.get('answer', '')
    gaps = list(result.get('gaps') or [])

    # 6. Build Citations
    citations: list[Citation] = []
    for i, d in enumerate(visible, start=1):
        citations.append(Citation(
            ref=f'c{i}', kind='document', id=d['id'], title=d.get('title'),
            updated_at=d.get('updated_at'), source_url=d.get('source_url') or d.get('url'),
        ))
    for gf in graph_facts:
        citations.append(Citation(
            ref=gf['ref'], kind='graph', id=gf['id'], title=gf['title'], query_id='graph_facts'
        ))

    response = AskResponse(
        answer=answer,
        citations=citations,
        gaps=gaps,
        filtered_count=filtered_count,
        retrieved_count=len(visible) + len(graph_facts),
    )

    # 7. Save to Cache
    _ASK_CACHE[cache_key] = response
    return response


# ============================================================
# Sources (list)
# ============================================================

@router.get('/knowledge/sources', response_model=DocumentListResponse)
async def list_sources(
    user: CurrentUser,
    status_filter: str | None = Query(None, alias='status'),
    type_filter: str | None = Query(None, alias='type'),
    limit: int = Query(50, ge=1, le=200),
) -> DocumentListResponse:
    ws = _ws(user)
    allowed = await _allowed_visibilities(ws, user.user_id)

    rows = await run_template('Q23', {
        'status': status_filter, 'type': type_filter, 'allowed': allowed, 'limit': limit,
    }, ws)

    docs = [
        DocumentListItem(
            id=r['id'], title=r['title'] or '', type=r['type'] or 'Runbook',
            source_url=r.get('url'), visibility=r['visibility'] or 'workspace',
            status=r['status'] or 'Synced', content_hash=r.get('content_hash'),
            updated_at=r.get('updated_at'), created_at=r.get('created_at'),
        )
        for r in rows
    ]
    return DocumentListResponse(documents=docs, count=len(docs))


# ============================================================
# Document detail
# ============================================================

@router.get('/knowledge/sources/{doc_id}', response_model=DocumentDetail)
async def get_document(doc_id: str, user: CurrentUser) -> DocumentDetail:
    ws = _ws(user)
    allowed = await _allowed_visibilities(ws, user.user_id)

    rows = await run_template('Q24', {'id': doc_id, 'allowed': allowed}, ws)
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Document not found')

    first = rows[0]
    services: dict[str, DocumentEntity] = {}
    authors: dict[str, DocumentAuthor] = {}
    decisions: dict[str, DocumentDecision] = {}

    for r in rows:
        sid = r.get('service_id')
        if sid and sid not in services:
            services[sid] = DocumentEntity(id=sid, name=r.get('service_name') or sid)
        aid = r.get('author_id')
        if aid and aid not in authors:
            authors[aid] = DocumentAuthor(id=aid, name=r.get('author_name') or aid)
        did = r.get('decision_id')
        if did and did not in decisions:
            decisions[did] = DocumentDecision(id=did, title=r.get('decision_title') or did)

    return DocumentDetail(
        id=first['id'], title=first['title'] or '', type=first['type'] or 'Runbook',
        body=first['body'] or '', source_url=first.get('url'), visibility=first['visibility'] or 'workspace',
        status=first['status'] or 'Synced', content_hash=first.get('content_hash'),
        updated_at=first.get('updated_at'), created_at=first.get('created_at'),
        services=list(services.values()), authors=list(authors.values()), decisions=list(decisions.values()),
    )


# ============================================================
# Direct search (no LLM)
# ============================================================

@router.get('/knowledge/search', response_model=SearchResponse)
async def search(
    user: CurrentUser,
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(8, ge=1, le=50),
) -> SearchResponse:
    ws = _ws(user)
    allowed = await _allowed_visibilities(ws, user.user_id)

    # We use the LLM rewrite here too for better search results
    rewrite_res = await rewrite_query(q)
    keywords = rewrite_res['rewritten_query']
    log.info('search: q=%r rewritten=%r', q, keywords)

    rows = await run_template('Q16', {'text': keywords, 'allowed': allowed}, ws)
    total_res = await run_template('Q26', {'text': keywords}, ws)
    total = int(total_res[0]['total']) if total_res else 0

    hits = [
        SearchHit(
            id=r['id'], title=r['title'] or '', type=r.get('type') or 'Runbook',
            source_url=r.get('url'), updated_at=r.get('updated_at'), status=r.get('status') or 'Synced',
            score=float(r.get('score') or 0.0),
            services=[s for s in (r.get('services') or []) if s],
            owners=[o for o in (r.get('owners') or []) if o],
        )
        for r in rows[:limit]
    ]

    return SearchResponse(query=q, hits=hits, count=len(hits), filtered_count=max(0, total - len(rows)))