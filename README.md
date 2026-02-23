# CozoDB Memory MCP Server

Persistent, local-first memory for AI agents. No cloud, no Docker, no external services – just CozoDB embedded in Node.js.

A local, single-user memory system based on CozoDB with MCP (Model Context Protocol) integration. Focus: robust storage, fast hybrid search (Vector/Graph/Keyword), time-travel queries, and maintainable consolidation.

## Quick Start

```bash
git clone https://github.com/tobs-code/cozo-memory
cd cozo-memory
npm install && npm run build
npm run start
```

Now you can add the server to your MCP client (e.g. Claude Desktop).

## Overview

This repository contains:
- An MCP server (stdio) for Claude/other MCP clients.
- An optional HTTP API bridge server for UI/tools.

Key Features:
- **Hybrid Search (v0.7 Optimized)**: Combination of semantic search (HNSW), **Full-Text Search (FTS)**, and graph signals, merged via Reciprocal Rank Fusion (RRF).
- **Full-Text Search (FTS)**: Native CozoDB v0.7 FTS indices with stemming, stopword filtering, and robust query sanitizing (cleaning of `+ - * / \ ( ) ? .`) for maximum stability.
- **Near-Duplicate Detection (LSH)**: Automatically detects very similar observations via MinHash-LSH (CozoDB v0.7) to avoid redundancy.
- **Recency Bias**: Older content is dampened in fusion (except for explicit keyword searches), so "currently relevant" appears higher more often.
- **Graph-RAG & Graph-Walking (v1.7 Optimized)**: Advanced retrieval method combining semantic vector seeds with recursive graph traversals. Now uses an optimized **Graph-Walking** algorithm via Datalog, using HNSW index lookups for precise distance calculations during traversal.
- **Multi-Vector Support (v1.7)**: Each entity now has two specialized vectors:
  1. **Content-Embedding**: Represents the content context (observations).
  2. **Name-Embedding**: Optimized for identification via name/label.
  This significantly improves accuracy when entering graph walks.
- **Semantic & Persistent Caching (v0.8.5)**: Two-level caching system:
  1. **L1 Memory Cache**: Ultra-fast in-memory LRU cache (< 0.1ms).
  2. **L2 Persistent Cache**: Storage in CozoDB for restart resistance.
  3. **Semantic Matching**: Detects semantically similar queries via vector distance.
  4. **Janitor TTL**: Automatic cleanup of outdated cache entries by the Janitor service.
- **Time-Travel**: Changes are versioned via CozoDB `Validity`; historical queries are possible.
- **JSON Merge Operator (++)**: Uses the v0.7 merge operator for efficient, atomic metadata updates.
- **Multi-Statement Transactions (v1.2)**: Supports atomic transactions across multiple operations using CozoDB block syntax `{ ... }`. Guarantees that related changes (e.g., create entity + add observation + link relationship) are executed fully or not at all.
- **Graph Metrics & Ranking Boost (v1.3 / v1.6)**: Integrates advanced graph algorithms:
  - **PageRank**: Calculates the "importance" of knowledge nodes for ranking.
  - **Betweenness Centrality**: Identifies central bridge elements in the knowledge network.
  - **HITS (Hubs & Authorities)**: Distinguishes between information sources (Authorities) and pointers (Hubs).
  - **Connected Components**: Detects isolated knowledge islands and subgraphs.
  - These metrics are automatically used in hybrid search (`advancedSearch`) and `graphRag`.
- **Native CozoDB Operators (v1.5)**: Now uses explicit `:insert`, `:update`, and `:delete` operators instead of generic `:put` (upsert) calls. Increases data safety through strict validation of database states (e.g., error when trying to "insert" an existing entity).
- **Advanced Time-Travel Analysis (v1.5)**: Extension of relationship history with time range filters (`since`/`until`) and automatic diff summaries to analyze changes (additions/removals) over specific periods.
- **Graph Features (v1.6)**: Native integration of Shortest Path (Dijkstra) with path reconstruction, Community Detection (LabelPropagation), and advanced centrality measures.
- **Graph Evolution**: Tracks the temporal development of relationships (e.g., role change from "Manager" to "Consultant") via CozoDB `Validity` queries.
- **Bridge Discovery**: Identifies "bridge entities" connecting different communities – ideal for creative brainstorming.
- **Inference**: Implicit suggestions and context extension (e.g., transitive expertise rule).
- **Conflict Detection (Application-Level & Triggers)**: Automatically detects contradictions in metadata (e.g., "active" vs. "discontinued" / `archived: true`). Uses robust logic in the app layer to ensure data integrity before writing.
- **Data Integrity (Trigger Concept)**: Prevents invalid states like self-references in relationships (Self-Loops) directly at creation.
- **Hierarchical Summarization**: The Janitor condenses old fragments into "Executive Summary" nodes to preserve the "Big Picture" long-term.
- **User Preference Profiling**: A specialized `global_user_profile` entity stores persistent preferences (likes, work style), which receive a **50% score boost** in every search.
- **All Local**: Embeddings via Transformers/ONNX; no external embedding service required.

