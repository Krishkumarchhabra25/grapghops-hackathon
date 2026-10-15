"""Create indexes and constraints. Safe to run any number of times.

  python -m scripts.init_schema                 # control graph + default workspace
  python -m scripts.init_schema --workspace beta
"""
import argparse
import asyncio
import json

from app.config import get_settings
from app.db import falkor
from app.graph.schema import ensure_control_schema, ensure_workspace_schema


async def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--workspace', default=get_settings().default_workspace_id)
    args = p.parse_args()
    await falkor.connect()
    try:
        reports = [await ensure_control_schema(), await ensure_workspace_schema(args.workspace)]
        print(json.dumps([r.as_dict() for r in reports], indent=2))
    finally:
        await falkor.close()


if __name__ == '__main__':
    asyncio.run(main())
