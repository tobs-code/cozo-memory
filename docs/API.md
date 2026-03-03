# API Reference

Complete reference for all MCP tools in CozoDB Memory.

## Overview

The interface is reduced to **4 consolidated tools**. The concrete operation is always chosen via `action`.

| Tool | Purpose | Key Actions |
|------|---------|-------------|
| `mutate_memory` | Write operations | create_entity, update_entity, delete_entity, add_observation, create_relation, start_session, stop_session, start_task, stop_task, run_transaction, add_inference_rule, ingest_file, invalidate_observation, invalidate_relation, **enrich_observation**, **record_memory_access**, **prune_weak_memories**, **detect_conflicts**, **resolve_conflicts** |
| `query_memory` | Read operations | search, advancedSearch, context, entity_details, history, graph_rag, graph_walking, agentic_search, dynamic_fusion, adaptive_retrieval, **get_zettelkasten_stats**, **get_activation_stats**, **get_salience_stats**, **suggest_connections**, **spreading_activation** |
| `analyze_graph` | Graph analysis | explore, communities, pagerank, betweenness, hits, shortest_path, bridge_discovery, semantic_walk, infer_relations, get_relation_evolution |
| `manage_system` | Maintenance | health, metrics, export_memory, import_memory, snapshot_create, snapshot_list, snapshot_diff, cleanup, defrag, reflect, summarize_communities, clear_memory, compact |

---

## mutate_memory (Write)

Write operations for creating and modifying memory.

### Actions

#### create_entity

Creates a new entity in the knowledge graph.

**Parameters:**
- `name` (required): Entity name
- `type` (required): Entity type (Person, Project, Concept, etc.)
- `metadata` (optional): JSON object with custom attributes

**Example:**
```json
{
  "action": "create_entity",
  "name": "Alice",
  "type": "Person",
  "metadata": { "role": "Dev", "team": "Backend" }
}
```

#### update_entity

Updates an existing entity.

**Parameters:**
- `id` (required): Entity ID
- `name` (optional): New name
- `type` (optional): New type
- `metadata` (optional): Metadata to merge (uses JSON Merge Operator `++`)

**Example:**
```json
{
  "action": "update_entity",
  "id": "ENTITY_ID",
  "metadata": { "status": "active" }
}
```

#### delete_entity

Deletes an entity and all related data.

**Parameters:**
- `entity_id` (required): Entity ID to delete

**Returns:** Deletion statistics (observations, outgoing_relations, incoming_relations)

**Example:**
```json
{
  "action": "delete_entity",
  "entity_id": "ENTITY_ID"
}
```

#### add_observation

Adds a fact or note to an entity.

**Parameters:**
- `entity_id` OR `entity_name` (required): Target entity
- `entity_type` (optional): Entity type if creating new entity via name
- `text` (required): Observation content
- `metadata` (optional): Custom attributes
- `deduplicate` (optional): Enable duplicate detection (default: true)

**Returns:** 
- Success: `{ id, entity_id, text, ... }`
- Duplicate: `{ status: "duplicate_detected", existing_observation_id, similarity }`

**Example:**
```json
{
  "action": "add_observation",
  "entity_id": "ENTITY_ID",
  "text": "Alice is working on the feature flag system.",
  "metadata": { "source": "meeting_notes" }
}
```

#### create_relation

Creates a relationship between two entities.

**Parameters:**
- `from_id` (required): Source entity ID
- `to_id` (required): Target entity ID
- `relation_type` (required): Relationship type (works_on, knows, related_to, etc.)
- `strength` (optional): Confidence score 0.0-1.0 (default: 1.0)
- `metadata` (optional): Custom attributes

**Note:** Self-references (`from_id === to_id`) are rejected.

**Example:**
```json
{
  "action": "create_relation",
  "from_id": "ALICE_ID",
  "to_id": "PROJECT_ID",
  "relation_type": "works_on",
  "strength": 0.9
}
```

#### start_session / stop_session

Manages session contexts for multi-level memory.

**start_session Parameters:**
- `name` (optional): Session name
- `metadata` (optional): Session metadata (user_id, project, etc.)

**stop_session Parameters:**
- `session_id` (required): Session ID to close

**Example:**
```json
{ "action": "start_session", "name": "Project Planning", "metadata": { "user_id": "alice" } }
{ "action": "stop_session", "session_id": "SESSION_ID" }
```

#### start_task / stop_task

Manages tasks within sessions.

**start_task Parameters:**
- `name` (required): Task name
- `session_id` (optional): Parent session ID
- `metadata` (optional): Task metadata

**stop_task Parameters:**
- `task_id` (required): Task ID to complete

