"""Prompt building + schema validation for LLM steps.

Two LLM entry points:
- hypothesize(): step 6 of the workflow. Turns retrieved facts into ranked
  hypotheses and a recommended fix. Every cited ID is validated against the
  input; hallucinated IDs are dropped, never persisted.
- compose_answer(): the /ask endpoint. Turns retrieved documents into a
  cited answer. Gaps are surfaced explicitly; the LLM never invents facts.

Design rules:
1. IDs are always validated — the LLM cannot cite what it wasn't given.
2. Confidence on unverified hypotheses is capped at 0.95.
3. Missing evidence is reported, never fabricated.
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


COMPOSE_SYSTEM = """You are a knowledge assistant for a software engineering team.
Answer the user's question using ONLY the documents provided below.

HARD RULES:
1. Every factual claim MUST include a citation marker like [c1], [c2].
2. Only cite refs that appear in the input. Never invent refs like [c9].
3. If the question cannot be fully answered, list what's missing in `gaps`.
4. When a service, person, or document is named, use the real name.
5. Keep the answer to 2-4 sentences. Be specific, not vague.
6. Output JSON only. No prose, no markdown, no code fences.

OUTPUT SCHEMA (exact):
{
  "answer": "…with [c1], [c2] markers…",
  "gaps": ["…e.g. 'No decision record found for the retry policy'…"]
}"""


# ============================================================
# Hypothesize (workflow step 6)
# ============================================================

def _allowed_ids(
    findings: list[dict],
    memories: list[dict],
    deployments: list[dict],
) -> set[str]:
    """Collect every ID the LLM is allowed to cite for this step."""
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
    """Serialize the graph facts the LLM is allowed to reason over."""
    return json.dumps(
        {
            'incident': incident,
            'findings': findings,
            'memories': memories,
            'recent_deployments': deployments,
            'evidence_path': evidence_path,
        },
        indent=2,
        default=str,  # tolerate non-JSON-native types (FalkorDB scalars)
    )


def _sanitize_hypothesis(h: dict, allowed: set[str]) -> dict | None:
    """Validate and clean a single hypothesis. Returns None to drop it."""
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
) -> dict:
    """Call Grok, validate output, drop invalid citations, cap confidence."""
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

    raw = getattr(resp, 'output_text', None) or ''
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        log.warning('Hypothesis JSON invalid; returning empty')
        return {'hypotheses': [], 'recommended_fix_id': None}

    clean: list[dict] = []
    for h in data.get('hypotheses', []):
        if not isinstance(h, dict):
            continue
        sanitized = _sanitize_hypothesis(h, allowed)
        if sanitized is not None:
            clean.append(sanitized)

    # Validate the recommended fix — never accept a hallucinated ID.
    fix_id = data.get('recommended_fix_id')
    if fix_id and fix_id not in allowed:
        log.warning('Rejecting hallucinated recommended_fix_id: %s', fix_id)
        fix_id = None

    return {'hypotheses': clean, 'recommended_fix_id': fix_id}


# ============================================================
# Compose answer (the /ask endpoint, Track 03)
# ============================================================

def _label_documents(documents: list[dict]) -> list[dict]:
    """
    Assign citation refs (c1, c2, ...) to each document.

    The refs must match the order the backend uses to build the citations
    array in the response, so the LLM's [cN] markers map 1:1 to real IDs.
    """
    labeled = []
    for i, d in enumerate(documents, start=1):
        labeled.append({
            'ref': f'c{i}',
            'id': d.get('id'),
            'title': d.get('title'),
            'type': d.get('type'),
            # Truncate body — the LLM only needs enough context, not the full doc.
            'body': (d.get('body') or '')[:1500],
            'services': d.get('services') or [],
            'service_names': d.get('service_names') or [],
            'owners': d.get('owners') or [],
            'source_url': d.get('source_url'),
        })
    return labeled


async def compose_answer(question: str, documents: list[dict]) -> dict:
    """
    Compose a cited answer from retrieved documents.

    Returns a dict: {"answer": "...", "gaps": ["..."]}.

    Empty input short-circuits and never calls the LLM — saves tokens and
    gives a deterministic response when nothing matches.
    """
    if not documents:
        return {
            'answer': 'No documents matched your question.',
            'gaps': ['No matching documents in the knowledge base'],
        }

    labeled = _label_documents(documents)
    ctx = json.dumps(
        {'question': question, 'documents': labeled},
        indent=2,
        default=str,
    )

    resp = await llm_client.chat(
        messages=[
            {'role': 'system', 'content': COMPOSE_SYSTEM},
            {'role': 'user', 'content': ctx},
        ],
        tier='reasoning',
        response_format={'type': 'json_object'},
    )

    raw = getattr(resp, 'output_text', None) or ''
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        log.warning('compose_answer returned invalid JSON')
        return {
            'answer': 'Unable to compose answer from the retrieved documents.',
            'gaps': ['LLM returned invalid JSON'],
        }

    answer = str(data.get('answer', '')).strip()[:2000]
    if not answer:
        answer = 'Unable to compose answer.'

    gaps = [str(g).strip()[:200] for g in (data.get('gaps') or []) if str(g).strip()]

    return {'answer': answer, 'gaps': gaps}