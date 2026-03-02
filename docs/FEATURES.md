# Feature Documentation

Complete documentation for all CozoDB Memory features.

## Feature Overview

### Core Search & Retrieval

- **[Hybrid Search](#hybrid-search)** - Combines semantic (HNSW), full-text (FTS), and graph signals via RRF
- **[Agentic Retrieval](#agentic-retrieval)** - Auto-routing engine with LLM-based strategy selection
- **[GraphRAG-R1 Adaptive Retrieval](#graphrag-r1-adaptive-retrieval)** - Intelligent retrieval with PRA and CAF scoring
- **[Dynamic Fusion Framework](#dynamic-fusion-framework-v23)** - 4-path retrieval with configurable weights
- **[Adaptive Query Fusion](#adaptive-query-fusion-v27)** - Query intent-based weight adjustment
- **[Cross-Encoder Reranking](#cross-encoder-reranking)** - Ultra-precise result re-ranking

### Graph & Reasoning

- **[Multi-Hop Reasoning](#multi-hop-reasoning-with-vector-pivots-v25)** - Logic-aware graph traversal with vector pivots
- **[Query-Aware Flow Diffusion](#query-aware-flow-diffusion-qafd-rag)** - Dynamic edge weighting with flow diffusion algorithm
- **[Logical Edges](#logical-edges-from-knowledge-graph-v10)** - Metadata-driven implicit relationship discovery
- **[Graph Algorithms](#graph-algorithms)** - PageRank, Betweenness, HITS, Community Detection, Shortest Path
- **[Hierarchical GraphRAG](#hierarchical-graphrag)** - Automatic community summaries via LLM

### Temporal & Memory Management

- **[Time-Travel Queries](#time-travel-queries)** - Query any point in history via CozoDB Validity
- **[Temporal Conflict Resolution](#t-grag-temporal-conflict-resolution-v29)** - Automatic contradiction detection and resolution
- **[Temporal Pattern Detection](#temporal-pattern-detection)** - Recurring events and cyclical relationships
- **[Temporal Graph Neural Networks](#temporal-graph-neural-networks)** - Time-aware node embeddings
- **[Hierarchical Memory Levels](#hierarchical-memory-levels)** - Multi-level architecture (L0-L3) with compression
- **[ACT-R + Ebbinghaus Memory Activation](#act-r--ebbinghaus-memory-activation)** - Mathematically-founded activation and forgetting

### Intelligence & Automation

- **[Proactive Memory Suggestions](#proactive-memory-suggestions-v28)** - Automatic connection discovery
- **[Inference Engine](#inference-engine)** - Implicit knowledge discovery with multiple strategies
- **[Janitor Service](#janitor-service)** - LLM-backed automatic cleanup and summarization
- **[User Preference Profiling](#user-preference-profiling)** - Persistent preferences with automatic boost

### Performance & Caching

- **[Semantic Caching](#semantic-caching)** - Two-level cache (L1 memory + L2 persistent)
- **[Near-Duplicate Detection](#near-duplicate-detection)** - LSH-based deduplication
- **[Multi-Vector Support](#multi-vector-support)** - Dual embeddings (content + name)
- **[Composable Query Pipelines](#composable-query-pipelines)** - Modular pipeline architecture

- **[Explainable Retrieval Paths](#explainable-retrieval-paths)** - Full reasoning chains and path visualization

### Data Management

- **[Atomic Transactions](#atomic-transactions)** - Multi-statement transactions
- **[Export/Import](#exportimport)** - Multiple formats (JSON, Markdown, Obsidian, Mem0, MemGPT)
- **[Fact Lifecycle Management](#fact-lifecycle-management)** - Soft-deletion with audit trails

---

## Hybrid Search

Combines multiple retrieval signals via Reciprocal Rank Fusion (RRF):

- **Vector Search**: HNSW indices for semantic similarity
- **Full-Text Search**: BM25 scoring with stemming and stopword filtering
- **Keyword Matching**: Regex-based text matching
- **Graph Signals**: PageRank for entity importance
- **Community Expansion**: Entities from same community
- **Inference**: Probabilistic relationship discovery

**Temporal Decay**: Older content dampened with 90-day half-life (configurable).

**Usage:**
```json
{
  "action": "search",
  "query": "Feature Flag",
  "limit": 10,
  "rerank": true
}
```

---

## Agentic Retrieval

Auto-routing search that uses local LLM (Ollama) to analyze query intent and select optimal strategy:

**Strategies:**
- **Vector Search**: Best for semantic similarity queries
- **Graph Walk**: Best for relational/exploratory queries
- **Community Summary**: Best for broad thematic queries

**Usage:**
```json
{
  "action": "agentic_search",
  "query": "Tell me about the authentication system",
  "limit": 10
}
```

---

## GraphRAG-R1 Adaptive Retrieval

Intelligent retrieval system inspired by GraphRAG-R1 (Yu et al., WWW 2026):

**Features:**
- **Progressive Retrieval Attenuation (PRA)**: Prevents over-retrieval
- **Cost-Aware F1 (CAF) Scoring**: Balances quality with computational cost
- **5 Strategies**: Vector-Only, Graph-Walk, Hybrid-Fusion, Community-Expansion, Semantic-Walk
- **Learning**: Adapts based on historical performance

**Usage:**
```json
{
  "action": "adaptive_retrieval",
  "query": "How does the payment system work?",
  "limit": 10
}
```

> **See [API Reference](API.md) for complete documentation**

---

## Cross-Encoder Reranking

Integrated Cross-Encoder model (`ms-marco-MiniLM-L-6-v2`) for ultra-precise re-ranking:

- **Performance**: ~4-6ms for top 10 results
- **Model**: Local ONNX, no external API
- **Usage**: Add `rerank: true` to any search query

---

## Time-Travel Queries

CozoDB Validity enables querying any point in history:

**Usage:**
```json
{
  "action": "entity_details",
  "entity_id": "ID",
  "as_of": "2026-01-15T10:00:00Z"
}
```

**Features:**
- Full audit trails
- Historical relationship evolution
- Temporal diff summaries

---

## Graph Algorithms

Built-in graph algorithms for knowledge analysis:

- **PageRank**: Entity importance scoring
- **Betweenness Centrality**: Bridge element identification
- **HITS**: Hubs & Authorities detection
- **Community Detection**: Label Propagation clustering
- **Shortest Path**: Dijkstra with path reconstruction
- **Connected Components**: Isolated subgraph detection

---

## Hierarchical GraphRAG

Automatic generation of thematic community summaries via LLM:

**Usage:**
```json
{
  "action": "summarize_communities",
  "model": "llama3.2:3b",
  "min_community_size": 5
}
```

Enables "Big Picture" reasoning over large knowledge graphs.

---

## Semantic Caching

Two-level caching system:

- **L1 Memory Cache**: Ultra-fast in-memory LRU cache (<0.1ms)
- **L2 Persistent Cache**: CozoDB storage for restart resistance
- **Semantic Matching**: Detects similar queries via vector distance
- **Janitor TTL**: Automatic cleanup of outdated entries

---

## Near-Duplicate Detection

Automatic LSH-based deduplication using MinHash:

- **Threshold**: 85% similarity (configurable)
- **Returns**: `duplicate_detected` status with existing observation ID
- **Automatic**: Enabled by default on `add_observation`

---

## Multi-Vector Support

Dual embeddings per entity (since v1.7):

- **Content Embedding**: Represents semantic context from observations
- **Name Embedding**: Optimized for identification via name/label

Significantly improves accuracy for graph traversal and entity matching.

---

## Composable Query Pipelines

Modular pipeline architecture for flexible query processing inspired by OpenSearch 2026 roadmap (v2.12).

### Pipeline Architecture

**Stage Types:**
- **Preprocessing**: Query normalization, embedding generation, query expansion
- **Search**: Hybrid search, Graph RAG, Agentic search
- **Reranking**: Cross-encoder, diversity reranking (MMR)
- **Post-Processing**: Deduplication, score normalization, top-K selection

### Key Features

- **Modular Composition**: Build custom pipelines by chaining stages
- **Conditional Execution**: Stages can be conditionally executed based on context
- **Performance Metrics**: Each stage is timed for optimization
- **Fluent API**: `PipelineBuilder` for easy pipeline construction
- **Preset Pipelines**: Standard, Graph RAG, and Agentic configurations
- **A/B Testing**: Built-in support for testing multiple pipeline variants

### Usage Example

```typescript
import { 
  PipelineBuilder, 
  preprocessStages, 
  searchStages, 
  rerankStages, 
  postProcessStages,
  QueryPipeline
} from './query-pipeline';

// Build custom pipeline with conditional logic
const pipeline = new PipelineBuilder('custom')
  .addPreprocess(preprocessStages.queryNormalization())
  .addPreprocess(preprocessStages.embedQuery(embeddingService))
  .addSearch(searchStages.hybridSearch(hybridSearch))
  .addRerank({
    ...rerankStages.crossEncoder(reranker),
    condition: (ctx) => ctx.results.length > 3  // Only rerank if >3 results
  })
  .addPostProcess(postProcessStages.deduplication())
  .addPostProcess(postProcessStages.topK())
  .build();

// Execute pipeline
const result = await new QueryPipeline(pipeline).execute('my query', { 
  limit: 10,
  topK: 5
});

// Access metrics
console.log(result.metrics);
// Output: {
//   'preprocess.normalization': 0,
//   'preprocess.embedding': 57,
//   'search.hybrid': 120,
//   'rerank.crossEncoder': 45,
//   'postprocess.deduplication': 2,
//   'postprocess.topK': 0,
//   'pipeline.total': 224
// }
```

### Built-in Stages

**Preprocessing:**
- `queryNormalization()`: Trim and lowercase query
- `embedQuery(embeddingService)`: Generate query embedding

**Search:**
- `hybridSearch(hybridSearch)`: Multi-path hybrid search
- `graphRag(hybridSearch)`: Graph-based reasoning
- `agenticSearch(hybridSearch)`: LLM-based strategy selection

**Reranking:**
- `crossEncoder(reranker)`: Cross-encoder reranking
- `diversityRerank()`: MMR-style diversity reranking

**Post-Processing:**
- `deduplication()`: Remove duplicate results (by entity_id or embedding similarity)
- `scoreNormalization()`: Normalize scores to 0-1 range
- `topK()`: Limit results to top K

### Preset Pipelines

```typescript
import { 
  createStandardPipeline,
  createGraphRagPipeline,
  createAgenticPipeline
} from './query-pipeline';

// Standard: Normalization → Embed → Hybrid Search → Rerank → Dedup → Top-K
const standard = createStandardPipeline(hybridSearch, embeddingService, reranker);

// Graph RAG: Embed → Graph RAG → Diversity Rerank → Dedup → Normalize → Top-K
const graphRag = createGraphRagPipeline(hybridSearch, embeddingService);

// Agentic: Normalization → Embed → Agentic Search → Rerank → Dedup → Top-K
const agentic = createAgenticPipeline(hybridSearch, embeddingService, reranker);
```

### Conditional Execution

Stages can be conditionally executed based on context:

```typescript
const pipeline = new PipelineBuilder('conditional')
  .addPreprocess(preprocessStages.queryNormalization())
  .addPreprocess({
    type: 'preprocess',
    name: 'expensive-preprocessing',
    enabled: true,
    condition: (ctx) => ctx.query.length > 10,  // Only for long queries
    execute: async (ctx) => {
      // Expensive preprocessing logic
      return ctx;
    }
  })
  .build();
```

### A/B Testing

Test multiple pipeline variants simultaneously:

```typescript
const pipeline = new QueryPipeline({
  name: 'ab-test',
  stages: [...],
  abTest: {
    enabled: true,
    variants: ['variant-a', 'variant-b'],
    splitRatio: [0.5, 0.5]
  }
});

const { primary, variants } = await pipeline.executeWithVariants('query');
console.log('Primary:', primary.results);
console.log('Variant A:', variants['variant-a'].results);
console.log('Variant B:', variants['variant-b'].results);
```

### Performance Characteristics

- **Preprocessing**: <1ms (normalization), 50-100ms (embedding)
- **Search**: 50-200ms (depends on strategy and data size)
- **Reranking**: 40-60ms (cross-encoder for top 10)
- **Post-Processing**: <5ms (deduplication, normalization, top-K)
- **Total**: Typically 150-400ms for complete pipeline

### Research Foundation

- OpenSearch Composable Pipelines (2026)
- Modular RAG Architectures (2025-2026)
- Pipeline Optimization Patterns

---

## Atomic Transactions

Multi-statement transactions ensuring data consistency:

**Usage:**
```json
{
  "action": "run_transaction",
  "operations": [
    { "action": "create_entity", "params": { "name": "Bob", "type": "Person" } },
    { "action": "add_observation", "params": { "entity_name": "Bob", "text": "Joined team" } }
  ]
}
```

**Supported**: create_entity, add_observation, create_relation, delete_entity

---

## Export/Import

Multiple format support for data portability:

**Export Formats:**
- **JSON**: Native Cozo format (fully re-importable)
- **Markdown**: Human-readable document
- **Obsidian**: ZIP with Wiki-Links and YAML frontmatter

**Import Formats:**
- **Cozo**: Native format
- **Mem0**: user_id becomes entity
- **MemGPT**: Archival/recall memory
- **Markdown**: Parse sections as entities

**Merge Strategies**: skip, overwrite, merge

---

## Explainable Retrieval Paths

Provides detailed reasoning paths and explanations for all retrieval results, making the system's decision-making transparent and auditable.

**Features:**
- **Full Path Visualization**: Textual and structured graph path representations
- **Reasoning Chains**: Step-by-step breakdown of retrieval process
- **Score Breakdown**: Detailed explanation of score calculations with formula
- **Confidence Scoring**: Overall confidence based on multiple signals
- **Multi-Type Support**: Works with Hybrid, Graph-RAG, Multi-Hop, and Dynamic Fusion

**Path Visualization Example:**
```
Query --[semantic:0.85]--> TypeScript --[expert_in]--> Alice Johnson
```

**Usage:**
```typescript
import { ExplainableRetrievalService } from './explainable-retrieval';

const explainableService = new ExplainableRetrievalService(db, embeddingService);

// Enhance search results with detailed explanations
const explainedResults = await explainableService.explainResults(
  searchResults,
  'TypeScript programming',
  'graph_rag',
  {
    includePathVisualization: true,
    includeReasoningSteps: true,
    includeScoreBreakdown: true
  }
);

// Access detailed explanation
const result = explainedResults[0];
console.log(result.explanation.summary);
// Output: "Found via graph expansion from semantic seed (2 hops)"

console.log(result.explanation.reasoning);
// Output: "Started with semantic search for 'TypeScript programming', then explored..."

console.log(result.explanation.pathVisualization.textual);
// Output: "Query --[semantic:0.85]--> TypeScript --[expert_in]--> Alice"

// Access reasoning steps
result.explanation.steps.forEach(step => {
  console.log(`${step.step}. ${step.operation}: ${step.description}`);
});
// Output:
// 1. Vector Seed Discovery: Performed semantic search...
// 2. Graph Expansion: Explored graph relationships up to 2 hops...
// 3. Entity Discovery: Found "Alice Johnson" (Person)...
// 4. Score Calculation: Combined vector similarity, graph distance...

// Access score breakdown
console.log(result.explanation.scoreBreakdown.formula);
// Output: "seed_score * (1.0 - 0.2 * depth) * (1.0 + pagerank)"

console.log(result.explanation.scoreBreakdown.components);
// Output: { seedScore: 0.85, depthPenalty: 0.4, pageRankBoost: 0.15 }
```

**Explanation Structure:**
```typescript
interface DetailedExplanation {
  summary: string;                    // One-line summary
  reasoning: string;                  // Detailed reasoning
  steps: ReasoningStep[];             // Step-by-step breakdown
  pathVisualization?: PathVisualization;  // Graph path visualization
  scoreBreakdown: ScoreBreakdown;     // Score calculation details
  confidence: number;                 // Overall confidence (0-1)
  sources: string[];                  // Contributing retrieval paths
}
```

**Research Foundation:**
- GraphRAG Explainability Patterns (2025-2026)
- Reasoning Trace Research (ACL 2025)
- Landmark-based Reasoning Frameworks (2026)
- Interactive Reasoning Designs (2025)

---

## Fact Lifecycle Management

Native soft-deletion via CozoDB Validity retraction:

**Usage:**
```json
{ "action": "invalidate_observation", "observation_id": "OBS_ID" }
{ "action": "invalidate_relation", "from_id": "ID1", "to_id": "ID2", "relation_type": "works_on" }
```

**Features:**
- Hidden from current views
- Preserved in history for audit
- Time-travel accessible

---

## Inference Engine

Implicit knowledge discovery with multiple strategies:

1. **Co-occurrence**: Entity names in observation texts
2. **Semantic Proximity**: Similar entities via HNSW
3. **Transitivity**: A→B and B→C implies A→C
4. **Expertise Rules**: Person + works_on + uses_tech
5. **Custom Rules**: User-defined Datalog inference

**Usage:**
```json
{
  "action": "infer_relations",
  "entity_id": "ENTITY_ID"
}
```

---

## Janitor Service

LLM-backed automatic cleanup:

**Features:**
- **Hierarchical Summarization**: Condenses old observations into Executive Summaries
- **Session Compression**: Summarizes inactive sessions
- **Observation Pruning**: Removes low-value observations
- **Dry-Run Mode**: Preview candidates before cleanup

**Usage:**
```json
{
  "action": "cleanup",
  "confirm": true,
  "older_than_days": 60,
  "model": "llama3.2:3b"
}
```

---

## User Preference Profiling

Persistent user preferences with automatic search boost:

- **Entity**: `global_user_profile`
- **Boost**: 50% score increase in all searches
- **Automatic**: Created on first start
- **Manual Editing**: Via `edit_user_profile` tool

> **See [USER-PROFILING.md](USER-PROFILING.md) for complete documentation**

---

## Temporal Pattern Detection

Automatic recognition of recurring patterns (v2.11):

**Pattern Types:**
- **Recurring Events**: Events with regular intervals
- **Cyclical Relationships**: A → B → C → A cycles
- **Temporal Correlations**: Events occurring together
- **Seasonal Trends**: Seasonal activity patterns

**Features:**
- Embedding-based clustering
- Confidence scoring
- Pattern storage for future reference

---

## Hierarchical Memory Levels

Multi-level memory architecture (v2.10):

**Levels:**
- **L0 (Raw)**: Recent observations (24h retention)
- **L1 (Session)**: Session summaries (7d retention)
- **L2 (Weekly)**: Weekly summaries (30d retention)
- **L3 (Monthly)**: Long-term summaries (365d retention)

**Features:**
- Importance scoring (PageRank + Recency + Access Frequency)
- LLM-backed summarization
- Automatic compression
- High-importance preservation

---

## ACT-R + Ebbinghaus Memory Activation

Mathematically-founded memory activation and forgetting system (v2.13) combining ACT-R Base-Level Learning with Ebbinghaus Forgetting Curve.

### Core Formula

**Activation**: R = e^(-t/S)

Where:
- **R**: Retrievability/activation (0-1 scale)
- **t**: Time since last access (configurable: hours or days)
- **S**: Memory strength (increases with each recall)

**Memory Strength**: S = S₀ + (n × Δ)

Where:
- **S₀**: Initial strength (default: 1.0)
- **n**: Access count (number of recalls)
- **Δ**: Strength increment per recall (default: 1.0)

### Features

- **Activation Scoring**: Calculate activation for all observations with configurable thresholds
- **Access Recording**: Automatic metadata updates when observations are retrieved
- **Weak Memory Pruning**: Soft-delete observations below activation threshold
- **Priming Effect**: Boost related memories when one is accessed
- **Spaced Repetition**: Natural implementation via activation decay
- **Statistics**: Distribution analysis and activation metrics

### Configuration

```typescript
{
  initialStrength: 1.0,        // Initial memory strength (S₀)
  strengthIncrement: 1.0,      // Strength increase per recall (Δ)
  maxStrength: 20.0,           // Maximum memory strength
  retentionThreshold: 0.15,    // Minimum activation to retain
  decayBase: Math.E,           // Base for exponential decay (≈2.718)
  timeUnit: 'days'             // Time unit: 'hours' or 'days'
}
```

### Usage Example

```typescript
import { MemoryActivationService } from './memory-activation';
import { CozoDb } from 'cozo-node';

const db = new CozoDb();
const activationService = new MemoryActivationService(db, {
  retentionThreshold: 0.1,
  timeUnit: 'days'
});

// Calculate activation scores
const scores = await activationService.calculateActivationScores();
console.log(`Total observations: ${scores.length}`);
console.log(`Above threshold: ${scores.filter(s => s.shouldRetain).length}`);

// Record access (increases strength)
await activationService.recordAccess('observation-id');

// Get statistics
const stats = await activationService.getActivationStats();
console.log(`Average activation: ${stats.averageActivation.toFixed(3)}`);
console.log(`Average strength: ${stats.averageStrength.toFixed(2)}`);

// Prune weak memories (dry run)
const result = await activationService.pruneWeakMemories(true);
console.log(`Would delete: ${result.candidates.length} observations`);

// Boost related memories (priming effect)
const boosted = await activationService.boostRelatedMemories('observation-id', 0.5);
console.log(`Boosted ${boosted} related memories`);
```

### Key Insights

- **Higher strength = slower forgetting**: Each recall makes memories more durable
- **Threshold determines retention**: Lower threshold = more aggressive pruning
- **Natural spaced repetition**: System automatically implements optimal review timing
- **Priming effect**: Accessing one memory strengthens related memories

### Performance Characteristics

- **Activation calculation**: O(n) where n = number of observations
- **Access recording**: O(1) per observation
- **Pruning**: O(n) for identification, O(m) for deletion where m = weak memories
- **Statistics**: O(n) for full distribution analysis

---

## Temporal Graph Neural Networks

Time-aware node embeddings (v2.4):

**Features:**
- Time2Vec encoding for temporal patterns
- Exponential decay weighting (30-day half-life)
- Multi-signal fusion (content, temporal, historical, graph)
- Confidence scoring (0-1 scale)

---

## Adaptive Query Fusion (v2.7)

Adaptive Query Fusion dynamically adjusts search weights based on query intent and complexity, implementing SOTA research from 2026.

### Query Intent Classification (FEEG Framework)

- **FINDER**: Seeking factual information (what, when, where, who)
- **EVALUATOR**: Comparing/evaluating content (compare, difference, better)
- **EXPLAINER**: Understanding concepts (why, how, explain)
- **GENERATOR**: Creating/generating content (create, write, suggest)

### Query Complexity Levels

- **SIMPLE**: Short, direct questions (≤4 words)
- **MODERATE**: Standard queries (default)
- **COMPLEX**: Multi-concept, reasoning required (>15 words or multiple concepts)
- **EXPLORATORY**: Open-ended, broad search (all, everything, overview)

### Hybrid Classification Approach

1. **Heuristic Classification** (Fast, <1ms): Keyword-based pattern matching with 60+ predefined keywords
2. **LLM Classification** (Accurate, 50-200ms): Optional Ollama integration when heuristic confidence < 0.7 threshold
3. **Graceful Fallback**: System continues with heuristic results if LLM unavailable

### Adaptive Weight Selection

The system automatically selects weights based on intent × complexity combination:

| Intent | Simple | Moderate | Complex | Exploratory |
|--------|--------|----------|---------|-------------|
| **FINDER** | V:0.4, S:0.5, F:0.1, G:0.0 | V:0.5, S:0.3, F:0.1, G:0.1 | V:0.4, S:0.2, F:0.1, G:0.3 | V:0.3, S:0.2, F:0.1, G:0.4 |
| **EVALUATOR** | V:0.5, S:0.3, F:0.1, G:0.1 | V:0.5, S:0.2, F:0.1, G:0.2 | V:0.4, S:0.1, F:0.1, G:0.4 | V:0.3, S:0.1, F:0.1, G:0.5 |
| **EXPLAINER** | V:0.5, S:0.2, F:0.1, G:0.2 | V:0.55, S:0.15, F:0.1, G:0.2 | V:0.5, S:0.1, F:0.1, G:0.3 | V:0.3, S:0.1, F:0.1, G:0.5 |
| **GENERATOR** | V:0.4, S:0.3, F:0.2, G:0.1 | V:0.45, S:0.25, F:0.15, G:0.15 | V:0.4, S:0.2, F:0.2, G:0.2 | V:0.3, S:0.2, F:0.2, G:0.3 |

Legend: V=Vector, S=Sparse, F=FTS, G=Graph

### Usage Example

```typescript
import { DynamicFusionSearch } from './dynamic-fusion';

const fusion = new DynamicFusionSearch(db, embeddingService);

// Weights are automatically adapted based on query
const { results, stats } = await fusion.search('What is TypeScript?');
// → Classified as FINDER + SIMPLE
// → Uses weights: vector: 0.4, sparse: 0.5, fts: 0.1, graph: 0.0
```

### Performance Characteristics

- **Heuristic Classification**: <1ms, ~85% accuracy
- **LLM Classification**: 50-200ms, ~95% accuracy
- **Caching**: LRU cache (default 1000 entries) for repeated queries
- **Memory**: ~100KB per 1000 cached classifications

### Configuration

```typescript
interface AdaptiveFusionConfig {
  enableLLM: boolean;          // Use LLM for classification (default: true)
  llmModel?: string;           // Ollama model (default: 'demyagent-4b-i1:Q6_K')
  heuristicThreshold: number;  // Confidence threshold (default: 0.7)
  cacheClassifications: boolean; // Enable caching (default: true)
  maxCacheSize: number;        // Max cache entries (default: 1000)
}
```

### Research Foundation

- Meilisearch Adaptive RAG (2025) - Query complexity analysis
- FEEG Framework (Samuel et al., 2026) - Finder, Evaluator, Explainer, Generator taxonomy
- ORCAS-I Intent Classifier (Alexander et al., 2022) - Weak supervision with keywords
- Query Intent Classification (2025) - Hybrid heuristic + LLM approaches

---

## Proactive Memory Suggestions (v2.8)

Proactive Memory Suggestions automatically discovers and recommends relevant connections for entities using multiple intelligent strategies.

### Discovery Strategies

1. **Vector Similarity** (35% weight)
   - Finds semantically similar entities based on embeddings
   - Confidence decays by rank (first suggestion: 0.9, second: 0.8, etc.)
   - Best for: Finding related concepts and topics

2. **Common Neighbors** (25% weight)
   - Identifies entities sharing connections in the knowledge graph
   - Confidence increases with shared neighbor count
   - Best for: Finding indirect relationships and communities

3. **Graph Proximity** (15% weight)
   - Discovers entities within N hops of the target
   - Confidence inversely proportional to hop distance
   - Best for: Exploring nearby knowledge graph regions

4. **Inference Engine** (25% weight)
   - Applies logical rules to discover implicit relationships
   - Supports transitive relations and symmetric relationships
   - Best for: Finding derived and inferred connections

### Confidence Levels

- **HIGH** (≥0.75): Strong recommendation, high relevance
- **MEDIUM** (0.5-0.75): Moderate recommendation, worth exploring
- **LOW** (<0.5): Weak recommendation, exploratory

### Usage Example

```typescript
import { ProactiveSuggestionsService } from './proactive-suggestions';

const suggestions = new ProactiveSuggestionsService(db, embeddings, {
  maxSuggestions: 10,
  minConfidence: 0.5
});

const recommendations = await suggestions.suggestConnections(entityId);
```

### Performance Characteristics

- **Vector Similarity**: ~50ms (includes embedding lookup)
- **Common Neighbors**: ~30ms (graph traversal)
- **Graph Proximity**: ~40ms (BFS up to 2 hops)
- **Inference**: ~20ms (rule application)
- **Total (all strategies)**: ~140ms for 10 suggestions

---

## T-GRAG Temporal Conflict Resolution (v2.9)

Inspired by T-GRAG (Li et al., 2025), the system automatically detects and resolves temporal conflicts in observations.

### Conflict Types

1. **Semantic Contradiction**
   - Detects contradictory statements across time periods
   - Keyword-based detection with 4 pattern categories
   - Example: "Service is active" → "Service has been discontinued"

2. **Temporal Redundancy**
   - Identifies nearly identical observations
   - Embedding-based similarity detection (≥85% similarity)
   - Example: "Project has 5 members" → "Project is developed by 5 people"

3. **Superseded Fact**
   - Recognizes updated information
   - Supersession keywords: "updated", "revised", "corrected", "now", "latest"
   - Example: "Revenue was $10M" → "Updated: Revenue is $12M"

### Contradiction Patterns

```typescript
// Status contradictions
positive: ['active', 'running', 'ongoing', 'operational', 'continued']
negative: ['inactive', 'discontinued', 'cancelled', 'stopped', 'shut down']

// Boolean contradictions
positive: ['yes', 'true', 'confirmed', 'approved', 'accepted', 'enabled']
negative: ['no', 'false', 'denied', 'rejected', 'refused', 'disabled']

// Existence contradictions
positive: ['exists', 'present', 'available', 'found', 'located']
negative: ['missing', 'absent', 'unavailable', 'not found', 'removed']

// Quantity contradictions
positive: ['increased', 'grew', 'rose', 'higher', 'more', 'expanded']
negative: ['decreased', 'fell', 'dropped', 'lower', 'less', 'reduced']
```

### Usage Example

```typescript
import { TemporalConflictResolutionService } from './temporal-conflict-resolution';

const conflictService = new TemporalConflictResolutionService(db, embeddings, {
  similarityThreshold: 0.85,
  contradictionThreshold: 0.3,
  autoResolve: false,
  preserveAuditTrail: true
});

const conflicts = await conflictService.detectConflicts(entityId);
const resolution = await conflictService.resolveConflicts(entityId);
```

### Resolution Strategy

1. Older observation is invalidated via CozoDB Validity (`:delete`)
2. Audit observation is created with conflict metadata
3. Newer observation remains valid

### Performance Characteristics

- **Conflict Detection**: ~100ms for 10 observations
- **Embedding Comparison**: ~5ms per pair (Cosine Similarity)
- **Keyword Analysis**: ~2ms per pair
- **Conflict Resolution**: ~50ms per conflict (including audit trail)

---

## Multi-Hop Reasoning with Vector Pivots (v2.5)

Research-backed implementation based on HopRAG (ACL 2025), Retrieval Pivot Attacks, and Neo4j GraphRAG patterns.

### Retrieve-Reason-Prune Pipeline

1. **RETRIEVE**: Find semantic pivot points via HNSW vector search
2. **REASON**: Logic-aware graph traversal with relationship context
3. **PRUNE**: Helpfulness scoring combining textual similarity + logical importance
4. **AGGREGATE**: Deduplicate and rank entities by occurrence and confidence

### Key Features

- **Logic-Aware Traversal**: Considers relationship types, strengths, and PageRank scores
- **Helpfulness Scoring**: Combines semantic similarity (60%) + logical importance (40%)
- **Pivot Depth Security**: Enforces max depth limit to prevent uncontrolled graph expansion
- **Confidence Decay**: Exponential decay (0.9^depth) for recency weighting
- **Adaptive Pruning**: Filters paths below confidence threshold

### Usage Example

```typescript
const multiHop = new MultiHopVectorPivot(db, embeddingService);
const result = await multiHop.multiHopVectorPivot(
  "how does deep learning relate to NLP",
  maxHops: 3,
  limit: 10
);
```

### Research Foundation

- **HopRAG (ACL 2025)**: Logic-aware RAG with pseudo-queries as edges
- **Retrieval Pivot Attacks**: Security patterns for hybrid RAG systems
- **Neo4j GraphRAG**: Multi-hop reasoning patterns for knowledge graphs

---

## Query-Aware Flow Diffusion (QAFD-RAG)

Research-backed implementation based on ICLR 2026 QAFD-RAG paper, enabling query-aware graph traversal with dynamic edge weighting.

### Core Algorithm

1. **Query Embedding**: Generate embedding for the search query
2. **Dynamic Edge Weighting**: Compute edge weights via cosine similarity between query embedding and node embeddings
3. **Flow Diffusion**: Propagate relevance scores through graph using damping factor
4. **Score Aggregation**: Combine scores from multiple paths

### Key Features

- **Training-Free**: Uses existing embeddings, no model training required
- **Query-Aware**: Edge weights adapt based on query relevance
- **Flow Diffusion**: Damping factor (α = 0.85) prevents over-propagation
- **Multi-Seed Support**: Can start from multiple seed nodes
- **Hybrid Search**: Combines vector seed discovery with graph expansion

### Usage Example

```typescript
import { QueryAwareTraversal } from './query-aware-traversal';

const qaTraversal = new QueryAwareTraversal(db, embeddingService);

// Hybrid: Vector search + Query-aware expansion
const results = await qaTraversal.hybridSearch(
  'JavaScript frameworks for building user interfaces',
  {
    seedTopK: 3,        // Top 3 vector seeds
    maxHops: 2,         // Maximum 2 hops
    dampingFactor: 0.85, // Flow diffusion damping
    minScore: 0.05,     // Minimum relevance score
    topK: 10            // Return top 10 results
  }
);

// Single-seed traversal
const singleSeed = await qaTraversal.querySensitiveTraversal(
  'machine learning',
  'entity-id-123',
  { maxHops: 3, dampingFactor: 0.85 }
);

// Multi-seed traversal
const multiSeed = await qaTraversal.multiSeedTraversal(
  'deep learning applications',
  ['entity-1', 'entity-2', 'entity-3'],
  { maxHops: 2, dampingFactor: 0.9 }
);
```

### Algorithm Details

**Edge Weight Calculation:**
```
weight(query, node) = cosine_similarity(query_embedding, node_embedding)
```

**Flow Diffusion:**
```
score(node, hop) = α * Σ(score(neighbor, hop-1) * weight(query, neighbor))
```

Where:
- α = damping factor (default: 0.85)
- Prevents score explosion in dense graphs
- Balances local relevance with global structure

### Performance Characteristics

- **Vector Seed Discovery**: 50-100ms (HNSW search)
- **Edge Weight Computation**: ~2ms per node (cosine similarity)
- **Flow Diffusion**: ~5ms per hop (graph traversal)
- **Total (2 hops, 3 seeds)**: ~150-200ms

### Configuration Options

```typescript
interface QAFDOptions {
  seedTopK?: number;        // Number of vector seeds (default: 5)
  maxHops?: number;         // Maximum traversal depth (default: 2)
  dampingFactor?: number;   // Flow diffusion damping (default: 0.85)
  minScore?: number;        // Minimum relevance threshold (default: 0.05)
  topK?: number;            // Final result limit (default: 10)
  relationTypes?: string[]; // Filter by relationship types
}
```

### Research Foundation

- **QAFD-RAG (ICLR 2026)**: Query-aware flow diffusion for graph retrieval
- **Flow-based Graph Algorithms**: PageRank-inspired relevance propagation
- **Dynamic Graph Weighting**: Query-dependent edge importance

---

## Logical Edges from Knowledge Graph (v1.0)

Research-backed implementation based on SAGE (ICLR 2026), Metadata Knowledge Graphs, and Knowledge Graph Completion research.

### Five Logical Edge Patterns

1. **Same Category Edges** - Entities with identical category metadata (confidence: 0.8)
2. **Same Type Edges** - Entities of the same type (confidence: 0.7)
3. **Hierarchical Edges** - Parent-child relationships from metadata (confidence: 0.9)
4. **Contextual Edges** - Entities sharing domain, time period, location, or organization (confidence: 0.7-0.75)
5. **Transitive Logical Edges** - Derived from explicit relationships + metadata patterns (confidence: 0.55-0.6)

### Usage Example

```typescript
const logicalEdges = new LogicalEdgesService(db);

// Discover all logical edges for an entity
const edges = await logicalEdges.discoverLogicalEdges(entityId);

// Optionally materialize as explicit relationships
const created = await logicalEdges.materializeLogicalEdges(entityId);
```

### Key Features

- **Metadata-Driven**: Discovers relationships from entity metadata without explicit encoding
- **Multi-Pattern**: Combines 5 different logical inference patterns
- **Deduplication**: Automatically removes duplicate edges, keeping highest confidence
- **Materialization**: Optional: create explicit relationships for performance optimization
- **Explainability**: Each edge includes reason and pattern for interpretability

### Research Foundation

- **SAGE (ICLR 2026)**: Metadata-driven knowledge graph completion
- **Atlan Metadata Knowledge Graphs (2026)**: Metadata as first-class citizens
- **Knowledge Graph Completion (2024-2026)**: Implicit relationship discovery

---

## MCP Tools Reference

For complete MCP tool documentation, see [README.md](README.md#mcp-tools).

### Quick Reference

- **mutate_memory**: Write operations (create, update, delete, transactions)
- **query_memory**: Read operations (search, context, graph-rag, agentic)
- **analyze_graph**: Graph analysis (explore, communities, pagerank, shortest_path)
- **manage_system**: Maintenance (health, metrics, export, import, cleanup, defrag)

---

## Additional Resources

- [CHANGELOG.md](CHANGELOG.md) - Version history and release notes
- [README.md](README.md) - Quick start and installation guide
- [CONTRIBUTING.md](CONTRIBUTING.md) - Development guidelines
- [sota_research_2026.md](sota_research_2026.md) - Research and implementation status


---

## Dynamic Fusion Framework (v2.3)

The Dynamic Fusion Framework combines 4 retrieval paths with configurable weights and fusion strategies.

### Retrieval Paths

1. **Dense Vector Search (HNSW)**: Semantic similarity via embeddings
2. **Sparse Vector Search**: Keyword-based matching with TF-IDF scoring
3. **Full-Text Search (FTS)**: BM25 scoring on entity names
4. **Graph Traversal**: Multi-hop relationship expansion from vector seeds

### Fusion Strategies

- `rrf` (Reciprocal Rank Fusion): Combines rankings with position-based scoring
- `weighted_sum`: Direct weighted combination of scores
- `max`: Takes maximum score across all paths
- `adaptive`: Query-dependent weighting (future enhancement)

### Configuration Example

```json
{
  "action": "dynamic_fusion",
  "query": "database with graph capabilities",
  "limit": 10,
  "config": {
    "vector": {
      "enabled": true,
      "weight": 0.4,
      "topK": 20,
      "efSearch": 100
    },
    "sparse": {
      "enabled": true,
      "weight": 0.3,
      "topK": 20,
      "minScore": 0.1
    },
    "fts": {
      "enabled": true,
      "weight": 0.2,
      "topK": 20,
      "fuzzy": true
    },
    "graph": {
      "enabled": true,
      "weight": 0.1,
      "maxDepth": 2,
      "maxResults": 20,
      "relationTypes": ["related_to", "uses"]
    },
    "fusion": {
      "strategy": "rrf",
      "rrfK": 60,
      "minScore": 0.0,
      "deduplication": true
    }
  }
}
```

### Response Format

**Response includes:**
- `results`: Fused and ranked results with path contribution details
- `stats`: Performance metrics including:
  - `totalResults`: Number of results after fusion
  - `pathContributions`: Count of results from each path
  - `fusionTime`: Total execution time
  - `pathTimes`: Individual execution times per path

### Use Cases

- **Broad Exploration**: Enable all paths with balanced weights
- **Precision Search**: High vector weight, low graph weight
- **Relationship Discovery**: High graph weight with specific relation types
- **Keyword Matching**: High sparse/FTS weights for exact term matching

---

## Inference Engine

The Inference Engine discovers implicit relationships using multiple strategies.

### Strategies

1. **Co-occurrence**: Entity names in observation texts
   - Relation type: `related_to`
   - Confidence: 0.7

2. **Semantic Proximity**: Similar entities via HNSW
   - Relation type: `similar_to`
   - Confidence: up to 0.9

3. **Transitivity**: A→B and B→C implies A→C
   - Relation type: `potentially_related`
   - Confidence: 0.5

4. **Expertise Rule**: Person + works_on + uses_tech
   - Relation type: `expert_in`
   - Confidence: 0.7

5. **Query-Triggered Expertise**: Search queries with keywords like `expert`, `skill`, `knowledge`, `competence` automatically trigger a dedicated expert search over the graph network.

### Transparency

- Inference candidates are marked as `source: "inference"`
- Each includes a short reason (uncertainty hint)
- In `context` output, inferred entities carry an `uncertainty_hint` so LLMs can distinguish "hard fact" vs. "conjecture"

---

## Hybrid Search Details

### Search Components

The hybrid search combines:
- **Vector similarity** via HNSW indices (`~entity:semantic`, `~observation:semantic`)
- **Keyword matching** via Regex (`regex_matches(...)`)
- **Graph signal** via PageRank (for central entities)
- **Community Expansion**: Entities from the community of top seeds are introduced with a boost
- **Inference signal**: Probabilistic candidates with confidence scores

### Fusion Process

Fusion via Reciprocal Rank Fusion (RRF) across sources: `vector`, `keyword`, `graph`, `community`, `inference`.

### Temporal Decay

Active by default with configurable parameters:
- Before RRF fusion, scores are dampened based on time (`created_at`)
- Half-life: 90 days (exponential decay)
- Source-specific floors:
  - `keyword`: no decay (explicitly searched)
  - `graph`/`community`: at least 0.6
  - `vector`: at least 0.2

---

## Production Monitoring

### Health Endpoint

The `health` action provides real-time system status:

```json
{ "action": "health" }
```

**Returns:**
- Database counts (entities, observations, relationships)
- Embedding cache statistics (hit rate, size)
- Performance metrics (last operation time, average time, total operations)

### Metrics Endpoint

The `metrics` action provides detailed operational metrics:

```json
{ "action": "metrics" }
```

**Returns:**
- **operations**: Count of each operation type (create_entity, update_entity, delete_entity, add_observation, create_relation, search, graph_operations)
- **errors**: Total errors and breakdown by operation type
- **performance**: Last operation duration, average duration, total operations executed

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

---

## Self-Improving Memory Loop (`reflect`)

The `reflect` service analyzes observations of an entity (or top 5 active entities) to find contradictions, patterns, or temporal developments.

### Modes

- **summary** (default): Generates a textual "Reflective Insight" observation
- **discovery**: Autonomously finds potential relationships using the Inference Engine and validates them via LLM
  - High-confidence links (>0.8) are created automatically
  - Medium-confidence links (>0.5) are returned as suggestions

### Configuration

Defaults:
- `older_than_days`: 30
- `max_observations`: 20
- `min_entity_degree`: 2
- `model`: "demyagent-4b-i1:Q6_K"

### Output

Results are persisted as:
- New observations (for `summary`) with metadata field `{ "kind": "reflection" }`
- Relationships (for `discovery`) with metadata field `{ "source": "reflection" }`
- Text is stored with prefix `Reflective Insight: `

---

## Export/Import

### Export Formats

**JSON** (`format: "json"`):
- Native Cozo format
- Fully re-importable with all metadata and timestamps

**Markdown** (`format: "markdown"`):
- Human-readable document
- Entities, observations, and relationships

**Obsidian** (`format: "obsidian"`):
- ZIP archive with Wiki-Links `[[Entity]]`
- YAML frontmatter
- Ready for Obsidian vault

### Import Formats

**Cozo** (`sourceFormat: "cozo"`):
- Import from native JSON export

**Mem0** (`sourceFormat: "mem0"`):
- Import from Mem0 format
- `user_id` becomes entity

**MemGPT** (`sourceFormat: "memgpt"`):
- Import from MemGPT archival/recall memory

**Markdown** (`sourceFormat: "markdown"`):
- Parse markdown sections as entities with observations

### Merge Strategies

- `skip` (default): Skip duplicates
- `overwrite`: Replace existing
- `merge`: Combine metadata

### Optional Filters

- `entityTypes`: Array of entity types
- `since`: Unix timestamp in ms
- `includeMetadata`: Boolean
- `includeRelationships`: Boolean
- `includeObservations`: Boolean

### Examples

**Export:**
```json
{
  "action": "export_memory",
  "format": "obsidian",
  "includeMetadata": true,
  "entityTypes": ["Person", "Project"]
}
```

**Import:**
```json
{
  "action": "import_memory",
  "sourceFormat": "mem0",
  "data": "{\"user_id\": \"alice\", \"memories\": [...]}",
  "mergeStrategy": "skip"
}
```

---

## CLI Reference

Complete command reference for the CozoDB Memory CLI.

### System Operations

```bash
cozo-memory system health          # System status
cozo-memory system metrics         # Detailed metrics
cozo-memory system reflect         # Memory reflection
```

### Entity Operations

```bash
cozo-memory entity create -n "MyEntity" -t "person" -m '{"age": 30}'
cozo-memory entity get -i <entity-id>
cozo-memory entity delete -i <entity-id>
```

### Observations

```bash
cozo-memory observation add -i <entity-id> -t "Some note"
```

### Relations

```bash
cozo-memory relation create --from <id1> --to <id2> --type "knows" -s 0.8
```

### Search

```bash
cozo-memory search query -q "search term" -l 10
cozo-memory search context -q "context query"
cozo-memory search agentic -q "agentic query"
```

### Graph Operations

```bash
cozo-memory graph explore -s <entity-id> -h 3
cozo-memory graph pagerank
cozo-memory graph communities
cozo-memory graph summarize
```

### Session & Task Management

```bash
cozo-memory session start -n "My Session"
cozo-memory session stop -i <session-id>
cozo-memory task start -n "My Task" -s <session-id>
cozo-memory task stop -i <task-id>
```

### Export/Import

```bash
cozo-memory export json -o backup.json --include-metadata --include-relationships --include-observations
cozo-memory export markdown -o notes.md
cozo-memory export obsidian -o vault.zip
cozo-memory import file -i data.json -f cozo
```

### Output Formatting

All commands support `-f json` or `-f pretty` for output formatting.

---

## Framework Adapters

### LangChain Adapter

```bash
npm install @cozo-memory/langchain @cozo-memory/adapters-core
```

```typescript
import { CozoMemoryChatHistory, CozoMemoryRetriever } from '@cozo-memory/langchain';
import { BufferMemory } from 'langchain/memory';

// Chat history with session management
const chatHistory = new CozoMemoryChatHistory({
  sessionName: 'user-123'
});

const memory = new BufferMemory({ chatHistory });

// Retriever with hybrid search or Graph-RAG
const retriever = new CozoMemoryRetriever({
  useGraphRAG: true,
  graphRAGDepth: 2
});
```

### LlamaIndex Adapter

```bash
npm install @cozo-memory/llamaindex @cozo-memory/adapters-core
```

```typescript
import { CozoVectorStore } from '@cozo-memory/llamaindex';
import { VectorStoreIndex } from 'llamaindex';

// Vector store with Graph-RAG support
const vectorStore = new CozoVectorStore({
  useGraphRAG: true
});

const index = await VectorStoreIndex.fromDocuments(
  documents,
  { vectorStore }
);
```

**Features:**
- ✅ Persistent chat history (LangChain)
- ✅ Hybrid search retrieval (both)
- ✅ Graph-RAG mode (both)
- ✅ Session management (LangChain)
- ✅ Vector store operations (LlamaIndex)

**Documentation:** See [adapters/README.md](./adapters/README.md) for complete examples and API reference.