**Example:**
```json
{ "action": "start_task", "name": "Implement Auth", "session_id": "SESSION_ID" }
{ "action": "stop_task", "task_id": "TASK_ID" }
```

#### run_transaction

Executes multiple operations atomically.

**Parameters:**
- `operations` (required): Array of operations with `action` and `params`

**Supported actions:** create_entity, add_observation, create_relation, delete_entity

**Example:**
```json
{
  "action": "run_transaction",
  "operations": [
    { "action": "create_entity", "params": { "name": "Bob", "type": "Person" } },
    { "action": "add_observation", "params": { "entity_name": "Bob", "text": "Joined team" } }
  ]
}
```

#### add_inference_rule

Adds a custom Datalog inference rule.

**Parameters:**
- `name` (required): Rule name
- `datalog` (required): Datalog query returning `[from_id, to_id, relation_type, confidence, reason]`

**Placeholder:** Use `$id` for the start entity.

**Example:**
```json
{
  "action": "add_inference_rule",
  "name": "upper_manager",
  "datalog": "?[from_id, to_id, relation_type, confidence, reason] :=\n  *relationship{from_id: $id, to_id: mid, relation_type: \"manager_of\", @ \"NOW\"},\n  *relationship{from_id: mid, to_id: target, relation_type: \"manager_of\", @ \"NOW\"},\n  from_id = $id,\n  to_id = target,\n  relation_type = \"upper_manager_of\",\n  confidence = 0.6,\n  reason = \"Transitive manager path\""
}
```

#### ingest_file

Bulk imports documents (Markdown/JSON/PDF).

**Parameters:**
- `format` (required): "markdown", "json", or "pdf"
- `file_path` OR `content` (required): File path or content string
- `entity_id` OR `entity_name` (required): Target entity
- `entity_type` (optional): Entity type if creating new
- `chunking` (optional): "none" or "paragraphs" (default: "paragraphs")
- `deduplicate` (optional): Enable duplicate detection (default: true)
- `max_observations` (optional): Limit number of observations
- `metadata` (optional): Entity metadata
- `observation_metadata` (optional): Metadata for all observations

**Example (Markdown):**
```json
{
  "action": "ingest_file",
  "entity_name": "Project Documentation",
  "format": "markdown",
  "chunking": "paragraphs",
  "content": "# Title\n\nSection 1...\n\nSection 2...",
  "deduplicate": true
}
```

**Example (PDF):**
```json
{
  "action": "ingest_file",
  "entity_name": "Research Paper",
  "format": "pdf",
  "file_path": "/path/to/document.pdf",
  "chunking": "paragraphs"
}
```

#### invalidate_observation / invalidate_relation

Soft-deletes observations or relationships using CozoDB Validity.

**invalidate_observation Parameters:**
- `observation_id` (required): Observation ID to retract

**invalidate_relation Parameters:**
- `from_id` (required): Source entity ID
- `to_id` (required): Target entity ID
- `relation_type` (required): Relationship type

**Note:** Invalidated data is hidden from current views but preserved in history.

**Example:**
```json
{ "action": "invalidate_observation", "observation_id": "OBS_ID" }
{ "action": "invalidate_relation", "from_id": "ID1", "to_id": "ID2", "relation_type": "works_on" }
```

#### enrich_observation

Manually triggers Zettelkasten enrichment for an observation.

**Parameters:**
- `observation_id` (required): Observation ID to enrich

**Returns:** Enrichment result with keywords, tags, links, and related notes

**Features:**
- Extracts keywords from observation text
- Extracts hashtags as tags
- Finds semantically similar observations (HNSW)
- Creates bidirectional links between related observations
- Updates metadata with enrichment information

**Example:**
```json
{
  "action": "enrich_observation",
  "observation_id": "OBS_ID"
}
```

**Response:**
```json
{
  "observationId": "OBS_ID",
  "extractedKeywords": ["machine", "learning", "neural", "networks"],
  "addedTags": ["ai", "ml"],
  "createdLinks": 3,
  "relatedNotes": [
    { "observationId": "...", "similarity": 0.85, "text": "..." }
  ],
  "updatedMetadata": { "zettelkasten_enriched": true, ... },
  "evolutionSummary": "Enriched with 4 keywords, 2 tags, and 3 bidirectional links"
}
```

#### record_memory_access

Records access to an observation for ACT-R memory activation tracking.

**Parameters:**
- `observation_id` (required): Observation ID to record access for

**Returns:** Success confirmation

**Features:**
- Increments `access_count` in observation metadata
- Updates `last_access_time` timestamp
- Increases memory strength (S = S₀ + n × Δ)
- Affects activation score (R = e^(-t/S))