## Positioning & Comparison

Most "Memory" MCP servers fall into two categories:
1.  **Simple Knowledge Graphs**: CRUD operations on triples, often only text search.
2.  **Pure Vector Stores**: Semantic search (RAG), but little understanding of complex relationships.

This server fills the gap in between ("Sweet Spot"): A **local, database-backed memory engine** combining vector, graph, and keyword signals.

### Comparison with other solutions

| Feature | **CozoDB Memory (This Project)** | **Official Reference (`@modelcontextprotocol/server-memory`)** | **mcp-memory-service (Community)** | **Database Adapters (Qdrant/Neo4j)** |
| :--- | :--- | :--- | :--- | :--- |
| **Backend** | **CozoDB** (Graph + Vector + Relational) | JSON file (`memory.jsonl`) | SQLite / Cloudflare | Specialized DB (only Vector or Graph) |
| **Search Logic** | **Hybrid (RRF)**: Vector + Keyword + Graph | Keyword only / Exact Graph Match | Vector + Keyword | Mostly only one dimension |
| **Inference** | **Yes**: Built-in engine for implicit knowledge | No | No ("Dreaming" is consolidation) | No (Retrieval only) |
| **Time-Travel** | **Yes**: Queries at any point in time (`Validity`) | No (current state only) | History available, no native DB feature | No |
| **Maintenance** | **Janitor**: LLM-backed cleanup | Manual | Automatic consolidation | Mostly manual |
| **Deployment** | **Local** (Node.js + Embedded DB) | Local (Docker/NPX) | Local or Cloud | Often requires external DB server |

The core advantage is **Retrieval Quality and Traceability**: By combining graph algorithms (PageRank, Community Detection) and vector indices (HNSW), context can be provided much more precisely than through pure similarity search.

## Performance & Benchmarks

Benchmarks on a standard developer laptop (Windows, Node.js 20+):

| Metric | Value | Note |
| :--- | :--- | :--- |
| **Graph-Walking (Recursive)** | **~95 ms** | Vector Seed + Recursive Datalog Traversal |
| **Graph-RAG (Breadth-First)** | **~85 ms** | Vector Seeds + 2-Hop Expansion |
| **Hybrid Search (Cache Hit)** | **< 0.1 ms** | **v0.8+ Semantic Cache** |
| **Hybrid Search (Cold)** | **~57 ms** | FTS + HNSW + RRF Fusion |
| **Vector Search (Raw)** | **~29 ms** | Pure semantic search as reference |
| **FTS Search (Raw)** | **~12 ms** | Native Full-Text Search Performance |
| **Overhead** | **~28 ms** | Cost for Graph Logic & Fusion (negligible) |
| **Ingestion** | **~145 ms** | Per Op (Write + Embedding + FTS/LSH Indexing) |
| **RAM Usage** | **~1.3 GB** | Primarily due to local `Xenova/bge-m3` model |

### Running Benchmarks

You can test performance on your system with the integrated benchmark tool:

```bash
npm run benchmark
```

This tool (`src/benchmark.ts`) performs the following tests:
1.  **Initialization**: Cold start duration of the server incl. model loading.
2.  **Ingestion**: Mass import of test entities and observations (throughput).
3.  **Search Performance**: Latency measurement for Hybrid Search vs. Raw Vector Search.
4.  **RRF Overhead**: Determination of additional computation time for fusion logic.

## Architecture (High Level)

```
┌───────────────────────────┐
│         MCP Client         │
└──────────────┬────────────┘
               │ stdio
┌──────────────▼────────────┐
│        MCP Server          │
│  FastMCP + Zod Schemas     │
└──────────────┬────────────┘
               │
┌──────────────▼────────────┐
│  Memory Services           │
│  - Embeddings (ONNX)       │
│  - Hybrid Search (RRF)     │
│  - Semantic LRU Cache      │
│  - Inference Engine        │
└──────────────┬────────────┘
               │
┌──────────────▼────────────┐
│       CozoDB (SQLite)      │
│  - Relations + Validity    │
│  - HNSW Indices            │
│  - Datalog/Graph Algorithms│
└───────────────────────────┘
```

