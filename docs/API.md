# API Reference

Complete reference for all MCP tools in CozoDB Memory.

## Overview

The interface is consolidated into **5 main tools**. The concrete operation is always chosen via `action`.

| Tool | Purpose | Key Actions |
|------|---------|-------------|
| `mutate_memory` | Write operations | create_entity, update_entity, delete_entity, add_observation, create_relation, start_session, stop_session, start_task, stop_task, run_transaction, add_inference_rule, ingest_file, invalidate_observation, invalidate_relation, enrich_observation, record_memory_access, prune_weak_memories, detect_conflicts, resolve_conflicts |
| `query_memory` | Read operations | search, advancedSearch, context, entity_details, history, graph_rag, graph_walking, agentic_search, dynamic_fusion, adaptive_retrieval, get_zettelkasten_stats, get_activation_stats, get_salience_stats, suggest_connections, spreading_activation, qafd_search, hierarchical_memory_query |
| `analyze_graph` | Graph analysis | explore, communities, pagerank, betweenness, hits, connected_components, shortest_path, bridge_discovery, semantic_walk, infer_relations, get_relation_evolution, hnsw_clusters, discover_logical_edges, materialize_logical_edges, detect_temporal_patterns |
| `manage_system` | Maintenance | health, metrics, export_memory, import_memory, snapshot_create, snapshot_list, snapshot_diff, cleanup, defrag, reflect, summarize_communities, clear_memory, compress_memory_levels, analyze_memory_distribution, compact, list_inference_rules, delete_inference_rule |
| `edit_user_profile` | User preferences | Edit global user profile with preferences and work style |

**For detailed documentation, examples, and best practices, see `docs/USAGE-GUIDE.md`**

---

## Quick Reference

### mutate_memory - Write Operations

**Common actions:**
- `create_entity`, `update_entity`, `delete_entity` - Entity management
- `add_observation` - Store facts/notes (use entity_id='global_user_profile' for user preferences)
- `create_relation` - Connect entities

**Advanced actions:**
- `run_transaction` - Atomic multi-operation execution
- `add_inference_rule` - Custom Datalog rules (must return 5 columns: from_id, to_id, relation_type, confidence, reason)
- `ingest_file` - Bulk import (Markdown/JSON/PDF)
- `start_session`, `stop_session`, `start_task`, `stop_task` - Context tracking (`stop_session`/`stop_task` use `id`, not `session_id`/`task_id`)
- `detect_conflicts`, `resolve_conflicts` - Conflict detection and resolution
- `enrich_observation`, `record_memory_access`, `prune_weak_memories` - Memory management

**Agent convenience actions:**
- `update_observation` - Edit an existing observation's text/metadata
- `batch_delete` - Delete many entities by IDs or filter (supports `dry_run`)
- `manage_tags` - Lightweight tags in `metadata.tags` (add/remove/set/list/search)
- `batch` - Run a sequence of mutations (transactional or best-effort)

**Note:** `add_observation` also accepts `session_id`/`task_id` to link an observation to a session/task (used by `get_session_context`/`list_sessions`).

**Note:** User profile observations (entity_id='global_user_profile') are automatically boosted in searches.

---

### query_memory - Read Operations

**Grouped by category:**

**Hybrid Search:**
- `search` - Basic hybrid search (query required)
- `advancedSearch` - With filters and constraints (query required)

**Context & Details:**
- `context` - Comprehensive context retrieval (query required)
- `entity_details` - Entity info (entity_id required)
- `history` - Entity evolution (entity_id required)

**Graph Traversal:**
- `graph_rag` - Multi-hop reasoning (query required)
- `graph_walking` - Recursive semantic search (query required)

**Advanced Search:**
- `adaptive_retrieval` - Auto-optimizing (query required) ⭐ Recommended
- `dynamic_fusion` - Fine-tune weights (query required)
- `agentic_search` - Auto-routing (query required)

**Specialized:**
- `spreading_activation` - Neural-inspired (query required)
- `qafd_search` - Flow diffusion (query required)
- `hierarchical_memory_query` - Multi-level memory (query required)
- `suggest_connections` - Connection discovery (entity_id required, NO query)

**Statistics:**
- `get_zettelkasten_stats`, `get_activation_stats`, `get_salience_stats` - No params required

**Agent convenience actions:**
- `list_entities` - Browse/list entities with filter, sort and pagination (NO query)
- `get_entity_detail` - Entity + observations + relations (+ optional community/timeline) in one call (entity_id required)
- `get_session_context` - A session's observations (+ optional entities/timeline); defaults to most recently active session
- `list_sessions` - List sessions with activity metadata and observation counts