**Example:**
```json
{
  "action": "record_memory_access",
  "observation_id": "OBS_ID"
}
```

**Response:**
```json
{
  "success": true,
  "observation_id": "OBS_ID",
  "message": "Access recorded successfully"
}
```

#### prune_weak_memories

Deletes observations with activation below retention threshold.

**Parameters:**
- `dry_run` (optional): If true, only shows candidates without deleting (default: true)
- `entity_id` (optional): Only prune memories for specific entity

**Returns:** Pruning statistics with candidates

**Features:**
- Calculates activation scores for all observations
- Identifies observations below retention threshold (default: 0.15)
- Respects emotional salience boosts (slower decay)
- Dry-run mode for safe preview

**Example (Dry Run):**
```json
{
  "action": "prune_weak_memories",
  "dry_run": true,
  "entity_id": "ENTITY_ID"
}
```

**Example (Actual Prune):**
```json
{
  "action": "prune_weak_memories",
  "dry_run": false
}
```

**Response:**
```json
{
  "pruned": 5,
  "preserved": 15,
  "candidates": [
    {
      "observationId": "...",
      "entityId": "...",
      "activation": 0.08,
      "strength": 1.0,
      "timeSinceAccess": 30.5,
      "accessCount": 0,
      "shouldRetain": false,
      "reason": "Below threshold (activation: 0.080 < 0.15)"
    }
  ]
}
```

#### detect_conflicts

Detects temporal conflicts for an entity's observations.

**Parameters:**
- `entity_id` (required): Entity ID to detect conflicts for

**Returns:** List of detected conflicts with details

**Conflict Types:**
- Temporal Redundancy: Highly similar observations (likely duplicates)
- Semantic Contradiction: Contradictory statements detected
- Superseded Fact: Newer information updates older facts

**Example:**
```json
{
  "action": "detect_conflicts",
  "entity_id": "ENTITY_ID"
}
```

**Response:**
```json
{
  "entity_id": "ENTITY_ID",
  "count": 2,
  "conflicts": [
    {
      "older_observation_id": "OBS_1",
      "newer_observation_id": "OBS_2",
      "older_text": "Project status is pending",
      "newer_text": "Project status is completed",
      "older_time": 1640000000000,
      "newer_time": 1640100000000,
      "conflict_type": "superseded_fact",
      "confidence": 0.75,
      "confidence_level": "high",
      "reason": "Newer observation updates or supersedes older information",
      "entity_id": "ENTITY_ID",
      "entity_name": "Project Alpha"
    }
  ]
}
```

#### resolve_conflicts

Resolves temporal conflicts by invalidating older observations.

**Parameters:**
- `entity_id` (required): Entity ID to resolve conflicts for
- `auto_resolve` (optional): Automatically resolve all conflicts (default: false)

**Returns:** Resolution statistics with audit trail

**Features:**
- Invalidates older conflicting observations
- Creates audit trail observations (if enabled)
- Preserves conflict metadata for transparency
- Safe operation with detailed logging

**Example:**
```json
{
  "action": "resolve_conflicts",
  "entity_id": "ENTITY_ID",
  "auto_resolve": true
}
```

**Response:**
```json
{
  "resolved_conflicts": 2,
  "invalidated_observations": ["OBS_1", "OBS_3"],
  "audit_observations": ["AUDIT_1", "AUDIT_2"],
  "conflicts": [
    {
      "older_observation_id": "OBS_1",
      "newer_observation_id": "OBS_2",
      "conflict_type": "superseded_fact",
      "confidence": 0.75,
      "reason": "Newer observation updates or supersedes older information"
    }
  ]
}
```

---

## query_memory (Read)

Read operations for searching and retrieving memory.

### Actions

#### search

Basic hybrid search combining vector, keyword, and graph signals.

**Parameters:**
- `query` (required): Search query
- `limit` (optional): Max results (default: 10)
- `entity_types` (optional): Filter by entity types
- `include_entities` (optional): Include entities in results (default: true)
- `include_observations` (optional): Include observations (default: true)
- `rerank` (optional): Enable Cross-Encoder reranking (default: false)

**Example:**
```json
{
  "action": "search",
  "query": "Feature Flag",
  "limit": 10,
  "rerank": true
}
```

#### advancedSearch

Advanced search with metadata filters and graph constraints.

**Parameters:**
- `query` (required): Search query
- `limit` (optional): Max results
- `filters` (optional): Filtering options
  - `entityTypes`: Array of entity types
  - `metadata`: Key-value map for exact matches
- `graphConstraints` (optional): Graph filtering
  - `requiredRelations`: Array of required relationship types
  - `targetEntityIds`: Array of target entity IDs
