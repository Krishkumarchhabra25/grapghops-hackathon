"""Seed the control graph with a workspace and demo users.

Idempotent: rerunning updates passwords and memberships in place.

    python -m app.scripts.seed_auth
"""
from __future__ import annotations

import asyncio
import logging

from app.auth.passwords import hash_password
from app.db import falkor
from app.models.nodes import now_ms

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
log = logging.getLogger('seed.auth')


# (user_id, name, email, plaintext_password, role)
USERS = [
    ('usr-1', 'Krish Chhabra',  'krish@graphops.dev',   'graphops-demo', 'Owner'),
    ('usr-2', 'Ananya Rao',     'ananya@graphops.dev',  'graphops-demo', 'Engineer'),
    ('usr-3', 'Vikram Singh',   'vikram@graphops.dev',  'graphops-demo', 'Engineer'),
    ('usr-4', 'Neha Gupta',     'neha@graphops.dev',    'graphops-demo', 'Viewer'),
    ('usr-5', 'Rahul Sharma',   'rahul@graphops.dev',   'graphops-demo', 'Engineer'),
    ('usr-6', 'Priya Patel',    'priya@graphops.dev',   'graphops-demo', 'Admin'),
]

WORKSPACES = [
    ('acme', 'Acme', 'ws_acme'),
]


async def main() -> None:
    await falkor.connect()
    if not falkor.is_connected():
        log.error('FalkorDB not reachable — is Docker running?')
        return

    g = falkor.control_graph()
    now = now_ms()

    # 1) Workspaces
    for ws_id, ws_name, graph_name in WORKSPACES:
        await g.query(
            """
            MERGE (w:Workspace {id:$id})
            SET w.name = $name, w.graph_name = $graph_name,
                w.created_at = coalesce(w.created_at, $now),
                w.updated_at = $now
            """,
            {'id': ws_id, 'name': ws_name, 'graph_name': graph_name, 'now': now},
        )
        log.info('workspace ensured: %s', ws_id)

    # 2) Users + memberships
    for uid, name, email, plain, role in USERS:
        pwd_hash = hash_password(plain)
        await g.query(
            """
            MERGE (u:User {id:$id})
            SET u.name = $name, u.email = $email, u.password_hash = $pwd,
                u.role = $role,
                u.created_at = coalesce(u.created_at, $now),
                u.updated_at = $now
            WITH u
            MATCH (w:Workspace {id:$ws})
            MERGE (u)-[m:MEMBER_OF_WORKSPACE]->(w)
            SET m.role = $role
            """,
            {
                'id': uid, 'name': name, 'email': email.lower(),
                'pwd': pwd_hash, 'role': role, 'ws': 'acme', 'now': now,
            },
        )
        log.info('user ensured: %s (%s) role=%s', uid, email, role)

    log.info('✅ control graph seeded')
    await falkor.close()


if __name__ == '__main__':
    asyncio.run(main())