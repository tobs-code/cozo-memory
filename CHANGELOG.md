# Changelog

All notable changes to CozoDB Memory will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.16.0] - 2026-03-03

### Changed
- **MCP Tool Descriptions Refactored**: Shortened tool descriptions following Anthropic's official MCP server best practices
  - Reduced `query_memory` description from 60+ lines to 6 lines
  - Reduced `mutate_memory` description from 30+ lines to 8 lines
  - Reduced `analyze_graph` description from 18 lines to 7 lines
  - Reduced `manage_system` description from 25 lines to 9 lines
  - Reduced `edit_user_profile` description from 18 lines to 8 lines
  - Improved parameter descriptions in Zod schemas for better clarity
  - Replaced "CRITICAL RULES" with friendlier "Important" notes
  - Removed large ASCII tables and verbose action lists from descriptions

### Added
- **Comprehensive Usage Guide**: New documentation file `docs/USAGE-GUIDE.md`
  - Detailed action reference tables for all tools
  - Quick start examples for common use cases
  - Best practices and performance tips
  - Inference rule documentation with examples
  - Memory hierarchy and time-travel query guides
- **Improved Inference Rule Documentation**:
  - "Important: All Variables Must Be Bound" section
  - Common mistakes with ❌/✅ examples
  - Three additional Datalog examples (same type entities, co-occurrence, correct binding)
  - Clear explanation of variable binding requirements
- **Parameter Naming Guide**: Comprehensive guide for API parameter consistency
  - When to use `entity_id` vs `id` vs `observation_id`
  - Practical examples for each parameter type
  - Clarification for `stop_session` and `stop_task` using `id` parameter

### Improved
- **Better Error Messages for Inference Rules**:
  - Context-aware hints based on error type
  - "unbound" errors now explain variable binding requirements
  - "syntax" errors point to common issues
  - All errors reference `docs/USAGE-GUIDE.md` for examples
- **Parameter Documentation**: Explicit notes on parameter requirements
  - `stop_session` / `stop_task` - Clarified use of `id` parameter
  - `detect_conflicts` / `resolve_conflicts` - Confirmed entity_id requirement
  - `suggest_connections` - Clarified only needs entity_id, not query

### Documentation
- Tool descriptions now follow 3-tier approach: Brief description → Schema details → Steering file
- All detailed documentation moved to steering file for on-demand access
- No breaking changes - all functionality remains identical

## [2.15.0] - 2026-03-03

### Added
- **Centralized Logging System**: Configurable log levels (ERROR, WARN, INFO, DEBUG, TRACE) via `LOG_LEVEL` environment variable
- **Performance Monitoring**: Built-in performance tracking with percentile metrics (P50, P95, P99)
- `logger.ts` - Centralized logging with component-based prefixes
- `performance-monitor.ts` - Operation latency tracking and throughput measurement
- `test-large-dataset.ts` - Comprehensive performance testing with small/medium/large dataset configurations
- Performance metrics for all major operations (create_entity, add_observation, search, etc.)
- Documentation: `docs/LOGGING.md` and `docs/PERFORMANCE.md`

### Fixed
- **CRITICAL: Infinite Loop Bug**: Fixed crash caused by `limit: 0` parameter triggering recursive search calls
  - Added validation in `advancedSearch()`, `graphRag()`, `agenticRetrieve()` to prevent `limit <= 0`
  - Replaced recursive fallback calls with empty array returns to prevent infinite loops
  - Added validation in `dynamic-fusion.ts` for `topK` parameters
  - Added validation in `adaptive-retrieval.ts` for `limit` and `vectorSearch()`
- Improved error handling across all search strategies
- Prevented self-reference relationships with proper validation

### Changed
- Replaced `console.error` with structured `logger` calls throughout codebase
- Reduced debug output noise in production (use `LOG_LEVEL=DEBUG` for detailed logs)
- Added performance timing to all major operations
- Improved error messages with component context

### Performance
- Added throughput metrics (operations per second)
- Added latency percentiles (P50, P95, P99) for all operations
- Performance test configurations: small (100 entities), medium (500 entities), large (2000 entities)
- Expected throughput: 5-10 ops/sec for mixed workloads

## [2.14.0] - 2026-03-03