- `vectorOptions` (optional): Vector search options
  - `topK`: Number of vector candidates
  - `efSearch`: HNSW search parameter
- `rerank` (optional): Enable reranking

**Example:**
```json
{
  "action": "advancedSearch",
  "query": "Manager",
  "filters": {
    "metadata": { "role": "Lead" }
  },
  "graphConstraints": {
    "requiredRelations": ["works_with"]
  }
}
```

#### context

Retrieves comprehensive context for a query.

**Parameters:**
- `query` (required): Context query
- `context_window` (optional): Number of results (default: 20)
- `time_range_hours` (optional): Filter by time range
- `session_id` (optional): Boost session context
- `task_id` (optional): Boost task context

**Returns:** JSON with entities, observations, graph connections, inference suggestions

**Example:**
```json
{
  "action": "context",
  "query": "What is Alice working on right now?",
  "context_window": 20,
  "time_range_hours": 24
}
```

#### entity_details

Gets detailed information about a specific entity.

**Parameters:**
- `entity_id` (required): Entity ID
- `as_of` (optional): ISO timestamp or "NOW" for time-travel

**Example:**
```json
{
  "action": "entity_details",
  "entity_id": "ENTITY_ID",
  "as_of": "2026-01-15T10:00:00Z"
}
```

#### history

Retrieves the complete history of an entity.

**Parameters:**
- `entity_id` (required): Entity ID

**Example:**
```json
{
  "action": "history",
  "entity_id": "ENTITY_ID"
}
```

#### graph_rag

Graph-based reasoning with vector seeds and graph expansion.

**Parameters:**
- `query` (required): Search query
- `max_depth` (optional): Max traversal depth (default: 2)
- `limit` (optional): Max results
- `filters` (optional): Entity type filters
- `rerank` (optional): Enable reranking

**Example:**
```json
{
  "action": "graph_rag",
  "query": "What is Alice working on?",
  "max_depth": 2,
  "limit": 10
}
```

#### graph_walking

Recursive semantic graph search following relationships.

**Parameters:**
- `query` (required): Search query
- `start_entity_id` (optional): Starting entity
- `max_depth` (optional): Max traversal depth (default: 3)
- `limit` (optional): Max results

**Example:**
```json
{
  "action": "graph_walking",
  "query": "TypeScript experts",
  "max_depth": 3
}
```

#### agentic_search

Auto-routing search using LLM to select optimal strategy.

**Parameters:**
- `query` (required): Search query
- `limit` (optional): Max results
- `rerank` (optional): Enable reranking

**Strategies:** vector_search, graph_walk, community_summary

**Example:**
```json
{
  "action": "agentic_search",
  "query": "Tell me about the authentication system",
  "limit": 10
}
```

#### adaptive_retrieval

GraphRAG-R1 inspired adaptive retrieval with automatic strategy selection.

**Parameters:**
- `query` (required): Search query
- `limit` (optional): Max results

**Strategies:** Vector-Only, Graph-Walk, Hybrid-Fusion, Community-Expansion, Semantic-Walk

**Features:**
- Progressive Retrieval Attenuation (PRA)
- Cost-Aware F1 (CAF) scoring
- Learns from historical performance

**Example:**
```json
{
  "action": "adaptive_retrieval",
  "query": "How does the payment system work?",
  "limit": 10
}
```

#### dynamic_fusion

Advanced 4-path retrieval with configurable weights and fusion strategies.

**Parameters:**
- `query` (required): Search query
- `limit` (optional): Max results
- `config` (optional): Fusion configuration
  - `vector`: Dense vector search config
  - `sparse`: Sparse vector search config
  - `fts`: Full-text search config
  - `graph`: Graph traversal config
  - `fusion`: Fusion strategy config

**Example:**
```json
{
  "action": "dynamic_fusion",
  "query": "database with graph capabilities",
  "limit": 10,
  "config": {
    "vector": { "enabled": true, "weight": 0.4 },
    "sparse": { "enabled": true, "weight": 0.3 },
    "fts": { "enabled": true, "weight": 0.2 },
    "graph": { "enabled": true, "weight": 0.1 },
    "fusion": { "strategy": "rrf" }
  }
}
```

> **See [FEATURES.md](../FEATURES.md) for detailed dynamic_fusion configuration**

#### get_zettelkasten_stats

Gets Zettelkasten Memory Evolution statistics.

**Parameters:** None

**Returns:** Statistics about observation enrichment and evolution

**Example:**
```json
{
  "action": "get_zettelkasten_stats"
}
```