Optional (for UI):

```
Web UI (Vite/React) ──HTTP──► API Bridge (Express) ─► MemoryServer (embedded)
```

## Installation

### Prerequisites
- Node.js 20+ (recommended)
- CozoDB native dependency is installed via `cozo-node`.

### Setup

```bash
npm install
npm run build
```

### Windows Quickstart (incl. DirectML)

```bash
npm install
npm run build
npm run start
```

Notes:
- On first start, `@xenova/transformers` downloads the embedding model (may take time).
- The embedding backend tries to load in this order: `gpu` → `dml` (DirectML, Windows) → `cpu`. You can recognize the active path in the logs (`[EmbeddingService] ... DirectML ...`).

## Start / Integration

### MCP Server (stdio)

The MCP server runs over stdio (for Claude Desktop etc.). Start:

```bash
npm run start
```

Default database path: `memory_db.cozo.db` in project root (created automatically).

### Claude Desktop Integration

```json
{
  "mcpServers": {
    "cozo-memory": {
      "command": "node",
      "args": ["C:/Path/to/cozo-memory/dist/index.js"]
    }
  }
}
```

## Configuration & Backends

The system supports various storage backends. **SQLite** is used by default as it requires no extra installation and offers the best balance of performance and simplicity for most use cases.

### Changing Backend (e.g., to RocksDB)

RocksDB offers advantages for very large datasets (millions of entries) and write-intensive workloads due to better parallelism and data compression.

To change the backend, set the `DB_ENGINE` environment variable before starting:

**PowerShell:**
```powershell
$env:DB_ENGINE="rocksdb"; npm run dev
```

**Bash:**
```bash
DB_ENGINE=rocksdb npm run dev
```

| Backend | Status | Recommendation |
| :--- | :--- | :--- |
| **SQLite** | Active (Default) | Standard for desktop/local usage. |
| **RocksDB** | Prepared & Tested | For high-performance or very large datasets. |
| **MDBX** | Not supported | Requires manual build of `cozo-node` from source. |

---

## Data Model

CozoDB Relations (simplified) – all write operations create new `Validity` entries (Time-Travel):
- `entity`: `id`, `created_at: Validity` ⇒ `name`, `type`, `embedding(1024)`, `name_embedding(1024)`, `metadata(Json)`
- `observation`: `id`, `created_at: Validity` ⇒ `entity_id`, `text`, `embedding(1024)`, `metadata(Json)`
- `relationship`: `from_id`, `to_id`, `relation_type`, `created_at: Validity` ⇒ `strength(0..1)`, `metadata(Json)`
- `entity_community`: `entity_id` ⇒ `community_id` (Key-Value Mapping from LabelPropagation)
- `memory_snapshot`: `snapshot_id` ⇒ Counts + `metadata` + `created_at(Int)`

## MCP Tools

The interface is reduced to **4 consolidated tools**. The concrete operation is always chosen via `action`.

### mutate_memory (Write)

Actions:
- `create_entity`: `{ name, type, metadata? }`
- `update_entity`: `{ id, name?, type?, metadata? }`
- `delete_entity`: `{ entity_id }`
- `add_observation`: `{ entity_id?, entity_name?, entity_type?, text, metadata? }`
- `create_relation`: `{ from_id, to_id, relation_type, strength?, metadata? }`
- `run_transaction`: `{ operations: Array<{ action, params }> }` **(New v1.2)**: Executes multiple operations atomically.
- `add_inference_rule`: `{ name, datalog }`
- `ingest_file`: `{ format, content, entity_id?, entity_name?, entity_type?, chunking?, metadata?, observation_metadata?, deduplicate?, max_observations? }`

Important Details:
- `run_transaction` supports `create_entity`, `add_observation`, and `create_relation`. Parameters are automatically suffixed to avoid collisions.
- `create_relation` rejects self-references (`from_id === to_id`).
- `strength` is optional and defaults to `1.0`.
- `add_observation` additionally provides `inferred_suggestions` (suggestions from the Inference Engine).
- `add_observation` performs deduplication (exact + semantic via LSH). If duplicates are found, returns `status: "duplicate_detected"` with `existing_observation_id` and an estimated `similarity`.
- `update_entity` uses the JSON Merge Operator `++` (v0.7) to merge existing metadata with new values instead of overwriting them.
- `add_inference_rule` validates Datalog code upon saving. Invalid syntax or missing required columns result in an error.

