# Embedding Model Performance Test

## Test Setup

**Date**: 2026-02-28  
**Model Tested**: `Xenova/all-MiniLM-L6-v2`  
**Baseline**: `Xenova/bge-m3`

## Configuration

```json
{
  "mcpServers": {
    "cozo-memory": {
      "command": "npx",
      "args": ["cozo-memory"],
      "env": {
        "EMBEDDING_MODEL": "Xenova/all-MiniLM-L6-v2"
      }
    }
  }
}
```

## Initial Health Check

```json
{
  "status": "healthy",
  "database": {
    "entities": 0,
    "observations": 0,
    "relations": 0
  },
  "performance": {
    "embedding_cache": {
      "size": 0,
      "maxSize": 1000,
      "model": "Xenova/all-MiniLM-L6-v2",
      "dimensions": 384
    }
  }
}
```

✅ Model loaded successfully with 384 dimensions

## Test 1: Entity Creation

**Test**: Create 5 entities with different topics

**Result**: ❌ FAILED

**Error**: 
```
bad list length: expected datatype <F32;1024>, got length 384
```

**Root Cause**: Database schema is hardcoded to 1024 dimensions in `index.ts`

**Schema Definition** (current):
```typescript
embedding <F32; 1024>,
name_embedding <F32; 1024>,
```

**Problem**: The schema doesn't adapt to the model's actual dimensions (384 for MiniLM-L6-v2)

## Critical Bug Identified

The `EMBEDDING_MODEL` environment variable changes the embedding dimensions, but the CozoDB schema remains fixed at 1024 dimensions. This causes a mismatch:

- **EmbeddingService** generates 384-dim vectors
- **CozoDB schema** expects 1024-dim vectors
- **Result**: All write operations fail

## Required Fix

The schema initialization in `src/index.ts` needs to:

1. Read `EMBEDDING_DIM` from `EmbeddingService`
2. Use dynamic dimension in schema creation
3. Ensure schema matches model dimensions

**Current Code** (broken):
```typescript
embedding <F32; 1024>,
name_embedding <F32; 1024>,
```

**Required Code** (dynamic):
```typescript
embedding <F32; ${EMBEDDING_DIM}>,
name_embedding <F32; ${EMBEDDING_DIM}>,
```

## Test Status

- ✅ Model loading works
- ✅ Health check shows correct dimensions
- ❌ Entity creation fails (schema mismatch)
- ⏸️ Search performance (blocked by entity creation)
- ⏸️ Observation creation (blocked by entity creation)
- ⏸️ Relationship creation (blocked by entity creation)

## Next Steps

1. ✅ Fix schema to use dynamic dimensions from EmbeddingService
2. ✅ Rebuild and restart server
3. ⏳ Re-run all tests
4. ⏳ Compare performance: MiniLM-L6-v2 vs bge-m3

## Fix Applied

**Changed Files:**
- `src/embedding-service.ts`: Added `getDimensions()` getter method
- `src/index.ts`: Removed hardcoded `EMBEDDING_DIM = 1024`, now reads from `embeddingService.getDimensions()` in `setupSchema()`

**Code Changes:**
```typescript
// embedding-service.ts
getDimensions(): number {
  return this.dimensions;
}

// index.ts - setupSchema()
const EMBEDDING_DIM = this.embeddingService.getDimensions();
console.error(`[Schema] Using embedding dimensions: ${EMBEDDING_DIM}`);
```

---

**Status**: Fix applied and compiled. Ready for testing after server restart.


## Expected Performance Comparison

| Metric | MiniLM-L6-v2 | bge-m3 | Expected Winner |
|--------|--------------|--------|-----------------|
| Model Size | ~80 MB | ~600 MB | MiniLM ✓ |
| RAM Usage | ~400 MB | ~1.7 GB | MiniLM ✓ |
| Dimensions | 384 | 1024 | bge-m3 (more info) |
| Embedding Speed | ? | ? | MiniLM (smaller) |
| Search Accuracy | ? | ? | bge-m3 (more dims) |
| Semantic Quality | ? | ? | bge-m3 (trained better) |

---

**Status**: Test blocked by schema bug. Fix in progress.