### Added
- **SYNAPSE - Spreading Activation with Lateral Inhibition**: Cognitive dynamics-based retrieval where relevance emerges from activation propagation through the knowledge graph (based on arXiv 2601.02744, January 2026)
- `SpreadingActivationService` implementing Collins & Loftus (1975) spreading activation model
- Lateral Inhibition mechanism for attention focusing - top-M nodes suppress weaker competitors
- Fan Effect (ACT-R, Anderson 1983) - attention dilution from high-degree nodes
- Temporal Decay - recent connections weighted higher than old ones
- Sigmoid Activation Function for non-linear activation dynamics
- Dual Trigger seed node selection combining BM25 (lexical) and semantic similarity
- `spreadActivation()` - propagates activation through graph with configurable steps
- `tripleHybridRetrieval()` - combines Semantic (50%) + Activation (30%) + PageRank (20%) signals
- Configurable parameters: spreading factor, decay factor, temporal decay, inhibition strength, propagation steps
- Convergence detection for efficient real-time retrieval
- Comprehensive test suite with 7 validation scenarios including multi-hop reasoning, temporal effects, and convergence analysis

## [2.13.0] - 2026-03-03

### Added
- **ACT-R + Ebbinghaus Memory Activation**: Mathematically-founded memory activation and forgetting system combining ACT-R Base-Level Learning with Ebbinghaus Forgetting Curve
- `MemoryActivationService` for intelligent memory retention and pruning
- Activation formula: R = e^(-t/S) where R=retrievability, t=time since access, S=memory strength
- Memory strength calculation: S = initialStrength + (accessCount × strengthIncrement)
- `calculateActivationScores()` - computes activation for all observations with configurable thresholds
- `recordAccess()` - updates access metadata when observations are retrieved
- `pruneWeakMemories()` - soft-deletes observations below activation threshold
- `getActivationStats()` - provides activation distribution and statistics
- `boostRelatedMemories()` - implements priming effect for related observations
- Configurable parameters: initial strength, strength increment, retention threshold, decay base, time unit
- Natural spaced repetition via activation decay
- Comprehensive test suite with 8 validation scenarios

## [2.12.0] - 2026-03-03

### Added
- **Composable Query Pipelines**: Modular pipeline architecture for flexible query processing with preprocessing, search, reranking, and post-processing stages
- `QueryPipeline` class for executing multi-stage query workflows
- `PipelineBuilder` for fluent pipeline construction
- Built-in preprocessing stages: Query Normalization, Embedding Generation
- Built-in search stages: Hybrid Search, Graph RAG, Agentic Search
- Built-in reranking stages: Cross-Encoder, Diversity Reranking (MMR-style)
- Built-in post-processing stages: Deduplication, Score Normalization, Top-K
- Conditional stage execution based on context
- Per-stage performance metrics and timing
- A/B testing support via `executeWithVariants()`
- Preset pipelines: Standard, Graph RAG, Agentic
- **Query-Aware Flow Diffusion (QAFD-RAG)**: Dynamic edge weighting based on query alignment with flow diffusion algorithm for improved multi-hop reasoning
- **Explainable Retrieval Paths**: Full reasoning chains with path visualization, step-by-step breakdowns, and score explanations for all retrieval results

## [2.11.0] - 2026-03-02

### Added
- **Temporal Pattern Detection**: Automatic recognition of recurring events, cyclical relationships, temporal correlations, and seasonal trends with embedding-based clustering and confidence scoring

## [2.10.0] - 2026-03-01

### Added
- **Hierarchical Memory Levels**: Multi-level memory architecture (L0-L3) with intelligent compression, importance scoring (PageRank + Recency + Access Frequency), and LLM-backed summarization for long-term memory management

## [2.9.0] - 2026-02-28

### Added
- **T-GRAG Temporal Conflict Resolution**: Automatic detection and resolution of temporal conflicts in observations with semantic contradiction detection, temporal redundancy elimination, and superseded fact handling

## [2.8.0] - 2026-02-27

### Added
- **Proactive Memory Suggestions**: Automatically discovers and recommends relevant connections using vector similarity, graph analysis, common neighbors, and inference engine with confidence scoring

## [2.7.0] - 2026-02-26

### Added
- **Adaptive Query Fusion**: Dynamically adjusts search weights based on query intent (Finder/Evaluator/Explainer/Generator) and complexity (Simple/Moderate/Complex/Exploratory) using hybrid heuristic + LLM classification with 16 predefined weight configurations

## [2.6.0] - 2026-02-20