**Response:**
```json
{
  "totalObservations": 150,
  "enrichedObservations": 45,
  "totalLinks": 120,
  "averageLinksPerNote": 2.67,
  "topKeywords": [
    { "keyword": "machine", "frequency": 15 },
    { "keyword": "learning", "frequency": 12 }
  ],
  "topTags": [
    { "tag": "ai", "count": 20 },
    { "tag": "ml", "count": 18 }
  ],
  "connectionTypes": {
    "semantic": 85,
    "manual": 35
  }
}
```

#### get_activation_stats

Gets ACT-R Memory Activation statistics.

**Parameters:**
- `entity_id` (optional): Filter by specific entity

**Returns:** Activation distribution and statistics

**Features:**
- Shows activation score distribution
- Identifies weak memories below threshold
- Calculates average activation and strength
- Supports entity-specific or global stats

**Example:**
```json
{
  "action": "get_activation_stats",
  "entity_id": "ENTITY_ID"
}
```

**Response:**
```json
{
  "totalObservations": 50,
  "averageActivation": 0.65,
  "averageStrength": 3.2,
  "belowThreshold": 5,
  "aboveThreshold": 45,
  "distribution": {
    "veryWeak": 2,
    "weak": 3,
    "moderate": 15,
    "strong": 20,
    "veryStrong": 10
  }
}
```

#### get_salience_stats

Gets Emotional Salience statistics.

**Parameters:** None

**Returns:** Statistics about emotional salience distribution and keywords

**Features:**
- Shows distribution across salience levels (high/medium/low/neutral)
- Calculates average salience score
- Identifies top emotional keywords
- Counts observations with significant salience (≥0.3)

**Example:**
```json
{
  "action": "get_salience_stats"
}
```

**Response:**
```json
{
  "totalObservations": 100,
  "withSalience": 35,
  "averageSalience": 0.42,
  "distribution": {
    "high": 12,
    "medium": 18,
    "low": 5,
    "neutral": 65
  },
  "topKeywords": [
    { "keyword": "urgent", "frequency": 8 },
    { "keyword": "critical", "frequency": 6 },
    { "keyword": "important", "frequency": 5 }
  ]
}
```

#### suggest_connections

Suggests potential connections for an entity using multiple discovery strategies.

**Parameters:**
- `entity_id` (required): Entity ID to suggest connections for
- `max_suggestions` (optional): Maximum number of suggestions (default: 10)
- `min_confidence` (optional): Minimum confidence threshold 0.0-1.0 (default: 0.5)

**Returns:** Connection suggestions with confidence scores and reasoning

**Discovery Strategies:**
- Vector Similarity: Semantically similar entities
- Common Neighbors: Entities sharing connections
- Graph Proximity: Nearby entities in knowledge graph
- Inference: Implicit relationships via logical rules

**Example:**
```json
{
  "action": "suggest_connections",
  "entity_id": "ENTITY_ID",
  "max_suggestions": 10,
  "min_confidence": 0.5
}
```

**Response:**
```json
{
  "entity_id": "ENTITY_ID",
  "count": 5,
  "suggestions": [
    {
      "entity_id": "TARGET_ID",
      "entity_name": "Bob",
      "entity_type": "Person",
      "source": "common_neighbors",
      "confidence": 0.85,
      "confidence_level": "high",
      "reason": "Shares 3 common connection(s) with Alice",
      "metadata": {
        "common_neighbors_count": 3,
        "relation_types": ["works_on", "knows"]
      }
    }
  ]
}
```

#### spreading_activation

SYNAPSE spreading activation search using neural-inspired activation propagation.

**Parameters:**
- `query` (required): Search query
- `seed_top_k` (optional): Number of seed nodes to start from (default: 5)
- `limit` (optional): Maximum number of results (default: 30)

**Returns:** Activation scores with propagation details

**Features:**
- Fan Effect: Activation spreads inversely to out-degree
- Lateral Inhibition: Top nodes suppress weaker competitors
- Sigmoid Activation: Non-linear activation function
- Temporal Decay: Recent relationships weighted higher
- Convergence Detection: Stops when activation stabilizes

**Example:**
```json
{
  "action": "spreading_activation",
  "query": "neural networks",
  "seed_top_k": 5,
  "limit": 30
}
```

**Response:**
```json
{
  "scores": [
    {
      "entityId": "ENTITY_ID",
      "activation": 0.85,
      "potential": 0.82,
      "source": "seed",
      "hops": 0
    },
    {
      "entityId": "ENTITY_ID_2",
      "activation": 0.65,
      "potential": 0.63,
      "source": "propagated",
      "hops": 2
    }
  ],
  "iterations": 3,
  "converged": true,
  "seedNodes": ["SEED_ID_1", "SEED_ID_2"],
  "totalResults": 15
}
```

