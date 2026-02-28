# CozoDB Memory MCP Server

[![npm](https://img.shields.io/npm/v/cozo-memory)](https://www.npmjs.com/package/cozo-memory)
[![Node](https://img.shields.io/node/v/cozo-memory)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

**Local-first memory for Claude & AI agents with hybrid search, Graph-RAG, and time-travel – all in a single binary, no cloud, no Docker.**

## Table of Contents

- [Quick Start](#quick-start)
- [Key Features](#key-features)
- [Positioning & Comparison](#positioning--comparison)
- [Performance & Benchmarks](#performance--benchmarks)
- [Architecture](#architecture)
- [Installation](#installation)
- [Start / Integration](#start--integration)
- [Configuration & Backends](#configuration--backends)
- [Data Model](#data-model)
- [MCP Tools](#mcp-tools)
  - [mutate_memory (Write)](#mutate_memory-write)
  - [query_memory (Read)](#query_memory-read)
  - [analyze_graph (Analysis)](#analyze_graph-analysis)
  - [manage_system (Maintenance)](#manage_system-maintenance)
- [Production Monitoring](#production-monitoring)
- [Technical Highlights](#technical-highlights)
- [Optional: HTTP API Bridge](#optional-http-api-bridge)
- [Development](#development)
- [User Preference Profiling](#user-preference-profiling-mem0-style)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Quick Start

### Option 1: Install via npm (Recommended)

```bash
# Install globally
npm install -g cozo-memory

# Or run directly with npx (no installation needed)
npx cozo-memory
```

### Option 2: Build from Source

```bash
git clone https://github.com/tobs-code/cozo-memory
cd cozo-memory
npm install && npm run build
npm run start
```

Now you can add the server to your MCP client (e.g. Claude Desktop).

## Key Features

🔍 **Hybrid Search (since v0.7)** - Combines semantic search (HNSW), full-text search (FTS), and graph signals via Reciprocal Rank Fusion (RRF)

🕸️ **Graph-RAG & Graph-Walking (since v1.7)** - Advanced retrieval combining vector seeds with recursive graph traversals using optimized Datalog algorithms

🎯 **Multi-Vector Support (since v1.7)** - Dual embeddings per entity: content-embedding for context, name-embedding for identification

⚡ **Semantic Caching (since v0.8.5)** - Two-level cache (L1 memory + L2 persistent) with semantic query matching

⏱️ **Time-Travel Queries** - Version all changes via CozoDB Validity; query any point in history

🔗 **Atomic Transactions (since v1.2)** - Multi-statement transactions ensuring data consistency

📊 **Graph Algorithms (since v1.3/v1.6)** - PageRank, Betweenness Centrality, HITS, Community Detection, Shortest Path

🧹 **Janitor Service** - LLM-backed automatic cleanup with hierarchical summarization

👤 **User Preference Profiling** - Persistent user preferences with automatic 50% search boost

🔍 **Near-Duplicate Detection** - Automatic LSH-based deduplication to avoid redundancy

🧠 **Inference Engine** - Implicit knowledge discovery with multiple strategies

🏠 **100% Local** - Embeddings via ONNX/Transformers; no external services required

📦 **Export/Import (since v1.8)** - Export to JSON, Markdown, or Obsidian-ready ZIP; import from Mem0, MemGPT, Markdown, or native format

### Detailed Features
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

Benchmarks on a standard developer laptop (Windows, Node.js 20+, CPU-only):

| Metric | Value | Note |
| :--- | :--- | :--- |
| **Graph-Walking (Recursive)** | **~130 ms** | Vector Seed + Recursive Datalog Traversal |
| **Graph-RAG (Breadth-First)** | **~335 ms** | Vector Seeds + 2-Hop Expansion |
| **Hybrid Search (Cache Hit)** | **< 0.1 ms** | **v0.8+ Semantic Cache** |
| **Hybrid Search (Cold)** | **~35 ms** | FTS + HNSW + RRF Fusion |
| **Vector Search (Raw)** | **~51 ms** | Pure semantic search as reference |
| **FTS Search (Raw)** | **~12 ms** | Native Full-Text Search Performance |
| **Ingestion** | **~102 ms** | Per Op (Write + Embedding + FTS/LSH Indexing) |
| **RAM Usage** | **~1.7 GB** | Primarily due to local `Xenova/bge-m3` model |

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

## Architecture

```mermaid
graph TB
    Client[MCP Client<br/>Claude Desktop, etc.]
    Server[MCP Server<br/>FastMCP + Zod Schemas]
    Services[Memory Services]
    Embeddings[Embeddings<br/>ONNX Runtime]
    Search[Hybrid Search<br/>RRF Fusion]
    Cache[Semantic Cache<br/>L1 + L2]
    Inference[Inference Engine<br/>Multi-Strategy]
    DB[(CozoDB SQLite<br/>Relations + Validity<br/>HNSW Indices<br/>Datalog/Graph)]
    
    Client -->|stdio| Server
    Server --> Services
    Services --> Embeddings
    Services --> Search
    Services --> Cache
    Services --> Inference
    Services --> DB
    
    style Client fill:#e1f5ff
    style Server fill:#fff4e1
    style Services fill:#f0e1ff
    style DB fill:#e1ffe1
```

### Graph-Walking Visualization

```mermaid
graph LR
    Start([Query: What is Alice working on?])
    V1[Vector Search<br/>Find: Alice]
    E1[Alice<br/>Person]
    E2[Project X<br/>Project]
    E3[Feature Flags<br/>Technology]
    E4[Bob<br/>Person]
    
    Start --> V1
    V1 -.semantic similarity.-> E1
    E1 -->|works_on| E2
    E2 -->|uses_tech| E3
    E1 -->|colleague_of| E4
    E4 -.semantic: also relevant.-> E2
    
    style Start fill:#e1f5ff
    style V1 fill:#fff4e1
    style E1 fill:#ffe1e1
    style E2 fill:#e1ffe1
    style E3 fill:#f0e1ff
    style E4 fill:#ffe1e1
```

## Installation

### Prerequisites
- Node.js 20+ (recommended)
- CozoDB native dependency is installed via `cozo-node`.

### Via npm (Easiest)

```bash
# Install globally
npm install -g cozo-memory

# Or use npx without installation
npx cozo-memory
```

### From Source

```bash
git clone https://github.com/tobs-code/cozo-memory
cd cozo-memory
npm install
npm run build
```

### Windows Quickstart

```bash
npm install
npm run build
npm run start
```

Notes:
- On first start, `@xenova/transformers` downloads the embedding model (may take time).
- Embeddings are processed on the CPU.

## Start / Integration

### MCP Server (stdio)

The MCP server runs over stdio (for Claude Desktop etc.). Start:

```bash
npm run start
```

Default database path: `memory_db.cozo.db` in project root (created automatically).

### Claude Desktop Integration

#### Using npx (Recommended)

```json
{
  "mcpServers": {
    "cozo-memory": {
      "command": "npx",
      "args": ["cozo-memory"]
    }
  }
}
```

#### Using global installation

```json
{
  "mcpServers": {
    "cozo-memory": {
      "command": "cozo-memory"
    }
  }
}
```

#### Using local build

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

| Tool | Purpose | Key Actions |
|------|---------|-------------|
| `mutate_memory` | Write operations | create_entity, update_entity, delete_entity, add_observation, create_relation, run_transaction, add_inference_rule, ingest_file |
| `query_memory` | Read operations | search, advancedSearch, context, entity_details, history, graph_rag, graph_walking |
| `analyze_graph` | Graph analysis | explore, communities, pagerank, betweenness, hits, shortest_path, bridge_discovery, semantic_walk, infer_relations |
| `manage_system` | Maintenance | health, metrics, export_memory, import_memory, snapshot_create, snapshot_list, snapshot_diff, cleanup, reflect, clear_memory |

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
  - `chunking` options: `"none"`, `"paragraphs"` (future: `"semantic"`)

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
- `health`: `{}` returns DB counts + embedding cache stats + performance metrics.
- `metrics`: `{}` returns detailed operation counts, error statistics, and performance data.
- `export_memory`: `{ format, includeMetadata?, includeRelationships?, includeObservations?, entityTypes?, since? }` exports memory to various formats.
- `import_memory`: `{ data, sourceFormat, mergeStrategy?, defaultEntityType? }` imports memory from external sources.
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

**Before Janitor:**
```
Entity: Project X
├─ Observation 1: "Started in Q1" (90 days old, isolated)
├─ Observation 2: "Uses React" (85 days old, isolated)
├─ Observation 3: "Team of 5" (80 days old, isolated)
└─ Observation 4: "Deployed to staging" (75 days old, isolated)
```

**After Janitor:**
```
Entity: Project X
└─ ExecutiveSummary: "Project X is a React-based application started in Q1 
   with a team of 5 developers, currently deployed to staging environment."
```

Reflection Service Details:
- `reflect` analyzes observations of an entity (or top 5 active entities) to find contradictions, patterns, or temporal developments.
- Results are persisted as new observations with metadata field `{ "kind": "reflection" }` and are retrievable via `context`.
- Text is stored with prefix `Reflective Insight: `.

Defaults: `older_than_days=30`, `max_observations=20`, `min_entity_degree=2`, `model="demyagent-4b-i1:Q6_K"`.

Export/Import Details:
- `export_memory` supports three formats:
  - **JSON** (`format: "json"`): Native Cozo format, fully re-importable with all metadata and timestamps.
  - **Markdown** (`format: "markdown"`): Human-readable document with entities, observations, and relationships.
  - **Obsidian** (`format: "obsidian"`): ZIP archive with Wiki-Links `[[Entity]]`, YAML frontmatter, ready for Obsidian vault.
- `import_memory` supports four source formats:
  - **Cozo** (`sourceFormat: "cozo"`): Import from native JSON export.
  - **Mem0** (`sourceFormat: "mem0"`): Import from Mem0 format (user_id becomes entity).
  - **MemGPT** (`sourceFormat: "memgpt"`): Import from MemGPT archival/recall memory.
  - **Markdown** (`sourceFormat: "markdown"`): Parse markdown sections as entities with observations.
- Merge strategies: `skip` (default, skip duplicates), `overwrite` (replace existing), `merge` (combine metadata).
- Optional filters: `entityTypes` (array), `since` (Unix timestamp in ms), `includeMetadata`, `includeRelationships`, `includeObservations`.

Example Export:
```json
{
  "action": "export_memory",
  "format": "obsidian",
  "includeMetadata": true,
  "entityTypes": ["Person", "Project"]
}
```

Example Import:
```json
{
  "action": "import_memory",
  "sourceFormat": "mem0",
  "data": "{\"user_id\": \"alice\", \"memories\": [...]}",
  "mergeStrategy": "skip"
}
```

Production Monitoring Details:
- `health` provides comprehensive system status including entity/observation/relationship counts, embedding cache statistics, and performance metrics (last operation time, average operation time, total operations).
- `metrics` returns detailed operational metrics:
  - **Operation Counts**: Tracks create_entity, update_entity, delete_entity, add_observation, create_relation, search, and graph_operations.
  - **Error Statistics**: Total errors and breakdown by operation type.
  - **Performance Metrics**: Last operation duration, average operation duration, and total operations executed.
- Delete operations now include detailed logging with verification steps and return statistics about deleted data (observations, outgoing/incoming relations).

## Production Monitoring

The system includes comprehensive monitoring capabilities for production deployments:

### Metrics Tracking

All operations are automatically tracked with detailed metrics:
- Operation counts by type (create, update, delete, search, etc.)
- Error tracking with breakdown by operation
- Performance metrics (latency, throughput)

### Health Endpoint

The `health` action provides real-time system status:
```json
{ "action": "health" }
```

Returns:
- Database counts (entities, observations, relationships)
- Embedding cache statistics (hit rate, size)
- Performance metrics (last operation time, average time, total operations)

### Metrics Endpoint

The `metrics` action provides detailed operational metrics:
```json
{ "action": "metrics" }
```

Returns:
- **operations**: Count of each operation type
- **errors**: Total errors and breakdown by operation
- **performance**: Last operation duration, average duration, total operations

### Enhanced Delete Operations

Delete operations include comprehensive logging and verification:
- Detailed step-by-step logging with `[Delete]` prefix
- Counts related data before deletion
- Verification after deletion
- Returns statistics: `{ deleted: { observations: N, outgoing_relations: N, incoming_relations: N } }`

Example:
```json
{ "action": "delete_entity", "entity_id": "ENTITY_ID" }
```

Returns deletion statistics showing exactly what was removed.

## Technical Highlights

### Local ONNX Embeddings (Transformers)

Default Model: `Xenova/bge-m3` (1024 dimensions).

Embeddings are processed on the CPU to ensure maximum compatibility. They are kept in an LRU cache (1000 entries, 1h TTL). On embedding errors, a zero vector is returned to keep tool calls stable.

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

## Optional: HTTP API Bridge

### API Bridge

For Tools, there is an Express server embedding the `MemoryServer` directly.

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

### Common Issues

**First Start Takes Long**
- The embedding model download takes 30-90 seconds on first start (Transformers loads ~500MB of artifacts)
- This is normal and only happens once
- Subsequent starts are fast (< 2 seconds)

**Cleanup/Reflect Requires Ollama**
- If using `cleanup` or `reflect` actions, an Ollama service must be running locally
- Install Ollama from https://ollama.ai
- Pull the desired model: `ollama pull demyagent-4b-i1:Q6_K` (or your preferred model)

**Windows-Specific**
- Embeddings are processed on CPU for maximum compatibility
- RocksDB backend requires Visual C++ Redistributable if using that option

**Performance Issues**
- First query after restart is slower (cold cache)
- Use `health` action to check cache hit rates
- Consider RocksDB backend for datasets > 100k entities

## License

This project is licensed under the Apache-2.0 License. See the [LICENSE](LICENSE) file for details.

## Disclaimer

Single-User, Local-First: This project was developed to work for a single user and a local installation.
