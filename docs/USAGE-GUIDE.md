# CozoDB Memory MCP Server - Usage Guide

This guide provides detailed information about using the CozoDB Memory MCP server tools.

## Quick Start

### For Simple Queries
Use `query_memory` with `action="search"`:
```json
{
  "action": "search",
  "query": "your search text",
  "limit": 10
}
```

### For Auto-Optimized Retrieval
Use `query_memory` with `action="adaptive_retrieval"`:
```json
{
  "action": "adaptive_retrieval",
  "query": "your search text",
  "limit": 10
}
```

### For Comprehensive Context
Use `query_memory` with `action="context"`:
```json
{
  "action": "context",
  "query": "your topic",
  "context_window": 5
}
```

## Query Memory Actions Reference

| Action | Best For | Key Parameters | Notes |
|--------|----------|----------------|-------|
| `search` | Quick fact retrieval, simple queries | query (required), limit, entity_types | - |
| `advancedSearch` | Filtering by type, metadata, relationships | query (required), filters, graphConstraints | - |
| `context` | Exploratory questions, understanding topics | query (required), context_window, time_range_hours | Requires query parameter |
| `entity_details` | Complete info about specific entity | entity_id (required), as_of | - |
| `history` | Tracking changes over time | entity_id (required) | - |
| `graph_rag` | Multi-hop reasoning, finding connections | query (required), max_depth, limit | - |
| `graph_walking` | Following relationship chains | query (required), start_entity_id, max_depth | - |
| `adaptive_retrieval` | ⭐ Auto-optimizing, learns from usage | query (required), limit | - |
| `dynamic_fusion` | Fine-tune vector/sparse/FTS/graph weights | query (required), config, limit | - |
| `agentic_search` | Auto-routing using local LLM | query (required), limit | - |
| `spreading_activation` | Neural-inspired semantic exploration | query (required), seed_top_k, limit | - |
| `suggest_connections` | Discover potential relationships | entity_id (required), max_suggestions | Does NOT require query parameter |
| `hierarchical_memory_query` | Query across memory hierarchy levels | query (required), levels, entity_id, limit | Returns observations from L0-L3 levels |

## Mutate Memory Actions Reference

### Core Operations
- `create_entity` - Create new entity with name, type, metadata
- `update_entity` - Update existing entity properties
- `delete_entity` - Delete entity and all related data
- `add_observation` - Store facts/notes linked to entities
- `create_relation` - Create connections between entities

### Advanced Operations
- `run_transaction` - Execute multiple operations atomically
- `add_inference_rule` - Add custom Datalog inference rules
- `ingest_file` - Bulk import from Markdown/JSON/PDF
- `start_session` / `stop_session` - Session tracking (stop_session uses `id` parameter, not `entity_id`)
- `start_task` / `stop_task` - Task tracking (stop_task uses `id` parameter, not `entity_id`)
- `invalidate_observation` - Soft-delete observation
- `invalidate_relation` - Soft-delete relationship
- `enrich_observation` - Trigger Zettelkasten enrichment
- `record_memory_access` - Track ACT-R memory activation
- `prune_weak_memories` - Delete low-activation observations
- `detect_conflicts` - Find contradictory information (entity_id required)
- `resolve_conflicts` - Auto-resolve temporal conflicts (entity_id required)

## Graph Analysis Actions Reference

| Action | Purpose | Parameters |
|--------|---------|------------|
| `explore` | Navigate graph neighborhood or find paths | start_entity, end_entity?, max_hops |
| `communities` | Detect entity groups (Label Propagation) | - |
| `pagerank` | Calculate entity importance | - |
| `betweenness` | Find central bridge entities | - |
| `hits` | Identify Hubs and Authorities | - |
| `connected_components` | Find isolated subgraphs | - |
| `shortest_path` | Calculate shortest path (Dijkstra) | start_entity, end_entity |
| `bridge_discovery` | Find bridges between communities | - |
| `infer_relations` | Run inference engine | entity_id |
| `get_relation_evolution` | Track relationship changes | from_id, to_id? |
| `semantic_walk` | Recursive semantic exploration | start_entity, max_depth, min_similarity |
| `hnsw_clusters` | Analyze HNSW vector clusters | - |
| `discover_logical_edges` | Find implicit connections | entity_id |
| `materialize_logical_edges` | Create relationships from logical edges | entity_id |
| `detect_temporal_patterns` | Find periodic/trending patterns | entity_id |

## System Management Actions Reference

| Action | Purpose | Parameters |
|--------|---------|------------|
| `health` | Status check with metrics | - |
| `metrics` | Detailed performance data | - |
| `export_memory` | Export to JSON/Markdown/Obsidian | format, filters |
| `import_memory` | Import from Mem0/MemGPT/Markdown/Cozo | data, sourceFormat |
| `snapshot_create` | Create backup point | metadata? |
| `snapshot_list` | List all snapshots | - |
| `snapshot_diff` | Compare two snapshots | snapshot_id_a, snapshot_id_b |
| `cleanup` | LLM-backed consolidation (Janitor) | confirm, older_than_days |
| `defrag` | Merge duplicates, connect islands | confirm, similarity_threshold |
| `reflect` | Analyze for contradictions/insights | entity_id?, model? |
| `clear_memory` | Reset entire database | confirm: true |
| `summarize_communities` | Hierarchical GraphRAG summaries | model?, min_community_size? |
| `compress_memory_levels` | Hierarchical compression | entity_id, level |
| `analyze_memory_distribution` | Memory level analysis | entity_id |

