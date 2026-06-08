# Performance & Benchmarks

Performance metrics and evaluation results for CozoDB Memory.

## Benchmark Results

Benchmarks on a standard developer laptop (Windows, Node.js 20+, CPU-only, Xenova/bge-m3, SQLite):

| Metric | Value | Note |
| :--- | :--- | :--- |
| **Graph-Walking (Recursive)** | **~62 ms** | Vector Seed + Recursive Datalog Traversal |
| **Graph-RAG (Breadth-First)** | **~60 ms** | Vector Seeds + 2-Hop Expansion |
| **Hybrid Search (Cold)** | **~56 ms** | FTS + HNSW + RRF Fusion |
| **Vector Search (Raw)** | **~2.7 ms** | Pure semantic search as reference |
| **Ingestion** | **~101 ms** | Per Op (Write + Embedding + FTS/LSH Indexing) |
| **RAM Usage** | **~1504 MB RSS / ~217 MB Heap** | See memory breakdown below |

## Running Benchmarks

You can test performance on your system with the integrated benchmark tool:

```bash
npm run benchmark
```

This tool (`src/benchmark.ts`) performs the following tests:

1. **Initialization**: Cold start duration of the server incl. model loading
2. **Ingestion**: Mass import of test entities and observations (throughput)
3. **Search Performance**: Latency measurement for Hybrid Search vs. Raw Vector Search
4. **RRF Overhead**: Determination of additional computation time for fusion logic

## Evaluation Suite (RAG Quality)

To evaluate the quality and recall of different retrieval strategies (Search vs. Graph-RAG vs. Graph-Walking), use the evaluation suite:

```bash
npm run eval
```

This tool compares strategies using a synthetic dataset and measures **Recall@K**, **MRR**, and **Latency**.

### Evaluation Results

Latest measured numbers from the harder evaluation set with ambiguity, temporal changes, contradictions, and 220 distractor observations:

| Method | Recall@10 | Recall@3 | MRR | nDCG@10 | Avg Latency | Best For |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Graph-RAG** | **1.000** | **0.700** | 0.486 | **0.790** | **~52 ms** | Deep relational reasoning |
| **Hybrid Search** | **0.850** | **0.650** | 0.458 | **0.548** | **~66 ms** | Broad factual retrieval |
| **Graph-Walking** | **0.850** | **0.650** | 0.458 | **0.584** | **~66 ms** | Associative path exploration |

Notes:
- Values are from `src/benchmark.ts` on Windows / Node.js 20 / CPU-only / Xenova/bge-m3 / SQLite.
- Reranking is currently disabled in the default benchmark because the bundled reranker model path is incompatible with the installed Transformers.js pipeline set; rerank metrics should be added once that integration is fixed.
- Do not insert internal estimates for other systems into the comparison table below; use only vendor docs, peer-reviewed benchmarks, or reproducible public reports.

## Performance Characteristics by Feature

### Hybrid Search

**Cold Start:**
- Vector Search: ~2.6ms
- Graph-RAG seed + expansion: ~61.9ms
- Graph-Walking traversal: ~58.1ms
- Hybrid Search total: ~55.8ms

**Why Graph-RAG can be faster than Hybrid Search:**
- `graphRag()` uses a narrower candidate pipeline: vector seed selection, then graph expansion, then lightweight scoring.
- `advancedSearch()` used by `search()` builds a more general Datalog query with multiple optional constraints, post-filtering, time decay, and context boosts.
- In the current synthetic benchmark, the graph-backed methods benefit from a smaller effective candidate set and earlier pruning, while Hybrid Search pays for broader query planning and result post-processing.
- This does not mean Graph-RAG is universally faster; for broad factual retrieval with filters or time constraints, Hybrid Search is expected to be stronger despite higher average latency.

**Warm Cache:**
- L1 Memory Cache Hit: <0.1ms
- L2 Persistent Cache Hit: ~2ms

**Factors:**
- Query complexity
- Number of candidate results
- Cache hit rate
- Temporal decay calculations
- Applied post-filters and graph constraints

### Graph-RAG

**Measured Performance:**
- Vector Seed Search: part of ~61.9ms total
- Graph Expansion (2 hops): included in total
- Result Aggregation: included in total
- Total: ~61.9ms measured in current benchmark

**Why this can beat Hybrid Search in current measurements:**
- Narrower retrieval path with fewer post-processing stages
- Smaller candidate set before ranking/scoring
- Earlier effective pruning in graph expansion

**Factors:**
- Max depth (default: 2)
- Number of seed entities
- Graph density
- Relationship types

### Graph-Walking

**Measured Performance:**
- Vector Seed Search: part of ~58.1ms total
- Recursive Traversal: included in total
- Semantic Filtering: included in total
- Total: ~58.1ms measured in current benchmark

**Factors:**
- Max depth (default: 3)
- Similarity threshold
- Graph connectivity
- Number of paths explored

### Agentic Search

**Performance:**
- LLM Classification: 50-200ms (Ollama)
- Strategy Execution: 30-130ms (varies by strategy)
- Total: 80-330ms

**Factors:**
- LLM model size
- Selected strategy
- Query complexity

### Adaptive Retrieval

**Performance:**
- Query Classification: <1ms (heuristic) or 50-200ms (LLM)
- Strategy Selection: <1ms
- Strategy Execution: 30-130ms
- Total: 30-330ms

**Factors:**
- Classification method (heuristic vs LLM)
- Selected strategy
- Historical performance data

### Dynamic Fusion

**Performance:**
- Vector Path: ~51ms
- Sparse Path: ~30ms
- FTS Path: ~12ms
- Graph Path: ~80ms
- Fusion: ~5ms
- Total: ~35-180ms (depends on enabled paths)

