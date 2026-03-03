# Performance Testing & Optimization

## Running Performance Tests

### Small Dataset Test (100 entities)
```bash
npx ts-node src/test-large-dataset.ts small
```

### Medium Dataset Test (500 entities)
```bash
npx ts-node src/test-large-dataset.ts medium
```

### Large Dataset Test (2000 entities)
```bash
npx ts-node src/test-large-dataset.ts large
```

## Expected Performance Metrics

### Small Dataset (100 entities, 300 observations, 150 relationships)
- Entity creation: ~50-100ms per entity (includes embedding)
- Observation creation: ~30-50ms per observation
- Relationship creation: ~10-20ms per relationship
- Search queries: ~50-200ms per query
- Total throughput: ~5-10 ops/sec

### Medium Dataset (500 entities, 2500 observations, 1000 relationships)
- Entity creation: ~50-100ms per entity
- Observation creation: ~30-50ms per observation
- Relationship creation: ~10-20ms per relationship
- Search queries: ~100-300ms per query
- Total throughput: ~5-10 ops/sec

### Large Dataset (2000 entities, 20000 observations, 5000 relationships)
- Entity creation: ~50-100ms per entity
- Observation creation: ~30-50ms per observation
- Relationship creation: ~10-20ms per relationship
- Search queries: ~200-500ms per query
- Total throughput: ~5-10 ops/sec

## Performance Bottlenecks

### 1. Embedding Generation
- **Impact**: Highest latency contributor
- **Optimization**: 
  - Embeddings are cached in memory (LRU cache, 1000 items)
  - Batch embedding generation for bulk operations
  - Consider GPU acceleration for large-scale deployments

### 2. Vector Search (HNSW)
- **Impact**: Scales logarithmically with dataset size
- **Optimization**:
  - Adjust `ef_search` parameter (default: 100)
  - Lower values = faster but less accurate
  - Higher values = slower but more accurate

### 3. Graph Traversal
- **Impact**: Increases with graph depth and connectivity
- **Optimization**:
  - Limit `maxDepth` parameter (default: 2)
  - Use filtered indexes for specific entity types
  - Consider graph pruning for dense graphs

## Optimization Strategies

### Database Backend

**SQLite (Default)**
- Good for: Development, small-medium datasets (<100k entities)
- Pros: Simple, no setup required
- Cons: Limited concurrency, slower for large datasets

**RocksDB (Recommended for Production)**
- Good for: Production, large datasets (>100k entities)
- Pros: Better performance, higher concurrency
- Cons: Requires compilation, larger disk footprint

```bash
# Switch to RocksDB
DB_ENGINE=rocksdb npm start
```

### Caching Strategy

1. **Embedding Cache**: 1000 most recent embeddings in memory
2. **Search Cache**: Persistent L2 cache in database
3. **Query Results**: Cached with TTL (configurable)

### Batch Operations

For bulk data ingestion, use transactions:

```typescript
await memoryService.runTransaction([
  { action: 'create_entity', params: {...} },
  { action: 'create_entity', params: {...} },
  { action: 'add_observation', params: {...} }
]);
```

## Monitoring in Production

### Enable Performance Monitoring

```typescript
import { perfMonitor } from './performance-monitor';

// Log summary every hour
setInterval(() => {
  perfMonitor.logSummary();
}, 3600000);
```

### Key Metrics to Track

1. **Operation Latency**
   - P50, P95, P99 percentiles
   - Average response time
   - Error rate

2. **Throughput**
   - Operations per second
   - Queries per second
   - Embedding generation rate

3. **Resource Usage**
   - Memory consumption
   - Disk I/O
   - CPU utilization

4. **Cache Hit Rates**
   - Embedding cache hit rate
   - Search cache hit rate

## Troubleshooting Slow Performance

### Symptom: Slow search queries

**Diagnosis:**
```bash
LOG_LEVEL=DEBUG npm start
```

Check for:
- High `ef_search` values
- Large result sets
- Complex graph traversals

**Solutions:**
- Reduce `ef_search` to 50-100
- Limit result count
- Use entity type filters
- Enable search caching

### Symptom: Slow entity creation

**Diagnosis:**
- Check embedding generation time
- Check database write performance

**Solutions:**
- Batch entity creation
- Use transactions for bulk operations
- Consider RocksDB backend

### Symptom: High memory usage

**Diagnosis:**
- Check embedding cache size
- Check search cache size

**Solutions:**
- Reduce cache sizes
- Clear caches periodically
- Use database-backed caching

## Benchmarking

Run comprehensive benchmarks:

```bash
# Run all benchmark tests
npm run benchmark

# Specific benchmarks
npx ts-node src/benchmark.ts
npx ts-node src/benchmark-heavy.ts
```

## Production Recommendations

1. **Use RocksDB backend** for datasets >10k entities
2. **Set LOG_LEVEL=INFO** or WARN in production
3. **Monitor performance metrics** continuously
4. **Enable search caching** for frequently accessed queries
5. **Use batch operations** for bulk data ingestion
6. **Tune HNSW parameters** based on accuracy/speed tradeoff
7. **Regular database maintenance** (defrag, cleanup)
