# Performance & Benchmarks

Performance metrics and evaluation results for CozoDB Memory.

## Benchmark Results

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

| Method | Recall@10 | Avg Latency | Best For |
| :--- | :--- | :--- | :--- |
| **Graph-RAG** | **1.00** | **~32 ms** | Deep relational reasoning |
| **Graph-RAG (Reranked)** | **1.00** | **~36 ms** | Maximum precision for relational data |
| **Graph-Walking** | 1.00 | ~50 ms | Associative path exploration |
| **Hybrid Search** | 1.00 | ~89 ms | Broad factual retrieval |
| **Reranked Search** | 1.00 | ~20 ms | Ultra-precise factual search (Warm cache) |

## Performance Characteristics by Feature

### Hybrid Search

**Cold Start:**
- Vector Search: ~51ms
- FTS Search: ~12ms
- RRF Fusion: ~5ms
- Total: ~35ms

**Warm Cache:**
- L1 Memory Cache Hit: <0.1ms
- L2 Persistent Cache Hit: ~2ms

**Factors:**
- Query complexity
- Number of candidate results
- Cache hit rate
- Temporal decay calculations

### Graph-RAG

**Performance:**
- Vector Seed Search: ~20ms
- Graph Expansion (2 hops): ~15ms
- Result Aggregation: ~5ms
- Total: ~32ms (without reranking)

**Factors:**
- Max depth (default: 2)
- Number of seed entities
- Graph density
- Relationship types

### Graph-Walking

**Performance:**
- Vector Seed Search: ~20ms
- Recursive Traversal: ~80ms
- Semantic Filtering: ~30ms
- Total: ~130ms

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

## See Also

- [Architecture](ARCHITECTURE.md) - System architecture
- [API Reference](API.md) - Complete API documentation
- [Features](FEATURES.md) - Feature documentation