**Factors:**
- Enabled paths
- Fusion strategy (RRF, weighted_sum, max, adaptive)
- Path weights
- Result deduplication

### Embedding Generation

**Performance:**
- First embedding (cold): ~200ms (model loading)
- Subsequent embeddings: ~5-10ms per text
- Cache hit: <0.1ms

**Factors:**
- Text length
- Model size (bge-m3: 1024 dims)
- CPU performance
- Cache hit rate

### Reranking

**Performance:**
- Cross-Encoder (top 10): ~4-6ms
- Cross-Encoder (top 20): ~8-12ms

**Factors:**
- Number of candidates
- Text length
- Model size (ms-marco-MiniLM-L-6-v2)

## Memory Usage

### Baseline

- Node.js Runtime: ~50 MB
- CozoDB SQLite: ~20 MB
- Application Code: ~10 MB

### Embedding Model

- bge-m3 (default): ~1.1 GB
- all-MiniLM-L6-v2: ~300 MB
- bge-small-en-v1.5: ~500 MB

### Reranker Model

- ms-marco-MiniLM-L-6-v2: ~80 MB

### Database

- Empty database: ~1 MB
- Per entity: ~2 KB (with embeddings)
- Per observation: ~1.5 KB (with embeddings)
- Per relationship: ~0.5 KB

### Caches

- L1 Embedding Cache: ~10 MB (1000 entries)
- L2 Search Cache: ~5 MB (persistent)
- HNSW Index: ~1 MB per 1000 entities

## Optimization Tips

### For Low-Spec Machines

1. Use lightweight embedding model:
   ```bash
   EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2 npm run start
   ```

2. Reduce cache sizes in code:
   ```typescript
   // src/embedding-service.ts
   const cache = new LRU({ max: 500 }); // Default: 1000
   ```

3. Disable reranking (saves ~80 MB RAM)

### For Large Datasets

1. Use RocksDB backend:
   ```bash
   DB_ENGINE=rocksdb npm run start
   ```

2. Increase HNSW parameters for better recall:
   ```typescript
   // In search queries
   vectorOptions: { efSearch: 200 } // Default: 100
   ```

3. Run periodic defragmentation:
   ```json
   { "action": "defrag", "confirm": true }
   ```

### For Best Performance

1. Pre-download embedding model:
   ```bash
   npm run download-model
   ```

2. Enable semantic caching (enabled by default)

3. Use appropriate search strategy:
   - Simple queries: `search` (fastest)
   - Relational queries: `graph_rag` (best accuracy)
   - Complex queries: `adaptive_retrieval` (automatic)

4. Batch operations with transactions:
   ```json
   { "action": "run_transaction", "operations": [...] }
   ```

## Scalability

### Tested Limits

- **Entities**: 100,000+ (with RocksDB)
- **Observations**: 500,000+ (with RocksDB)
- **Relationships**: 1,000,000+ (with RocksDB)
- **Concurrent Queries**: 10+ (stdio limitation)

### Bottlenecks

1. **Embedding Generation**: CPU-bound, ~5-10ms per text
2. **Graph Traversal**: Scales with graph density
3. **Vector Search**: Scales logarithmically (HNSW)
4. **FTS Search**: Scales linearly with text corpus

### Recommendations by Scale

| Dataset Size | Backend | Model | Notes |
|--------------|---------|-------|-------|
| < 10k entities | SQLite | bge-m3 | Default configuration |
| 10k-100k entities | SQLite | bge-m3 | Consider periodic cleanup |
| 100k-1M entities | RocksDB | bge-m3 | Enable defragmentation |
| > 1M entities | RocksDB | bge-small | Consider sharding |

## Comparison with other solutions

A common question when evaluating this project is: *"Why not just combine existing tools like SQLite + Chroma + NetworkX?"*

The short answer: **CozoDB is a single engine** that natively combines relational, graph, vector, and full-text search. That means one query language, one index, one file, and no sync lag between separate systems. The "separate stack" approach usually works, but it multiplies operational complexity, ETL code, and failure surfaces.

Measured values for CozoDB Memory come from `npm run benchmark` and `npm run eval` on the same hardware/config. Values for Chroma, Qdrant, and Mem0 should be replaced only with cited external/public benchmarks.

| Test | Cozo Memory | Chroma | Qdrant | Mem0 |
| :--- | :--- | :--- | :--- | :--- |
| **Recall@10** | 0.850 (Hybrid Search), 1.000 (Graph-RAG) | [external/public] | [external/public] | [external/public] |
| **Query-Latenz** | ~56 ms Hybrid Search, ~60 ms Graph-RAG, ~62 ms Graph-Walking | [external/public] | [external/public] | [external/public] |
| **Speicherverbrauch** | ~1504 MB RSS, ~217 MB Heap | [external/public] | [external/public] | [external/public] |
| **nDCG@10** | 0.548 (Hybrid Search), 0.814 (Graph-RAG), 0.584 (Graph-Walking) | [external/public] | [external/public] | [external/public] |
| **Agent-Task-Success** | not measured in current benchmark suite | [external/public] | [external/public] | [external/public] |

Notes:
- Cozo Memory numbers above were generated with `src/benchmark.ts` on Windows / Node.js 20 / CPU-only / Xenova/bge-m3 / SQLite.
- Reranking is currently disabled in the default benchmark because the bundled reranker model path is incompatible with the installed Transformers.js pipeline set; rerank metrics should be added once that integration is fixed.
- Do not insert internal estimates for other systems; use only vendor docs, peer-reviewed benchmarks, or reproducible public reports.

Run `npm run benchmark -- --format markdown --no-rerank` to refresh these numbers.

## See Also

- [Architecture](ARCHITECTURE.md) - System architecture
- [API Reference](API.md) - Complete API documentation
- [Features](FEATURES.md) - Feature documentation