## User Profile Management

The special entity `global_user_profile` stores persistent user preferences:

```json
{
  "action": "add_observation",
  "entity_id": "global_user_profile",
  "text": "User prefers TypeScript over JavaScript"
}
```

User profile observations are automatically boosted in all searches (50% score boost).

## Inference Rules

When adding custom inference rules with `add_inference_rule`, the Datalog query must return exactly 5 columns:
- `from_id` - Source entity ID
- `to_id` - Target entity ID
- `relation_type` - Type of relationship
- `confidence` - Score 0-1
- `reason` - Explanation text

### Important: All Variables Must Be Bound

Every variable in the rule head (left side of `:=`) must appear in the rule body (right side). Unbound variables will cause "Symbol 'X' in rule head is unbound" errors.

### Available Tables

- `*entity{id, name, type, metadata, @ "NOW"}`
- `*relationship{from_id, to_id, relation_type, strength, metadata, @ "NOW"}`
- `*observation{id, entity_id, text, metadata, @ "NOW"}`

### Correct Example (Manager Transitivity)

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

### Common Mistakes

❌ **Wrong - Unbound variable:**
```datalog
?[from_id, to_id, relation_type, confidence, reason] := 
  *relationship{from_id: $id, to_id: mid, @ "NOW"},
  relation_type = "derived"  // relation_type not bound to data!
```

✅ **Correct - All variables bound:**
```datalog
?[from_id, to_id, relation_type, confidence, reason] := 
  *relationship{from_id: $id, to_id: mid, relation_type: rel_type, @ "NOW"},
  from_id = $id,
  to_id = mid,
  relation_type = "derived",
  confidence = 0.8,
  reason = "Direct relationship"
```

### More Examples

**Same Type Entities:**
```datalog
?[from_id, to_id, relation_type, confidence, reason] := 
  *entity{id: $id, type: entity_type, @ "NOW"},
  *entity{id: other_id, type: entity_type, @ "NOW"},
  other_id != $id,
  from_id = $id,
  to_id = other_id,
  relation_type = "same_type",
  confidence = 0.7,
  reason = "Entities share the same type"
```

**Co-occurrence in Observations:**
```datalog
?[from_id, to_id, relation_type, confidence, reason] := 
  *observation{entity_id: $id, text: text1, @ "NOW"},
  *observation{entity_id: other_id, text: text2, @ "NOW"},
  other_id != $id,
  from_id = $id,
  to_id = other_id,
  relation_type = "co_mentioned",
  confidence = 0.5,
  reason = "Entities mentioned in observations"
```

## Best Practices

1. **Start Simple**: Use `search` or `adaptive_retrieval` for most queries
2. **User Preferences**: Store in `global_user_profile` for automatic boosting
3. **Transactions**: Use `run_transaction` for related operations
4. **Sessions/Tasks**: Track context for better retrieval
5. **Dry Run**: Test `cleanup` and `defrag` with `confirm: false` first
6. **Inference**: Start with built-in inference before adding custom rules
7. **Export Regularly**: Use `export_memory` for backups

## Parameter Naming Guide

The API uses consistent parameter naming with a few exceptions:

- **entity_id** - Used for entity references in most operations (create_relation, add_observation, detect_conflicts, etc.)
- **id** - Used for updating/stopping sessions and tasks (stop_session, stop_task, update_entity)
- **observation_id** - Used specifically for observation operations (invalidate_observation, enrich_observation, record_memory_access)
- **from_id / to_id** - Used for relationship operations (create_relation, invalidate_relation)

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

## Performance Tips

- `adaptive_retrieval` learns over time - use it consistently
- `rerank: true` improves precision but adds latency
- `session_id` and `task_id` boost relevant results
- `entity_types` filter reduces search space
- `dynamic_fusion` allows fine-tuning for specific use cases

## Time-Travel Queries

All data supports temporal queries via CozoDB Validity:
- Use `as_of` parameter in `entity_details` for historical state
- Use `history` action to see entity evolution
- Use `get_relation_evolution` to track relationship changes

## Memory Hierarchy

Observations are organized in 4 levels:
- **L0_RAW (0)** - Raw, unprocessed observations (default for new observations)
- **L1_SESSION (1)** - Session-level summaries (created via compression)
- **L2_WEEKLY (2)** - Weekly consolidation (created via compression)
- **L3_MONTHLY (3)** - Long-term memory (created via compression)

### Working with Memory Levels

**Query specific levels:**
```json
{
  "action": "hierarchical_memory_query",
  "query": "project updates",
  "levels": [1, 2],
  "limit": 10
}
```

**Compress observations to higher levels:**
```json
{
  "action": "compress_memory_levels",
  "entity_id": "project-123",
  "level": 1
}
```

**Analyze memory distribution:**
```json
{
  "action": "analyze_memory_distribution",
  "entity_id": "project-123"
}
```

### Notes

- New observations start at L0_RAW (memory_level: 0)
- Use `compress_memory_levels` to create L1/L2/L3 summaries
- `hierarchical_memory_query` searches across all levels by default
- Higher levels (L2, L3) contain compressed/summarized information
- Use `levels` parameter to filter specific memory levels