### Added
- **GraphRAG-R1 Adaptive Retrieval**: Intelligent retrieval system with Progressive Retrieval Attenuation (PRA) and Cost-Aware F1 (CAF) scoring that automatically selects optimal strategies based on query complexity and learns from historical performance

## [2.5.0] - 2026-02-15

### Added
- **Multi-Hop Reasoning with Vector Pivots**: Logic-aware Retrieve-Reason-Prune pipeline using vector search as springboard for graph traversal with helpfulness scoring and pivot depth security

## [2.4.0] - 2026-02-10

### Added
- **Temporal Graph Neural Networks**: Time-aware node embeddings capturing historical context, temporal smoothness, and recency-weighted aggregation using Time2Vec encoding and multi-signal fusion

## [2.3.0] - 2026-02-05

### Added
- **Dynamic Fusion Framework**: Advanced 4-path retrieval system combining Dense Vector, Sparse Vector, FTS, and Graph traversal with configurable weights and fusion strategies (RRF, Weighted Sum, Max, Adaptive)

## [2.2.0] - 2026-01-25

### Added
- **Context Compaction & Auto-Summarization**: Automatic and manual memory consolidation with progressive summarization and LLM-backed Executive Summaries

## [2.1.0] - 2026-01-20

### Added
- **Fact Lifecycle Management**: Native "soft-deletion" via CozoDB Validity retraction; invalidated facts are hidden from current views but preserved in history for audit trails
- `invalidate_observation` action in `mutate_memory` tool
- `invalidate_relation` action in `mutate_memory` tool

### Changed
- All standard retrieval (Search, Graph-RAG, Inference) now uses `@ "NOW"` filter to automatically exclude retracted facts

## [2.0.0] - 2026-01-15

### Added
- **Agentic Retrieval Layer**: Auto-routing engine that analyzes query intent via local LLM to select the optimal search strategy (Vector, Graph, or Community)
- **Multi-Level Memory**: Context-aware memory system with built-in session and task management
- **Hierarchical GraphRAG**: Automatic generation of thematic "Community Summaries" using local LLMs to enable global "Big Picture" reasoning
- **Tiny Learned Reranker**: Integrated Cross-Encoder model (`ms-marco-MiniLM-L-6-v2`) for ultra-precise re-ranking of top search results
- Session management: `start_session`, `stop_session` actions
- Task management: `start_task`, `stop_task` actions
- `agentic_search` action in `query_memory` tool
- `summarize_communities` action in `manage_system` tool

## [1.9.0] - 2026-01-10

### Added
- **PDF Support**: Direct PDF ingestion with text extraction via pdfjs-dist; supports file path and content parameters
- **Dual Timestamp Format**: All timestamps returned in both Unix microseconds and ISO 8601 format for maximum flexibility
- `format: "pdf"` option in `ingest_file` action

## [1.8.0] - 2026-01-05

### Added
- **Export/Import**: Export to JSON, Markdown, or Obsidian-ready ZIP; import from Mem0, MemGPT, Markdown, or native format
- `export_memory` action in `manage_system` tool
- `import_memory` action in `manage_system` tool
- Support for multiple export formats: JSON, Markdown, Obsidian
- Support for multiple import formats: Mem0, MemGPT, Markdown, native Cozo

## [1.7.0] - 2025-12-20

### Added
- **Multi-Vector Support**: Dual embeddings per entity: content-embedding for context, name-embedding for identification
- **Graph-Walking Optimization**: Optimized Graph-Walking algorithm via Datalog, using HNSW index lookups for precise distance calculations during traversal

### Changed
- Each entity now has two specialized vectors: Content-Embedding and Name-Embedding
- Significantly improved accuracy when entering graph walks

## [1.6.0] - 2025-12-15

### Added
- **Graph Features**: Native integration of Shortest Path (Dijkstra) with path reconstruction, Community Detection (LabelPropagation), and advanced centrality measures
- `shortest_path` action in `analyze_graph` tool
- `communities` action in `analyze_graph` tool
- `connected_components` action in `analyze_graph` tool
- **Graph Evolution**: Tracks the temporal development of relationships via CozoDB `Validity` queries
- **Bridge Discovery**: Identifies "bridge entities" connecting different communities
- `bridge_discovery` action in `analyze_graph` tool

## [1.5.0] - 2025-12-10

### Added
- **Native CozoDB Operators**: Now uses explicit `:insert`, `:update`, and `:delete` operators instead of generic `:put` (upsert) calls
- **Advanced Time-Travel Analysis**: Extension of relationship history with time range filters (`since`/`until`) and automatic diff summaries