---

#### qafd_search

Query-Aware Flow Diffusion search using dynamic edge weighting and flow diffusion algorithm.

**Parameters:**
- `query` (required): Search query
- `seed_top_k` (optional): Number of seed nodes (default: 5)
- `max_hops` (optional): Maximum traversal depth (default: 3)
- `damping_factor` (optional): Flow damping factor (default: 0.85)
- `min_score` (optional): Minimum score threshold (default: 0.05)
- `limit` (optional): Maximum results (default: 30)

**Returns:** Ranked results with flow scores and hop distances

**Features:**
- Dynamic Edge Weighting: Edges weighted by query relevance
- Flow Diffusion: Iterative flow propagation through graph
- Multi-hop Reasoning: Discovers indirect connections
- Score Normalization: Consistent scoring across hops

**Example:**
```json
{
  "action": "qafd_search",
  "query": "artificial intelligence and neural networks",
  "seed_top_k": 3,
  "max_hops": 2,
  "limit": 20
}
```

**Response:**
```json
[
  {
    "entity_id": "ENTITY_ID",
    "name": "Machine Learning",
    "score": 0.92,
    "hops": 0,
    "path": ["ENTITY_ID"]
  },
  {
    "entity_id": "ENTITY_ID_2",
    "name": "Deep Learning",
    "score": 0.78,
    "hops": 1,
    "path": ["ENTITY_ID", "ENTITY_ID_2"]
  }
]
```

---

#### hierarchical_memory_query

Multi-level memory query across L0-L3 hierarchical levels.

**Parameters:**
- `query` (required): Search query
- `levels` (optional): Array of levels to query [0-3] (default: all levels)
- `limit` (optional): Maximum results per level (default: 10)

**Memory Levels:**
- L0 (Raw): Recent observations (< 24 hours)
- L1 (Session): Session summaries (< 7 days)
- L2 (Weekly): Weekly summaries (< 30 days)
- L3 (Monthly): Long-term summaries (> 30 days)

**Returns:** Observations grouped by memory level with distances

**Example:**
```json
{
  "action": "hierarchical_memory_query",
  "query": "neural networks and deep learning",
  "levels": [0, 1],
  "limit": 5
}
```

**Response:**
```json
{
  "observations": [
    {
      "id": "OBS_ID",
      "entity_id": "ENTITY_ID",
      "text": "Neural networks are inspired by biological neurons",
      "memory_level": 0,
      "distance": 0.15
    },
    {
      "id": "OBS_ID_2",
      "entity_id": "ENTITY_ID_2",
      "text": "Deep learning uses multiple layers",
      "memory_level": 1,
      "distance": 0.23
    }
  ],
  "by_level": {
    "0": 3,
    "1": 2
  },
  "total": 5
}
```

---

## analyze_graph (Analysis)

Graph analysis and traversal operations.

### Actions

#### explore

Explores the graph neighborhood or finds shortest path.

**Parameters:**
- `start_entity` (required): Starting entity ID
- `end_entity` (optional): Target entity ID (for shortest path)
- `max_hops` (optional): Max traversal depth (default: 5)
- `relation_types` (optional): Filter by relationship types

**Behavior:**
- With `end_entity`: Returns shortest path (BFS)
- Without `end_entity`: Returns neighborhood up to max_hops

**Example:**
```json
{
  "action": "explore",
  "start_entity": "ENTITY_ID",
  "max_hops": 3,
  "relation_types": ["works_on", "knows"]
}
```

#### communities

Recalculates entity communities using Label Propagation.

**Parameters:** None

**Example:**
```json
{
  "action": "communities"
}
```

#### pagerank

Calculates PageRank scores for all entities.

**Parameters:** None

**Returns:** Top entities by importance

**Example:**
```json
{
  "action": "pagerank"
}
```

#### betweenness

Calculates Betweenness Centrality (bridge elements).

**Parameters:** None

**Example:**
```json
{
  "action": "betweenness"
}
```

#### hits

Calculates HITS scores (Hubs & Authorities).

**Parameters:** None

**Example:**
```json
{
  "action": "hits"
}
```

#### connected_components

Identifies isolated subgraphs.

**Parameters:** None

**Example:**
```json
{
  "action": "connected_components"
}
```

#### shortest_path

Calculates shortest path between two entities using Dijkstra.

**Parameters:**
- `start_entity` (required): Source entity ID
- `end_entity` (required): Target entity ID

**Returns:** Distance and path reconstruction

**Example:**
```json
{
  "action": "shortest_path",
  "start_entity": "ID_A",
  "end_entity": "ID_B"
}
```

#### bridge_discovery