Examples:

```json
{ "action": "create_entity", "name": "Alice", "type": "Person", "metadata": { "role": "Dev" } }
```

```json
{ "action": "add_observation", "entity_id": "ENTITY_ID", "text": "Alice is working on the feature flag system." }
```

Example (Duplicate):

```json
{ "action": "add_observation", "entity_id": "ENTITY_ID", "text": "Alice is working on the feature flag system." }
```

```json
{ "status": "duplicate_detected", "existing_observation_id": "OBS_ID", "similarity": 1 }
```

```json
{ "action": "create_relation", "from_id": "ALICE_ID", "to_id": "PROJ_ID", "relation_type": "works_on", "strength": 1.0 }
```

Custom Datalog Rules (Inference):

- Inference rules are stored as `action: "add_inference_rule"`.
- The Datalog query must return a result set with **exactly these 5 columns**: `from_id, to_id, relation_type, confidence, reason`.
- `$id` is the placeholder for the entity ID for which inference is started.

Example (Transitive Manager ⇒ Upper Manager):

```json
{
  "action": "add_inference_rule",
  "name": "upper_manager",
  "datalog": "?[from_id, to_id, relation_type, confidence, reason] :=\n  *relationship{from_id: $id, to_id: mid, relation_type: \"manager_of\", @ \"NOW\"},\n  *relationship{from_id: mid, to_id: target, relation_type: \"manager_of\", @ \"NOW\"},\n  from_id = $id,\n  to_id = target,\n  relation_type = \"upper_manager_of\",\n  confidence = 0.6,\n  reason = \"Transitive manager path found\""
}
```

Bulk Ingestion (Markdown/JSON):

```json
{
  "action": "ingest_file",
  "entity_name": "Project Documentation",
  "format": "markdown",
  "chunking": "paragraphs",
  "content": "# Title\n\nSection 1...\n\nSection 2...",
  "deduplicate": true,
  "max_observations": 50
}
```

### query_memory (Read)

Actions:
- `search`: `{ query, limit?, entity_types?, include_entities?, include_observations? }`
- `advancedSearch`: `{ query, limit?, filters?, graphConstraints?, vectorOptions? }` **(New v1.1 / v1.4)**: Extended search with native HNSW filters (types) and robust post-filtering (metadata, time).
- `context`: `{ query, context_window?, time_range_hours? }`
- `entity_details`: `{ entity_id, as_of? }`
- `history`: `{ entity_id }`
- `graph_rag`: `{ query, max_depth?, limit?, filters? }` Graph-based reasoning. Finds vector seeds (with inline filtering) first and then expands transitive relationships. Uses recursive Datalog for efficient BFS expansion.
- `graph_walking`: `{ query, start_entity_id?, max_depth?, limit? }` (v1.7) Recursive semantic graph search. Starts at vector seeds or a specific entity and follows relationships to other semantically relevant entities. Ideal for deeper path exploration.
- `get_relation_evolution`: `{ from_id, to_id?, since?, until? }` (in `analyze_graph`) Shows temporal development of relationships including time range filter and diff summary.

Important Details:
- `advancedSearch` allows precise filtering:
    - `filters.entityTypes`: List of entity types.
    - `filters.metadata`: Key-Value Map for exact metadata matches.
    - `graphConstraints.requiredRelations`: Only entities having certain relationships.
    - `graphConstraints.targetEntityIds`: Only entities connected to these target IDs.
- `context` returns a JSON object with entities, observations, graph connections, and inference suggestions.
- `search` uses RRF (Reciprocal Rank Fusion) to mix vector and keyword signals.
- `graph_rag` combines vector search with graph-based traversals (default depth 2) for "structured reasoning". Expansion is bidirectional across all relationship types.
- **User Profiling**: Results linked to the `global_user_profile` entity are automatically preferred (boosted).
- `time_range_hours` filters candidate results in the time window (in hours, can be float).
- `as_of` accepts ISO strings or `"NOW"`; invalid format results in an error.
- If status contradictions are detected, optional `conflict_flag` is attached to entities/observations; `context` additionally provides `conflict_flags` as a summary.

Examples:

```json
{ "action": "search", "query": "Feature Flag", "limit": 10 }
```