### Changed
- Increased data safety through strict validation of database states
- Error when trying to "insert" an existing entity

## [1.3.0] - 2025-12-01

### Added
- **Graph Metrics & Ranking Boost**: Integrates advanced graph algorithms
- PageRank: Calculates the "importance" of knowledge nodes for ranking
- Betweenness Centrality: Identifies central bridge elements in the knowledge network
- HITS (Hubs & Authorities): Distinguishes between information sources and pointers
- Connected Components: Detects isolated knowledge islands and subgraphs
- `pagerank` action in `analyze_graph` tool
- `betweenness` action in `analyze_graph` tool
- `hits` action in `analyze_graph` tool

### Changed
- Graph metrics are automatically used in hybrid search (`advancedSearch`) and `graphRag`

## [1.2.0] - 2025-11-25

### Added
- **Atomic Transactions**: Multi-statement transactions ensuring data consistency
- `run_transaction` action in `mutate_memory` tool
- Support for atomic transactions across multiple operations using CozoDB block syntax `{ ... }`

## [1.0.0] - 2025-11-20

### Added
- **Logical Edges from Knowledge Graph**: Metadata-driven implicit relationship discovery with 5 patterns: same category, same type, hierarchical, contextual, and transitive logical edges

## [0.8.5] - 2025-11-15

### Added
- **Semantic Caching**: Two-level cache (L1 memory + L2 persistent) with semantic query matching
- L1 Memory Cache: Ultra-fast in-memory LRU cache (< 0.1ms)
- L2 Persistent Cache: Storage in CozoDB for restart resistance
- Semantic Matching: Detects semantically similar queries via vector distance
- Janitor TTL: Automatic cleanup of outdated cache entries

## [0.7.0] - 2025-11-10

### Added
- **Hybrid Search**: Combines semantic search (HNSW), full-text search (FTS), and graph signals via Reciprocal Rank Fusion (RRF)
- **Full-Text Search (FTS)**: Native CozoDB v0.7 FTS indices with stemming, stopword filtering, and robust query sanitizing
- **Near-Duplicate Detection (LSH)**: Automatically detects very similar observations via MinHash-LSH (CozoDB v0.7)
- **Recency Bias**: Older content is dampened in fusion (except for explicit keyword searches)
- **JSON Merge Operator (++)**: Uses the v0.7 merge operator for efficient, atomic metadata updates

### Changed
- Upgraded to CozoDB v0.7 with native FTS and LSH support

## [0.6.0] - 2025-11-01

### Added
- **Time-Travel Queries**: Version all changes via CozoDB Validity; query any point in history
- **User Preference Profiling**: Persistent user preferences with automatic 50% search boost
- **Inference Engine**: Implicit knowledge discovery with multiple strategies
- **Janitor Service**: LLM-backed automatic cleanup with hierarchical summarization

### Changed
- All write operations now create new `Validity` entries for time-travel support

## [0.5.0] - 2025-10-20

### Added
- Initial public release
- Basic entity/observation/relationship management
- Vector search with HNSW indices
- Graph traversal capabilities
- MCP server integration
- Local embeddings via ONNX (Xenova/bge-m3)

---

## Feature Implementation Details

### Hybrid Search (v0.7)
- Combination of semantic search (HNSW), Full-Text Search (FTS), and graph signals
- Merged via Reciprocal Rank Fusion (RRF)
- Native CozoDB v0.7 FTS indices with stemming and stopword filtering
- Robust query sanitizing (cleaning of `+ - * / \ ( ) ? .`)

### Multi-Vector Support (v1.7)
Each entity has two specialized vectors:
1. **Content-Embedding**: Represents the content context (observations)
2. **Name-Embedding**: Optimized for identification via name/label

This significantly improves accuracy when entering graph walks.

### Semantic & Persistent Caching (v0.8.5)
Two-level caching system:
1. **L1 Memory Cache**: Ultra-fast in-memory LRU cache (< 0.1ms)
2. **L2 Persistent Cache**: Storage in CozoDB for restart resistance
3. **Semantic Matching**: Detects semantically similar queries via vector distance
4. **Janitor TTL**: Automatic cleanup of outdated cache entries

