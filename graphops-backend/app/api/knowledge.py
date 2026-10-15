"""Knowledge endpoints: Ask, source list, direct search.

The Ask pipeline:
1. Resolve the user's allowed visibilities from their Person node.
2. Extract keywords from the natural-language question (strip stop words
   so FalkorDB's fulltext tokenizer matches reliably).
3. Run Q16 (fulltext + graph expansion) filtered by visibility.
4. Run Q26 (count) to compute filtered_count = total - visible.
5. Call the LLM to compose a cited answer using only the visible documents.
6. Return answer + citations + gaps + filtered_count.

The LLM NEVER sees the content of hidden documents — filtered_count is
computed from a count-only query that returns no titles or bodies.
"""
from __future__ import annotations

import logging
import re

from fastapi import APIRouter, HTTPException, Query, status

from app.agents.llm import compose_answer
from app.api.deps import CurrentUser
from app.db import falkor
from app.graph.service import run_template
from app.models.knowledge import (
    AskRequest,
    AskResponse,
    Citation,
    DocumentAuthor,
    DocumentDecision,
    DocumentDetail,
    DocumentEntity,
    DocumentListItem,
    DocumentListResponse,
    SearchHit,
    SearchResponse,
)

log = logging.getLogger('graphops.api.knowledge')
router = APIRouter(prefix='/api/v1', tags=['knowledge'])


# ============================================================
# Keyword extraction
# ============================================================
# FalkorDB's fulltext index (RediSearch) tokenizes on whitespace and applies
# its own stop-word filtering — but "What is the payment SDK migration policy?"
# still has too many noise tokens. We strip them ourselves so the query string
# is dense with meaningful keywords.

_STOP_WORDS = frozenset({
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'does', 'for',
    'from', 'has', 'have', 'how', 'in', 'is', 'it', 'its', 'of', 'on', 'or',
    'that', 'the', 'this', 'to', 'was', 'were', 'what', 'when', 'where',
    'which', 'who', 'why', 'will', 'with', 'you', 'your', 'we', 'our',
    'can', 'could', 'should', 'would', 'i', 'me', 'my',
})

# Keep letters, digits, hyphens, and underscores. Drops punctuation like ?,.!
_TOKEN_RE = re.compile(r'[A-Za-z][A-Za-z0-9_-]*')


def _extract_keywords(question: str) -> str:
    """
    Strip stop words and punctuation from a natural-language question so
    FalkorDB's fulltext tokenizer matches more reliably.

    Examples:
      'What is the payment SDK migration policy?'  → 'payment sdk migration policy'
      'Who owns checkout-api?'                     → 'owns checkout-api'
    """
    tokens = _TOKEN_RE.findall(question.lower())
    meaningful = [t for t in tokens if t not in _STOP_WORDS and len(t) > 2]
    # If everything got filtered out (e.g., "is it a?"), fall back to raw text.
    return ' '.join(meaningful) if meaningful else question.strip()


# ============================================================
# Helpers
# ============================================================

def _ws(user: CurrentUser) -> str:
    return user.workspace_id


async def _allowed_visibilities(ws: str, user_id: str) -> list[str]:
    """
    Return the list of Document.visibility values the user may see.

    Every user can see 'workspace' documents. If they have a Person node
    with a team_id, they can also see 'team:<team_id>' documents.
    """
    allowed = ['workspace']
    g = falkor.workspace_graph(ws)
    res = await g.query(
        'MATCH (p:Person {id:$id}) RETURN p.team_id AS team_id LIMIT 1',
        {'id': user_id},
    )
    if res.result_set and res.result_set[0][0]:
        allowed.append(f'team:{res.result_set[0][0]}')
    return allowed


# ============================================================
# Ask
# ============================================================