Finds entities acting as bridges between communities.

**Parameters:** None

**Example:**
```json
{
  "action": "bridge_discovery"
}
```

#### semantic_walk

Recursive semantic graph search following relationships and similarity.

**Parameters:**
- `start_entity` (required): Starting entity ID
- `max_depth` (optional): Max traversal depth (default: 3)
- `min_similarity` (optional): Min similarity threshold (default: 0.5)

**Example:**
```json
{
  "action": "semantic_walk",
  "start_entity": "ENTITY_ID",
  "max_depth": 3,
  "min_similarity": 0.6
}
```

#### hnsw_clusters

Analyzes clusters on HNSW graph (Layer 0).

**Parameters:** None

**Example:**
```json
{
  "action": "hnsw_clusters"
}
```

#### infer_relations

Discovers implicit relationships using inference engine.

**Parameters:**
- `entity_id` (required): Entity ID

**Example:**
```json
{
  "action": "infer_relations",
  "entity_id": "ENTITY_ID"
}
```

#### get_relation_evolution

Tracks temporal development of relationships.

**Parameters:**
- `from_id` (required): Source entity ID
- `to_id` (optional): Target entity ID
- `since` (optional): Start timestamp
- `until` (optional): End timestamp

**Example:**
```json
{
  "action": "get_relation_evolution",
  "from_id": "ID1",
  "to_id": "ID2"
}
```

#### discover_logical_edges

Discovers implicit logical edges for an entity based on same category, type, hierarchical relationships, contextual similarity, and transitive connections.

**Parameters:**
- `entity_id` (required): Entity ID to discover logical edges for

**Returns:**
- `edge_count`: Number of logical edges discovered
- `edges`: Array of logical edge objects with type, confidence, and reason

**Example:**
```json
{
  "action": "discover_logical_edges",
  "entity_id": "ENTITY_ID"
}
```

#### materialize_logical_edges

Materializes discovered logical edges as actual relationships in the graph.

**Parameters:**
- `entity_id` (required): Entity ID to materialize logical edges for

**Returns:**
- `materialized_count`: Number of edges materialized as relationships

**Example:**
```json
{
  "action": "materialize_logical_edges",
  "entity_id": "ENTITY_ID"
}
```

#### detect_temporal_patterns

Detects temporal patterns in entity observations (periodic, trending, seasonal).

**Parameters:**
- `entity_id` (required): Entity ID to analyze

**Returns:**
- `observation_count`: Number of observations analyzed
- `patterns`: Array of detected patterns with type, confidence, and description
- `time_range`: Start and end timestamps of observations

**Example:**
```json
{
  "action": "detect_temporal_patterns",
  "entity_id": "ENTITY_ID"
}
```

---

## manage_system (Maintenance)

System maintenance and monitoring operations.

### Actions

#### health

Returns system status and statistics.

**Parameters:** None

**Returns:**
- Database counts (entities, observations, relationships)
- Embedding cache statistics
- Performance metrics

**Example:**
```json
{
  "action": "health"
}
```

#### metrics

Returns detailed operational metrics.

**Parameters:** None

**Returns:**
- Operation counts by type
- Error statistics
- Performance data

**Example:**
```json
{
  "action": "metrics"
}
```

#### export_memory

Exports memory to various formats.

**Parameters:**
- `format` (required): "json", "markdown", or "obsidian"
- `includeMetadata` (optional): Include metadata (default: true)
- `includeRelationships` (optional): Include relationships (default: true)
- `includeObservations` (optional): Include observations (default: true)
- `entityTypes` (optional): Filter by entity types
- `since` (optional): Unix timestamp in ms

**Example:**
```json
{
  "action": "export_memory",
  "format": "obsidian",
  "includeMetadata": true,
  "entityTypes": ["Person", "Project"]
}
```

#### import_memory

Imports memory from external sources.

**Parameters:**
- `data` (required): Import data (string or object)
- `sourceFormat` (required): "mem0", "memgpt", "markdown", or "cozo"
- `mergeStrategy` (optional): "skip", "overwrite", or "merge" (default: "skip")
- `defaultEntityType` (optional): Default entity type

**Example:**
```json
{
  "action": "import_memory",
  "sourceFormat": "mem0",
  "data": "{\"user_id\": \"alice\", \"memories\": [...]}",
  "mergeStrategy": "skip"
}
```

#### snapshot_create / snapshot_list / snapshot_diff

Manages memory snapshots.

**snapshot_create Parameters:**
- `metadata` (optional): Snapshot metadata

**snapshot_list Parameters:** None

**snapshot_diff Parameters:**
- `snapshot_id_a` (required): First snapshot ID
- `snapshot_id_b` (required): Second snapshot ID