```json
{ 
  "action": "advancedSearch", 
  "query": "Manager", 
  "filters": { "metadata": { "role": "Lead" } },
  "graphConstraints": { "requiredRelations": ["works_with"] }
}
```

```json
{ "action": "graph_rag", "query": "What is Alice working on?", "max_depth": 2 }
```

```json
{ "action": "context", "query": "What is Alice working on right now?", "context_window": 20 }
```

#### Conflict Detection (Status)

If there are contradictory statements about the status of an entity, a conflict is marked. The system considers **temporal consistency**:

- **Status Contradiction**: An entity has both "active" and "inactive" status in the **same calendar year**.
- **Status Change (No Conflict)**: If statements are from different years (e.g., 2024 "discontinued", 2025 "active"), this is interpreted as a legitimate change and **not** marked as a conflict.

The detection uses regex matching on keywords like:
- **Active**: active, running, ongoing, in operation, continued, not discontinued.
- **Inactive**: discontinued, cancelled, stopped, shut down, closed, deprecated, archived, ended, abandoned.

**Integration in API Responses:**
- `entities[i].conflict_flag` or `observations[i].conflict_flag`: Flag directly on the match.
- `conflict_flags`: List of all detected conflicts in `context` or `search` result.

### analyze_graph (Analysis)

Actions:
- `explore`: `{ start_entity, end_entity?, max_hops?, relation_types? }`
    - with `end_entity`: shortest path (BFS)
    - without `end_entity`: Neighborhood up to max. 5 hops (aggregated by minimal hop count)
- `communities`: `{}` recalculates communities and writes `entity_community`
- `pagerank`: `{}` Calculates PageRank scores for all entities.
- `betweenness`: `{}` Calculates Betweenness Centrality (centrality measure for bridge elements).
- `hits`: `{}` Calculates HITS scores (Hubs & Authorities).
- `connected_components`: `{}` Identifies isolated subgraphs.
- `shortest_path`: `{ start_entity, end_entity }` Calculates shortest path via Dijkstra (incl. distance and path reconstruction).
- `bridge_discovery`: `{}` Searches for entities acting as bridges between isolated communities (high Betweenness relevance).
- `semantic_walk`: `{ start_entity, max_depth?, min_similarity? }` (v1.7) Recursive semantic graph search. Starts at an entity and recursively follows paths consisting of explicit relationships AND semantic similarity (vector distance). Finds "associative paths" in the knowledge graph.
- `hnsw_clusters`: `{}` Analyzes clusters directly on the HNSW graph (Layer 0). Extremely fast as no vector calculations are needed.
- `infer_relations`: `{ entity_id }` provides suggestions from multiple strategies.
- `get_relation_evolution`: `{ from_id, to_id?, since?, until? }` shows temporal development of relationships including time range filter and diff summary.

Examples:

```json
{ "action": "shortest_path", "start_entity": "ID_A", "end_entity": "ID_B" }
```

```json
{ "action": "explore", "start_entity": "ENTITY_ID", "max_hops": 3 }
```

### manage_system (Maintenance)

Actions:
- `health`: `{}` returns DB counts + embedding cache stats.
- `snapshot_create`: `{ metadata? }`
- `snapshot_list`: `{}`
- `snapshot_diff`: `{ snapshot_id_a, snapshot_id_b }`
- `cleanup`: `{ confirm, older_than_days?, max_observations?, min_entity_degree?, model? }`
- `reflect`: `{ entity_id?, model? }` Analyzes memory for contradictions and new insights.
- `clear_memory`: `{ confirm }`

Janitor Cleanup Details:
- `cleanup` supports `dry_run`: with `confirm: false` only candidates are listed.
- With `confirm: true`, the Janitor becomes active:
  - **Hierarchical Summarization**: Detects isolated or old observations, has them summarized by a local LLM (Ollama), and creates a new `ExecutiveSummary` node. Old fragments are deleted to reduce noise while preserving knowledge.

Reflection Service Details:
- `reflect` analyzes observations of an entity (or top 5 active entities) to find contradictions, patterns, or temporal developments.
- Results are persisted as new observations with metadata field `{ "kind": "reflection" }` and are retrievable via `context`.
- Text is stored with prefix `Reflective Insight: `.

Defaults: `older_than_days=30`, `max_observations=20`, `min_entity_degree=2`, `model="demyagent-4b-i1:Q6_K"`.

## Technical Highlights

### Local ONNX Embeddings (Transformers)