---

### analyze_graph - Graph Analysis

**Common operations:**
- `explore` - Navigate/find paths (start_entity required)
- `communities` - Detect groups
- `pagerank` - Entity importance
- `shortest_path` - Dijkstra (start_entity, end_entity required)

**Advanced:**
- `semantic_walk` - Semantic traversal (start_entity required)
- `infer_relations` - Inference engine (entity_id required)
- `bridge_discovery` - Find bridges
- `hnsw_clusters` - Vector clusters
- `discover_logical_edges`, `materialize_logical_edges` - Logical edge discovery (entity_id required)
- `detect_temporal_patterns` - Temporal analysis (entity_id required)
- `get_relation_evolution` - Relationship history (from_id required)

---

### manage_system - System Management

**Monitoring:**
- `health` - Status check with DB counts and performance metrics
- `metrics` - Detailed operational statistics

**Statistics:**
- `stats` - Aggregate dashboard: overview counts, per-type breakdown, timeline (no params)

**Data Portability:**
- `export_memory` - Export to JSON/Markdown/Obsidian (format required)
- `import_memory` - Import from Mem0/MemGPT/Markdown/Cozo (data, sourceFormat required)

**Backups:**
- `snapshot_create` - Create backup point
- `snapshot_list` - List all snapshots
- `snapshot_diff` - Compare two snapshots (snapshot_id_a, snapshot_id_b required)

**Optimization:**
- `cleanup` - LLM-backed consolidation (confirm required, use confirm=false for dry-run)
- `defrag` - Merge duplicates and connect islands (confirm required, use confirm=false for dry-run)
- `reflect` - Analyze for contradictions and insights
- `compact` - Database compaction

**Advanced:**
- `summarize_communities` - Hierarchical GraphRAG summaries
- `compress_memory_levels` - Hierarchical compression (entity_id, level required)
- `analyze_memory_distribution` - Memory level analysis (entity_id required)
- `clear_memory` - Reset entire database (confirm=true required)

**Inference rule management:**
- `list_inference_rules` - List all custom Datalog inference rules (no params)
- `delete_inference_rule` - Delete a custom inference rule (rule_id required)

**Important:** Use `confirm=false` for dry-run before cleanup/defrag. `clear_memory` requires `confirm=true`.

**Note:** For statistics (get_salience_stats, get_activation_stats, get_zettelkasten_stats), use `query_memory` tool instead.

---

### edit_user_profile - User Preferences

Direct management of the global user profile ('global_user_profile').

**Parameters:**
- `name` - Update profile name
- `type` - Update profile type
- `metadata` - Merge profile metadata
- `observations` - Add preference observations (array of {text, metadata?})
- `clear_observations` - Clear existing before adding (boolean)

**Example:**
```json
{
  "observations": [
    { "text": "Prefers TypeScript over JavaScript" },
    { "text": "Works best in the morning" }
  ]
}
```

**Note:** User profile is automatically boosted in all searches (50% score boost).

---

## Parameter Naming Conventions

Understanding parameter naming helps avoid confusion:

- **entity_id** - Entity references (create_relation, add_observation, detect_conflicts, manage_tags, etc.)
- **id** - Update/stop operations (stop_session, stop_task, update_entity)
- **observation_id** - Observation operations (invalidate_observation, enrich_observation, record_memory_access)
- **from_id / to_id** - Relationship operations (create_relation, invalidate_relation)

**Examples:**
```json
// Entity operations use entity_id
{"action": "delete_entity", "entity_id": "abc-123"}
{"action": "detect_conflicts", "entity_id": "abc-123"}

// Session/Task stop operations use id
{"action": "stop_session", "id": "session-123"}
{"action": "stop_task", "id": "task-456"}

// Update operations use id
{"action": "update_entity", "id": "abc-123", "name": "New Name"}
```

---

## Memory Hierarchy

Observations are organized in 4 levels:

- **L0_RAW (0)** - Raw, unprocessed observations (default for new observations)
- **L1_SESSION (1)** - Session-level summaries (created via compression)
- **L2_WEEKLY (2)** - Weekly consolidation (created via compression)
- **L3_MONTHLY (3)** - Long-term memory (created via compression)

**Working with levels:**
```json
// Query specific levels
{
  "action": "hierarchical_memory_query",
  "query": "project updates",
  "levels": [1, 2],
  "limit": 10
}

// Compress to higher level
{
  "action": "compress_memory_levels",
  "entity_id": "project-123",
  "level": 1
}

// Analyze distribution
{
  "action": "analyze_memory_distribution",
  "entity_id": "project-123"
}
```