### Graph Metrics & Ranking Boost (v1.3 / v1.6)
Integrates advanced graph algorithms:
- **PageRank**: Calculates the "importance" of knowledge nodes for ranking
- **Betweenness Centrality**: Identifies central bridge elements in the knowledge network
- **HITS (Hubs & Authorities)**: Distinguishes between information sources (Authorities) and pointers (Hubs)
- **Connected Components**: Detects isolated knowledge islands and subgraphs

These metrics are automatically used in hybrid search (`advancedSearch`) and `graphRag`.

### Fact Lifecycle Management (v2.1)
Uses CozoDB's native **Validity** retraction mechanism to manage the lifecycle of information:
1. **Auditability**: You can always "time-travel" back to see what the system knew at any given point
2. **Consistency**: All standard retrieval uses the `@ "NOW"` filter to automatically exclude retracted facts
3. **Atomic Retraction**: Invalidation can be part of a multi-statement transaction

### Conflict Detection & Data Integrity
- **Application-Level**: Automatically detects contradictions in metadata (e.g., "active" vs. "discontinued")
- **Trigger Concept**: Prevents invalid states like self-references in relationships (Self-Loops)
- Robust logic in the app layer ensures data integrity before writing

### User Preference Profiling
- Specialized `global_user_profile` entity stores persistent preferences (likes, work style)
- Receives a **50% score boost** in every search
- Enables personalized memory retrieval

### Hierarchical Summarization
- The Janitor condenses old fragments into "Executive Summary" nodes
- Preserves the "Big Picture" long-term
- LLM-backed automatic cleanup

### All Local
- Embeddings via Transformers/ONNX
- No external embedding service required
- 100% local-first architecture

### Composable Query Pipelines (v2.12)
Modular pipeline architecture inspired by OpenSearch 2026 roadmap:
- **Stage Types**: Preprocessing, Search, Reranking, Post-Processing
- **Conditional Execution**: Stages can be conditionally executed based on context
- **Performance Metrics**: Each stage is timed for optimization
- **Fluent API**: `PipelineBuilder` for easy pipeline construction
- **Preset Pipelines**: Standard, Graph RAG, and Agentic configurations
- **A/B Testing**: Built-in support for testing multiple pipeline variants

Example:
```typescript
const pipeline = new PipelineBuilder('custom')
  .addPreprocess(preprocessStages.queryNormalization())
  .addPreprocess(preprocessStages.embedQuery(embeddingService))
  .addSearch(searchStages.hybridSearch(hybridSearch))
  .addRerank({
    ...rerankStages.crossEncoder(reranker),
    condition: (ctx) => ctx.results.length > 3
  })
  .addPostProcess(postProcessStages.deduplication())
  .addPostProcess(postProcessStages.topK())
  .build();

const result = await new QueryPipeline(pipeline).execute('query', { limit: 10 });
```

### Query-Aware Flow Diffusion (v2.12)
QAFD-RAG implementation based on ICLR 2026 research:
- **Dynamic Edge Weighting**: Edge weights computed via cosine similarity between query embedding and node embeddings
- **Flow Diffusion Algorithm**: Propagates relevance scores through graph with damping factor (α = 0.85)
- **Hybrid Search**: Combines vector seed discovery with query-aware graph expansion
- **Multi-Seed Support**: Can start from multiple seed nodes simultaneously
- **Training-Free**: No model training required, uses existing embeddings

Example:
```typescript
const qaTraversal = new QueryAwareTraversal(db, embeddingService);
const results = await qaTraversal.hybridSearch(
  'JavaScript frameworks for building user interfaces',
  { seedTopK: 3, maxHops: 2, dampingFactor: 0.85 }
);
```

### Explainable Retrieval Paths (v2.12)
Comprehensive explanation system for all retrieval results:
- **Path Visualization**: Textual and structured graph path representations
- **Reasoning Chains**: Step-by-step breakdown of retrieval process
- **Score Breakdown**: Detailed formula and component explanations
- **Confidence Scoring**: Overall confidence based on multiple signals
- **Multi-Type Support**: Works with Hybrid, Graph-RAG, Multi-Hop, Dynamic Fusion

Example:
```typescript
const explainableService = new ExplainableRetrievalService(db, embeddingService);
const explainedResults = await explainableService.explainResults(
  searchResults, 'TypeScript programming', 'graph_rag',
  { includePathVisualization: true, includeReasoningSteps: true }
);
// Access: result.explanation.pathVisualization.textual
// Output: "Query --[semantic:0.85]--> TypeScript --[expert_in]--> Alice"
```