Default Model: `Xenova/bge-m3` (1024 dimensions). Loading order:
1. GPU (`device: "gpu"`)
2. DirectML (`device: "dml"`, relevant for Windows)
3. CPU (`device: "cpu"`)

Embeddings are kept in an LRU cache (1000 entries, 1h TTL). On embedding errors, a zero vector is returned to keep tool calls stable.

### Hybrid Search (Vector + Keyword + Graph + Inference) + RRF

The search combines:
- Vector similarity via HNSW indices (`~entity:semantic`, `~observation:semantic`)
- Keyword matching via Regex (`regex_matches(...)`)
- Graph signal via PageRank (for central entities)
- Community Expansion: Entities from the community of top seeds are introduced with a boost
- Inference signal: probabilistic candidates (e.g., `expert_in`) with `confidence` as score

Fusion: Reciprocal Rank Fusion (RRF) across sources `vector`, `keyword`, `graph`, `community`, `inference`.

Temporal Decay (active by default):
- Before RRF fusion, scores are dampened based on time (`created_at`).
- Half-life: 90 days (exponential decay), with source-specific floors:
  - `keyword`: no decay (corresponds to "explicitly searched")
  - `graph`/`community`: at least 0.6
  - `vector`: at least 0.2

Uncertainty/Transparency:
- Inference candidates are marked as `source: "inference"` and provide a short reason (uncertainty hint) in the result.
- In `context` output, inferred entities additionally carry an `uncertainty_hint` so an LLM can distinguish "hard fact" vs. "conjecture".

### Inference Engine

Inference uses multiple strategies (non-persisting):
- **Co-occurrence**: Entity names in observation texts (`related_to`, confidence 0.7)
- **Semantic Proximity**: Similar entities via HNSW (`similar_to`, up to max. 0.9)
- **Transitivity**: A→B and B→C (`potentially_related`, confidence 0.5)
- **Expertise Rule**: `Person` + `works_on` + `uses_tech` ⇒ `expert_in` (confidence 0.7)
- **Query-Triggered Expertise**: Search queries with keywords like `expert`, `skill`, `knowledge`, `competence` automatically trigger a dedicated expert search over the graph network.

## Optional: HTTP API Bridge + Web UI

### API Bridge

For UI/Tools, there is an Express server embedding the `MemoryServer` directly.

Start:

```bash
npm run bridge
```

Configuration:
- Port via `PORT` (Default: `3001`)

Selected Endpoints (Prefix `/api`):
- `GET /entities`, `POST /entities`, `GET /entities/:id`, `DELETE /entities/:id`
- `POST /observations`
- `GET /search`, `GET /context`
- `GET /health`
- `GET /snapshots`, `POST /snapshots`

## Development

### Structure
- `src/index.ts`: MCP Server + Tool Registration + Schema Setup
- `src/embedding-service.ts`: Embedding Pipeline + LRU Cache
- `src/hybrid-search.ts`: Search Strategies + RRF + Community Expansion
- `src/inference-engine.ts`: Inference Strategies
- `src/api_bridge.ts`: Express API Bridge (for UI)

### Scripts (Root)
- `npm run build`: TypeScript Build
- `npm run dev`: ts-node Start of MCP Server
- `npm run start`: Starts `dist/index.js` (stdio)
- `npm run bridge`: Build + Start of API Bridge (`dist/api_bridge.js`)
- `npm run benchmark`: Runs performance tests

## User Preference Profiling (Mem0-Style)

The system maintains a persistent profile of the user (preferences, dislikes, work style) via the specialized entity `global_user_profile`.

- **Benefit**: Personalization without manual search ("I know you prefer TypeScript").
- **Mechanism**: All observations assigned to this entity receive a significant boost in search and context queries.
- **Initialization**: The profile is automatically created on first start.

### Manual Tests

There are various test scripts for different features:

```bash
# Tests edge cases and basic operations
npx ts-node src/test-edge-cases.ts

# Tests hybrid search and context retrieval
npx ts-node src/test-context.ts

# Tests memory reflection (requires Ollama)
npx ts-node test-reflection.ts

# Tests user preference profiling and search boost
npx ts-node test-user-pref.ts
```

## Troubleshooting

- Embedding model download may take a long time on first start (Transformers loads artifacts).
- If `cleanup` is used, an Ollama service must be reachable locally and the desired model must be present.

## License

This project is licensed under the Apache-2.0 License. See the [LICENSE](LICENSE) file for details.

## Disclaimer

Single-User, Local-First: This project was developed to work for a single user and a local installation.
