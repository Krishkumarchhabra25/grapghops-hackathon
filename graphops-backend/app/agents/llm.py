"""Prompt building + schema validation for LLM steps.

Three LLM entry points:
- rewrite_query(): pre-processes user questions to fix typos and extract entities.
- hypothesize(): step 6 of the workflow. Turns retrieved facts into ranked hypotheses.
- compose_answer(): the /ask endpoint. Turns retrieved documents AND graph facts
  into a cited answer.

Design rules:
1. IDs are always validated — the LLM cannot cite what it wasn't given.
2. Confidence on unverified hypotheses is capped at 0.95.
3. Missing evidence is reported only if BOTH documents and graph facts fail.
4. JSON only — no prose, no markdown, no code fences.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.llm import client as llm_client

log = logging.getLogger('graphops.llm')


# ============================================================
# Prompts
# ============================================================

HYPOTHESIZE_SYSTEM = """You are a senior SRE. You receive structured facts from a knowledge graph.
Return a ranked list of hypotheses and a recommended fix.

HARD RULES:
1. Only cite IDs that appear in the user message. Any ID not present is invalid.
2. Confidence is 0..1, capped at 0.95 for unverified hypotheses.
3. If evidence is missing, list it in `missing_evidence` — never invent facts.
4. If a historical fix appears with times_worked >= 1, prefer it as the
   `recommended_fix_id`. Higher times_worked wins.
5. Output JSON only. No prose, no markdown, no code fences.

OUTPUT SCHEMA (exact):
{
  "hypotheses": [
    {
      "claim": "string",
      "confidence": 0.0,
      "supporting_finding_ids": ["find-..."],
      "supporting_memory_ids": ["mem-..."],
      "missing_evidence": ["string"]
    }
  ],
  "recommended_fix_id": "fix-... or null"
}"""

COMPOSE_SYSTEM = """You are a senior AI knowledge assistant for a software engineering platform.
You answer the user's question strictly based on the provided `documents` (textual docs) and `graph_facts` (structured data extracted directly from a knowledge graph).

HARD RULES:
1. Every factual claim MUST include a citation marker like [c1], [c2].
2. Only cite the exact refs provided in the input. Never invent refs like [c9].
3. Treat `graph_facts` as first-class evidence. If the graph facts answer the question, cite them directly.
4. DO NOT report missing documents in `gaps` if the answer can be fully derived from `graph_facts`.
5. Only report `gaps` if BOTH `documents` and `graph_facts` completely fail to answer the user's question.
6. If the user asks for sensitive data (passwords, API keys, PII) and the context does not have it, politely refuse in the `answer` field and do NOT list it as a gap.
7. Be direct, specific, and concise (2-4 sentences).
8. Output JSON only. No prose, no markdown, no code fences.

OUTPUT SCHEMA (exact):
{
  "answer": "…with [c1], [c2] markers…",
  "gaps": ["…only if completely missing evidence…"]
}"""

REWRITE_SYSTEM = """You are an AI assistant helping to route a user's question to a knowledge graph.
Given a raw user question, do two things:
1. Fix any spelling mistakes and rewrite the question to be grammatically correct (e.g., "payemnt" -> "payment").
2. Extract any specific Entities mentioned. Entities are usually Services (e.g., checkout-api, payment-gateway), People (e.g., Krish, Ananya), or Teams (e.g., Payments).

