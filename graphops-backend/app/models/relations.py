"""Relationship types (spec section 4.2). Used for documentation and for validating writes later."""
from dataclasses import dataclass


@dataclass(frozen=True)
class RelSpec:
    type: str
    from_labels: tuple[str, ...]
    to_labels: tuple[str, ...]
    props: tuple[str, ...] = ()


REL_SPECS: list[RelSpec] = [
    RelSpec('DEPENDS_ON', ('Service',), ('Service', 'Dependency'), ('criticality',)),
    RelSpec('OWNS', ('Person', 'Team'), ('Service',), ('since',)),
    RelSpec('MEMBER_OF', ('Person',), ('Team',)),
    RelSpec('CHANGED', ('Deployment',), ('Service',)),
    RelSpec('BUMPED', ('Deployment',), ('Dependency',), ('from_version', 'to_version')),
    RelSpec('AFFECTED', ('Incident',), ('Service',)),
    RelSpec('HAS_SIGNATURE', ('Incident',), ('ErrorSignature',), ('match_score',)),
    RelSpec('RELATED_TO', ('Incident',), ('Incident',), ('via',)),
    RelSpec('RESOLVED_BY', ('Incident',), ('Fix',)),
    RelSpec('VERIFIED_BY', ('Fix',), ('Outcome',)),
    RelSpec('RESOLVED', ('Person',), ('Incident',)),
    RelSpec('DESCRIBES', ('Document',), ('Service',)),
    RelSpec('AUTHORED', ('Person',), ('Document',)),
    RelSpec('RECORDED_IN', ('Decision',), ('Document',)),
    RelSpec('DECIDED_BY', ('Decision',), ('Person',)),
    RelSpec('CONCERNS', ('Decision',), ('Service',)),
    RelSpec('SUPERSEDES', ('Decision',), ('Decision',)),
    RelSpec('RAN', ('Agent',), ('AgentRun',)),
    RelSpec('FOR_INCIDENT', ('AgentRun',), ('Incident',)),
    RelSpec('HAS_EVENT', ('AgentRun',), ('RunEvent',)),
    RelSpec('OBSERVED', ('AgentRun',), ('ErrorSignature',)),
    RelSpec('PRODUCED', ('AgentRun',), ('Finding', 'Outcome', 'Memory')),
    RelSpec('EVIDENCED_BY', ('Finding',), ('*',), ('path_json',)),
    RelSpec('ABOUT', ('Memory',), ('*',)),
    RelSpec('DERIVED_FROM', ('Memory',), ('AgentRun', 'Incident')),
    RelSpec('SUPPORTS_FIX', ('Memory',), ('Fix',)),
    RelSpec('PROPOSES', ('AgentRun',), ('Action',)),
    RelSpec('REQUIRES', ('Action',), ('Approval',)),
    RelSpec('FOR_FIX', ('Action',), ('Fix',)),
    # control graph
    RelSpec('MEMBER_OF_WORKSPACE', ('User',), ('Workspace',), ('role',)),
]
REL_TYPES: list[str] = [r.type for r in REL_SPECS]