---

## Inference Rules

When adding custom inference rules with `add_inference_rule`, the Datalog query must return exactly 5 columns:
- `from_id` - Source entity ID
- `to_id` - Target entity ID
- `relation_type` - Type of relationship
- `confidence` - Score 0-1
- `reason` - Explanation text

**Important:** All variables in the rule head must be bound in the rule body.

**Example (Manager Transitivity):**
```datalog
?[from_id, to_id, relation_type, confidence, reason] := 
  *relationship{from_id: $id, to_id: mid, relation_type: "manager_of", @ "NOW"}, 
  *relationship{from_id: mid, to_id: target, relation_type: "manager_of", @ "NOW"}, 
  from_id = $id, 
  to_id = target, 
  relation_type = "indirect_manager_of", 
  confidence = 0.6, 
  reason = "Transitive Manager Path"
```

**For more examples and common mistakes, see `docs/USAGE-GUIDE.md`**

---

## Common Patterns

### Basic Entity and Observation Management

```json
// Create entity
{
  "action": "create_entity",
  "name": "Alice",
  "type": "Person",
  "metadata": {"role": "Developer"}
}

// Add observation
{
  "action": "add_observation",
  "entity_id": "ENTITY_ID",
  "text": "Alice is working on the authentication system"
}

// Create relationship
{
  "action": "create_relation",
  "from_id": "ALICE_ID",
  "to_id": "PROJECT_ID",
  "relation_type": "works_on",
  "strength": 0.9
}
```

### Search and Retrieval

```json
// Simple search
{
  "action": "search",
  "query": "authentication system",
  "limit": 10
}

// Adaptive retrieval (recommended)
{
  "action": "adaptive_retrieval",
  "query": "How does authentication work?",
  "limit": 10
}

// Context retrieval
{
  "action": "context",
  "query": "What is Alice working on?",
  "context_window": 20
}
```

### Graph Analysis

```json
// Explore neighborhood
{
  "action": "explore",
  "start_entity": "ALICE_ID",
  "max_hops": 3
}

// Find shortest path
{
  "action": "shortest_path",
  "start_entity": "ALICE_ID",
  "end_entity": "PROJECT_ID"
}

// Infer relationships
{
  "action": "infer_relations",
  "entity_id": "ALICE_ID"
}
```

### System Maintenance

```json
// Health check
{
  "action": "health"
}

// Export memory
{
  "action": "export_memory",
  "format": "obsidian"
}

// Cleanup (dry-run first)
{
  "action": "cleanup",
  "confirm": false,
  "older_than_days": 30
}
```

---

## Agent Convenience Actions

Higher-level actions that aggregate or batch lower-level operations so an agent
needs fewer round-trips. All responses are JSON.

### `query_memory` → `list_entities`

Browse what is in memory without searching. No `query` needed.

Parameters: `type?`, `types?: string[]`, `name_contains?` (case-insensitive),
`tags?: string[]` (entity must have **all** tags), `sort_by?` (`name` |
`created_at` | `updated_at`, default `created_at`), `sort_order?` (`asc` |
`desc`, default `desc`), `limit?` (default 20, max 1000), `offset?` (default 0).

```json
{ "action": "list_entities", "type": "person", "tags": ["vip"], "sort_by": "name", "sort_order": "asc", "limit": 20 }
```

Response: `{ entities: [{ id, name, type, metadata, tags, created_at, observation_count, relation_count }], total, offset, limit }`

### `query_memory` → `get_entity_detail`

Everything about one entity in a single call.

Parameters: `entity_id` (required), `include_observations?` (default true),
`include_relations?` (default true), `include_community?` (default false),
`include_timeline?` (default false).

```json
{ "action": "get_entity_detail", "entity_id": "ENTITY_ID", "include_timeline": true }
```

Response: `{ entity, observations[], relations: { outgoing[], incoming[] }, community?, timeline? }`

### `query_memory` → `get_session_context` / `list_sessions`

Inspect what happened in a session. `get_session_context` defaults to the most
recently active session when `session_id` is omitted.

`get_session_context` parameters: `session_id?`, `include_observations?` (default
true), `include_entities?` (default false), `include_timeline?` (default false),
`limit?` (default 50). `list_sessions` parameters: `active_only?` (default
false), `limit?`.

```json
{ "action": "get_session_context", "session_id": "SESSION_ID", "include_entities": true }
{ "action": "list_sessions", "active_only": true }
```