OUTPUT JSON ONLY:
{
  "rewritten_query": "string",
  "entities": ["string"]
}"""


# ============================================================
# Query Rewriting (Advanced RAG Step 1)
# ============================================================

async def rewrite_query(question: str) -> dict:
    """Use the fast model to clean the query and extract entities."""
    try:
        resp = await llm_client.chat(
            messages=[
                {'role': 'system', 'content': REWRITE_SYSTEM},
                {'role': 'user', 'content': question},
            ],
            tier='fast',
            response_format={'type': 'json_object'},
        )
        raw = getattr(resp, 'output_text', None) or ''
        data = json.loads(raw)
        return {
            'rewritten_query': data.get('rewritten_query', question),
            'entities': data.get('entities', [])
        }
    except Exception as e:
        log.warning('Query rewrite failed: %s', e)
        return {'rewritten_query': question, 'entities': []}


# ============================================================
# Hypothesize (workflow step 6)
# ============================================================

def _allowed_ids(
    findings: list[dict],
    memories: list[dict],
    deployments: list[dict],
) -> set[str]:
    ids: set[str] = set()
    for f in findings:
        if f.get('id'):
            ids.add(f['id'])
        ids.update(f.get('evidence_refs') or [])
    for m in memories:
        if m.get('id'):
            ids.add(m['id'])
        ids.update(m.get('fixes') or [])
    for d in deployments:
        if d.get('deployment'):
            ids.add(d['deployment'])
        if d.get('touched'):
            ids.add(d['touched'])
    return ids


def _build_hypothesis_context(
    incident: dict,
    findings: list[dict],
    memories: list[dict],
    deployments: list[dict],
    evidence_path: dict | None,
) -> str:
    return json.dumps(
        {
            'incident': incident,
            'findings': findings,
            'memories': memories,
            'recent_deployments': deployments,
            'evidence_path': evidence_path,
        },
        indent=2,
        default=str,
    )


def _sanitize_hypothesis(h: dict, allowed: set[str]) -> dict | None:
    cited = set(h.get('supporting_finding_ids') or []) | set(h.get('supporting_memory_ids') or [])
    invalid = cited - allowed
    if invalid:
        log.warning('Dropping hypothesis with invalid citations: %s', invalid)
        return None

    try:
        conf = float(h.get('confidence', 0.0))
    except (TypeError, ValueError):
        conf = 0.0
    conf = max(0.0, min(0.95, conf))

    claim = str(h.get('claim', '')).strip()[:500]
    if not claim:
        return None

    return {
        'claim': claim,
        'confidence': conf,
        'supporting_finding_ids': list(h.get('supporting_finding_ids') or []),
        'supporting_memory_ids': list(h.get('supporting_memory_ids') or []),
        'missing_evidence': [str(x)[:200] for x in (h.get('missing_evidence') or [])],
    }


async def hypothesize(
    incident: dict,
    findings: list[dict],
    memories: list[dict],
    deployments: list[dict],
    evidence_path: dict | None,
) -> tuple[dict, dict]:
    allowed = _allowed_ids(findings, memories, deployments)
    user_msg = _build_hypothesis_context(
        incident, findings, memories, deployments, evidence_path
    )

    resp = await llm_client.chat(
        messages=[
            {'role': 'system', 'content': HYPOTHESIZE_SYSTEM},
            {'role': 'user', 'content': user_msg},
        ],
        tier='reasoning',
        response_format={'type': 'json_object'},
    )

    usage_data = {
        'input_tokens': getattr(resp.usage, 'input_tokens', getattr(resp.usage, 'prompt_tokens', 0)) if hasattr(resp, 'usage') else 0,
        'output_tokens': getattr(resp.usage, 'output_tokens', getattr(resp.usage, 'completion_tokens', 0)) if hasattr(resp, 'usage') else 0,
    }

    raw = getattr(resp, 'output_text', None) or ''
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        log.warning('Hypothesis JSON invalid; returning empty')
        return {'hypotheses': [], 'recommended_fix_id': None}, usage_data

    clean: list[dict] = []
    for h in data.get('hypotheses', []):
        if not isinstance(h, dict):
            continue
        sanitized = _sanitize_hypothesis(h, allowed)
        if sanitized is not None:
            clean.append(sanitized)

    fix_id = data.get('recommended_fix_id')
    if fix_id and fix_id not in allowed:
        log.warning('Rejecting hallucinated recommended_fix_id: %s', fix_id)
        fix_id = None

    return {'hypotheses': clean, 'recommended_fix_id': fix_id}, usage_data


# ============================================================
# Compose answer (Advanced RAG Step 3)
# ============================================================

def _label_documents(documents: list[dict]) -> list[dict]:
    labeled = []
    for i, d in enumerate(documents, start=1):
        labeled.append({
            'ref': f'c{i}',
            'id': d.get('id'),
            'title': d.get('title'),
            'type': d.get('type'),
            'body': (d.get('body') or '')[:1500],
            'services': d.get('services') or [],
            'service_names': d.get('service_names') or [],
            'owners': d.get('owners') or [],
            'source_url': d.get('source_url'),
        })
    return labeled


async def compose_answer(question: str, documents: list[dict], graph_facts: list[dict]) -> dict:
    if not documents and not graph_facts:
        # Check if the user is asking for sensitive data to give a polite refusal
        is_sensitive = any(w in question.lower() for w in ['password', 'secret', 'api key', 'token', 'credential'])
        
        if is_sensitive:
            return {
                'answer': 'I cannot provide passwords, secrets, or API keys. For security reasons, please contact your IT or Security team.',
                'gaps': [],
            }
            
        return {
            'answer': "I couldn't find any runbooks, architecture docs, or graph facts related to your question. Try asking about a specific service (e.g., 'checkout-api') or a past incident.",
            'gaps': [],
        }

    labeled_docs = _label_documents(documents)
    
    ctx = json.dumps(
        {
            'question': question,
            'documents': labeled_docs,
            'graph_facts': graph_facts
        },
        indent=2,
        default=str,
    )

    resp = await llm_client.chat(
        messages=[
            {'role': 'system', 'content': COMPOSE_SYSTEM},
            {'role': 'user', 'content': ctx},
        ],
        tier='fast',
        response_format={'type': 'json_object'},
    )

    raw = getattr(resp, 'output_text', None) or ''
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        log.warning('compose_answer returned invalid JSON')
        return {
            'answer': 'Unable to compose answer from the retrieved context.',
            'gaps': ['LLM returned invalid JSON'],
        }

    answer = str(data.get('answer', '')).strip()[:2000]
    if not answer:
        answer = 'Unable to compose answer.'

    gaps = [str(g).strip()[:200] for g in (data.get('gaps') or []) if str(g).strip()]
    return {'answer': answer, 'gaps': gaps}