**Example:**
```json
{ "action": "snapshot_create", "metadata": { "label": "before_cleanup" } }
{ "action": "snapshot_list" }
{ "action": "snapshot_diff", "snapshot_id_a": "ID1", "snapshot_id_b": "ID2" }
```

#### cleanup

LLM-backed memory cleanup with hierarchical summarization.

**Parameters:**
- `confirm` (required): Must be true to execute
- `older_than_days` (optional): Age threshold (default: 30)
- `max_observations` (optional): Max observations per entity (default: 20)
- `min_entity_degree` (optional): Min connections (default: 2)
- `model` (optional): Ollama model (default: "demyagent-4b-i1:Q6_K")

**Behavior:**
- With `confirm: false`: Dry-run (shows candidates)
- With `confirm: true`: Executes cleanup

**Example:**
```json
{
  "action": "cleanup",
  "confirm": true,
  "older_than_days": 60,
  "model": "llama3.2:3b"
}
```

#### defrag

Memory defragmentation (duplicate detection, island connection, orphan removal).

**Parameters:**
- `confirm` (required): Must be true to execute
- `similarity_threshold` (optional): Duplicate threshold 0.8-1.0 (default: 0.95)
- `min_island_size` (optional): Island size threshold 1-10 (default: 3)

**Behavior:**
- With `confirm: false`: Dry-run (shows analysis)
- With `confirm: true`: Executes defragmentation

**Example:**
```json
{
  "action": "defrag",
  "confirm": true,
  "similarity_threshold": 0.9
}
```

#### compact

Manual context compaction with LLM summarization.

**Parameters:**
- `session_id` (optional): Compact specific session
- `entity_id` (optional): Compact specific entity
- `model` (optional): Ollama model

**Modes:**
- **Session Mode**: `{ session_id, model? }`
- **Entity Mode**: `{ entity_id, model? }`
- **Global Mode**: `{}` (no parameters)

**Example:**
```json
{ "action": "compact", "session_id": "SESSION_ID" }
{ "action": "compact", "entity_id": "ENTITY_ID" }
{ "action": "compact" }
```

#### summarize_communities

Hierarchical GraphRAG: generates community summaries via LLM.

**Parameters:**
- `model` (optional): Ollama model
- `min_community_size` (optional): Min community size (default: 3)

**Example:**
```json
{
  "action": "summarize_communities",
  "model": "llama3.2:3b",
  "min_community_size": 5
}
```

#### reflect

Memory reflection: analyzes for contradictions and insights.

**Parameters:**
- `entity_id` (optional): Specific entity (default: top 5 active)
- `mode` (optional): "summary" or "discovery" (default: "summary")
- `model` (optional): Ollama model

**Modes:**
- **summary**: Generates reflective insight observation
- **discovery**: Finds and validates relationships via LLM

**Example:**
```json
{
  "action": "reflect",
  "entity_id": "ENTITY_ID",
  "mode": "discovery"
}
```

#### clear_memory

Resets the entire database.

**Parameters:**
- `confirm` (required): Must be `true`

**Example:**
```json
{
  "action": "clear_memory",
  "confirm": true
}
```

#### compress_memory_levels

Hierarchical memory compression. Compresses observations at a specific memory level using LLM summarization.

**Parameters:**
- `entity_id` (required): Entity ID to compress
- `level` (required): Memory level (0-3)
  - 0: L0_RAW (24 hour retention)
  - 1: L1_SESSION (7 day retention)
  - 2: L2_WEEKLY (30 day retention)
  - 3: L3_MONTHLY (365 day retention)

**Returns:**
- Compression result with summary ID, preserved/deleted counts
- Or status indicating no compression needed

**Example:**
```json
{
  "action": "compress_memory_levels",
  "entity_id": "ENTITY_ID",
  "level": 0
}
```

#### analyze_memory_distribution

Analyzes memory distribution across hierarchical levels for an entity.

**Parameters:**
- `entity_id` (required): Entity ID to analyze

**Returns:**
- Total observation count
- Distribution across L0-L3 levels
- Average importance score

**Example:**
```json
{
  "action": "analyze_memory_distribution",
  "entity_id": "ENTITY_ID"
}
```

---
- `confirm` (required): Must be true

**Example:**
```json
{
  "action": "clear_memory",
  "confirm": true
}
```

---

## See Also

- [Architecture](ARCHITECTURE.md) - System architecture and data model
- [Benchmarks](BENCHMARKS.md) - Performance metrics
- [User Profiling](USER-PROFILING.md) - Preference management
- [Features](FEATURES.md) - Detailed feature documentation
