import asyncio
import json
import logging
from pathlib import Path

from app.db import falkor
from app.models.nodes import now_ms

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("seed")

async def seed_graph(workspace_id: str):
    # 1. Load the JSON data
    data_path = Path(__file__).parent / "data.json"
    with open(data_path, "r") as f:
        data = json.load(f)

    # 2. Connect to FalkorDB FIRST
    if not falkor.is_connected():
        log.info("Connecting to FalkorDB...")
        await falkor.connect()
        if not falkor.is_connected():
            log.error("Failed to connect to FalkorDB. Is Docker running?")
            return

    # 3. Now get the workspace graph
    g = falkor.workspace_graph(workspace_id)

    # 4. Insert Nodes
    log.info(f"Seeding {len(data['nodes'])} nodes...")
    for node in data["nodes"]:
        label = node["label"]
        props = node["properties"]
        
        # Ensure all nodes have timestamps
        props["created_at"] = props.get("created_at", now_ms())
        props["updated_at"] = props.get("updated_at", now_ms())
        
        # Use MERGE on id to prevent duplicates
        query = f"""
        MERGE (n:{label} {{id: $id}})
        SET n += $props
        """
        await g.query(query, {"id": props["id"], "props": props})

    # 5. Insert Edges
    log.info(f"Seeding {len(data['edges'])} edges...")
    for edge in data["edges"]:
        rel_type = edge["type"]
        source_id = edge["source"]
        target_id = edge["target"]
        props = edge.get("properties", {})
        
        # We match both nodes by id and create the relationship
        query = f"""
        MATCH (a {{id: $source_id}})
        MATCH (b {{id: $target_id}})
        MERGE (a)-[r:{rel_type}]->(b)
        SET r += $props
        """
        await g.query(query, {"source_id": source_id, "target_id": target_id, "props": props})

    log.info("✅ Seeding complete!")

if __name__ == "__main__":
    import sys
    workspace = sys.argv[1] if len(sys.argv) > 1 else "acme"
    asyncio.run(seed_graph(workspace))