> To populate sessions, pass `session_id` when adding observations:
> `{ "action": "add_observation", "entity_id": "...", "text": "...", "session_id": "SESSION_ID" }`.
> The `session_id` is the `id` returned by `start_session`.

### `manage_system` → `stats`

Aggregate dashboard. No parameters.

```json
{ "action": "stats" }
```

Response: `{ overview: { total_entities, total_observations, total_relations }, by_type: [{ type, count }], timeline: { oldest_entity, newest_entity, entities_last_24h, entities_last_7d }, activity: { total_operations, top_types } }`

### `mutate_memory` → `update_observation`

Edit an observation in place instead of delete + recreate.

Parameters: `observation_id` (required), `text?`, `metadata?`, `merge_metadata?`
(default false — when true, merges into existing metadata instead of replacing).

```json
{ "action": "update_observation", "observation_id": "OBS_ID", "text": "Corrected text", "metadata": { "edited": true }, "merge_metadata": true }
```

Response: `{ status: "updated", observation: { id, entity_id, text, metadata, updated_at, previous_text } }`

### `mutate_memory` → `batch_delete`

Delete many entities at once (cascades to their observations/relations).

Parameters: `entity_ids?: string[]` **or** `filter?: { type?, name_contains?,
created_before?, created_after?, metadata?, tags? }`, `dry_run?` (default false —
when true, only reports what would be deleted).

```json
{ "action": "batch_delete", "filter": { "type": "person", "tags": ["test"] }, "dry_run": true }
```

Response: `{ status: "deleted" | "dry_run", deleted_count, deleted_entities[], deleted_observations, deleted_relations, errors? }`

### `mutate_memory` → `manage_tags`

Lightweight tagging stored in `metadata.tags` (a string array). No separate
table — tags are filterable via `list_entities`/`batch_delete`.

Parameters: `operation` (`add` | `remove` | `set` | `list` | `search`),
`entity_id?` (required for add/remove/set, optional for list),
`tags?: string[]` (for add/remove/set), `search_tag?` (for search).

```json
{ "action": "manage_tags", "operation": "add", "entity_id": "ENTITY_ID", "tags": ["vip", "team"] }
{ "action": "manage_tags", "operation": "search", "search_tag": "vip" }
```

### `mutate_memory` → `batch`

Execute a sequence of mutations in one call.

Parameters: `operations: [{ action, params }]` (sub-actions: `create_entity`,
`add_observation`, `create_relation`, `delete_entity`, `update_observation`),
`transactional?` (default true — all-or-nothing), `continue_on_error?` (default
false — only honored when not transactional).

```json
{
  "action": "batch",
  "transactional": true,
  "operations": [
    { "action": "create_entity", "params": { "name": "Carol", "type": "person" } },
    { "action": "create_entity", "params": { "name": "Dave", "type": "person" } }
  ]
}
```

Response: `{ status: "completed" | "partial" | "failed", results: [{ index, action, status, result?, error? }], summary: { total, succeeded, failed } }`

### `manage_system` → `list_inference_rules`

List all custom Datalog inference rules stored in CozoDB. No parameters.

```json
{ "action": "list_inference_rules" }
```

Response: `{ count, rules: [{ id, name, datalog, created_at }] }`

Use this to inspect which rules are currently active and identify noisy or
outdated ones (e.g. cross-product rules that flood `infer_relations` with
irrelevant edges).

### `manage_system` → `delete_inference_rule`

Delete a custom Datalog inference rule by its ID. Useful for cleaning up
rules that produce unwanted noise (e.g. a `same_type` rule that links every
entity of the same type to every other).

Parameters: `rule_id` (required — get the ID from `list_inference_rules`).

```json
{ "action": "delete_inference_rule", "rule_id": "4d872878-1742-49f2-9ff3-52d2d107c424" }
```

Response: `{ status: "deleted", rule_id, name }` — or `{ error: "Inference rule with ID '...' not found" }`.

---

## Detailed Documentation

For comprehensive documentation including:
- Detailed action descriptions and parameters
- Inference rule examples with common mistakes
- Memory hierarchy and compression
- Best practices and performance tips
- Time-travel queries
- Parameter requirements and examples
- Troubleshooting and error handling

**See:** `docs/USAGE-GUIDE.md`

---

## Additional Resources

- **Architecture**: See `docs/ARCHITECTURE.md` for system design
- **Features**: See `docs/FEATURES.md` for detailed feature documentation
- **Performance**: See `docs/PERFORMANCE.md` for optimization tips
- **Benchmarks**: See `docs/BENCHMARKS.md` for performance metrics