@router.post('/ask', response_model=AskResponse)
async def ask(body: AskRequest, user: CurrentUser) -> AskResponse:
    """
    Natural-language question over the knowledge base.

    Every claim in the answer carries a [cN] citation. Items the user cannot
    see are counted in filtered_count but their content is never returned.
    """
    ws = _ws(user)
    allowed = await _allowed_visibilities(ws, user.user_id)

    # Extract keywords once and reuse across both queries.
    keywords = _extract_keywords(body.question)
    log.info(
        'ask: q=%r keywords=%r allowed=%s',
        body.question, keywords, allowed,
    )

    # 1) Retrieve visible documents via fulltext + graph expansion.
    visible = await run_template('Q16', {'text': keywords, 'allowed': allowed}, ws)

    # 2) Count total matching documents (ignores visibility) for filtered_count.
    total_res = await run_template('Q26', {'text': keywords}, ws)
    total = int(total_res[0]['total']) if total_res else 0

    filtered_count = max(0, total - len(visible))

    if not visible:
        # No visible docs — return a deterministic answer, skip the LLM.
        return AskResponse(
            answer='No matching documents were found that you have access to.',
            citations=[],
            gaps=['No documents matched the question'],
            filtered_count=filtered_count,
            retrieved_count=0,
        )

    # 3) Ask the LLM to compose the answer.
    # Signature: compose_answer(question: str, documents: list[dict]) -> dict
    result = await compose_answer(body.question, visible)
    answer = result.get('answer', '')
    gaps = list(result.get('gaps') or [])

    # 4) Build citations — only from the docs we actually retrieved.
    #    The order here matches the c1..cN labels the LLM sees, so [cN]
    #    markers in the answer map 1:1 back to real document IDs.
    citations: list[Citation] = []
    for i, d in enumerate(visible, start=1):
        citations.append(Citation(
            ref=f'c{i}',
            kind='document',
            id=d['id'],
            title=d.get('title'),
            updated_at=d.get('updated_at'),
            source_url=d.get('source_url') or d.get('url'),
        ))

    return AskResponse(
        answer=answer,
        citations=citations,
        gaps=gaps,
        filtered_count=filtered_count,
        retrieved_count=len(visible),
    )


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
    """List documents in the workspace, filtered by permission."""
    ws = _ws(user)
    allowed = await _allowed_visibilities(ws, user.user_id)

    rows = await run_template('Q23', {
        'status': status_filter,
        'type': type_filter,
        'allowed': allowed,
        'limit': limit,
    }, ws)

    docs = [
        DocumentListItem(
            id=r['id'],
            title=r['title'] or '',
            type=r['type'] or 'Runbook',
            source_url=r.get('url'),
            visibility=r['visibility'] or 'workspace',
            status=r['status'] or 'Synced',
            content_hash=r.get('content_hash'),
            updated_at=r.get('updated_at'),
            created_at=r.get('created_at'),
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
        id=first['id'],
        title=first['title'] or '',
        type=first['type'] or 'Runbook',
        body=first['body'] or '',
        source_url=first.get('url'),
        visibility=first['visibility'] or 'workspace',
        status=first['status'] or 'Synced',
        content_hash=first.get('content_hash'),
        updated_at=first.get('updated_at'),
        created_at=first.get('created_at'),
        services=list(services.values()),
        authors=list(authors.values()),
        decisions=list(decisions.values()),
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
    """Fulltext search over documents. Permission-aware. No LLM call."""
    ws = _ws(user)
    allowed = await _allowed_visibilities(ws, user.user_id)

    # Same keyword extraction as the Ask path — natural-language queries work.
    keywords = _extract_keywords(q)
    log.info('search: q=%r keywords=%r', q, keywords)

    rows = await run_template('Q16', {'text': keywords, 'allowed': allowed}, ws)
    total_res = await run_template('Q26', {'text': keywords}, ws)
    total = int(total_res[0]['total']) if total_res else 0

    hits = [
        SearchHit(
            id=r['id'],
            title=r['title'] or '',
            type=r.get('type') or 'Runbook',
            source_url=r.get('url'),
            updated_at=r.get('updated_at'),
            status=r.get('status') or 'Synced',
            score=float(r.get('score') or 0.0),
            services=[s for s in (r.get('services') or []) if s],
            owners=[o for o in (r.get('owners') or []) if o],
        )
        for r in rows[:limit]
    ]

    return SearchResponse(
        query=q,
        hits=hits,
        count=len(hits),
        filtered_count=max(0, total - len(rows)),
    )