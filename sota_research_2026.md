
## 🚀 Innovative Ideen aus der Recherche

### 1. **Allan-Poe: All-in-One Graph-Based Hybrid Search (Nov 2025)**
[Quelle: arXiv:2511.00855]

**Was ist das?** Ein GPU-beschleunigter unified graph index der 4 Retrieval-Pfade kombiniert:
- Dense Vector Search
- Sparse Vector Search  
- Full-Text Search
- Knowledge Graph Traversal

**Key Innovation:** Dynamic Fusion Framework - erlaubt beliebige Kombinationen von Retrieval-Pfaden OHNE Index-Rekonstruktion!

**Für CozoDB Memory:**
```typescript
// Neue "Adaptive Fusion" Strategie
async adaptiveFusion(query: string, weights: {
  dense: number,
  sparse: number, 
  fts: number,
  graph: number
}) {
  // Dynamisch gewichtete Kombination aller 4 Pfade
  // Ohne Index-Rebuild!
}
```

### 2. **Temporal Graph Neural Networks**

**Idee:** Graph-Embeddings die zeitliche Entwicklung berücksichtigen

**Für CozoDB Memory:**
```typescript
// Temporal Node Embeddings
async generateTemporalEmbedding(entityId: string, timepoint?: Date) {
  // Embedding das die Historie des Nodes berücksichtigt
  // Nutzt CozoDB's Validity für Time-Travel
}
```

### 3. **Knowledge Graph + Vector Disambiguation (VTT Hackathon)**

**Pattern:** AI Agents nutzen Vector Search um Kandidaten zu finden, dann Graph-Kontext für finale Entscheidung

**Für CozoDB Memory:**
```typescript
// Disambiguation Pipeline
async disambiguateEntity(mention: string) {
  // 1. Vector Search für Kandidaten
  const candidates = await vectorSearch(mention);
  
  // 2. Graph-Kontext für jeden Kandidaten
  const enriched = await Promise.all(
    candidates.map(c => getGraphContext(c.id))
  );
  
  // 3. LLM-Agent entscheidet basierend auf Kontext
  return await llmDisambiguate(enriched);
}
```

### 4. **Warp-Level Hybrid Distance Kernel (GPU)**

**Idee:** GPU-beschleunigte Hybrid-Distanz-Berechnung

**Für CozoDB Memory (Future):**
- Optional GPU-Beschleunigung für HNSW + FTS + Graph
- Könnte 10-100x Speedup bringen

### 5. **Keyword-Aware Neighbor Recycling**

**Pattern:** Bei Graph-Konstruktion Nachbarn basierend auf Keywords wiederverwenden

**Für CozoDB Memory:**
```typescript
// Beim HNSW-Index-Build
async buildHNSWWithKeywords(nodes: Node[]) {
  // Nutze FTS-Keywords um HNSW-Nachbarn zu optimieren
  // Nodes mit ähnlichen Keywords bekommen Boost
}
```

### 6. **Multi-Hop Reasoning mit Vector Pivots** ✅ IMPLEMENTIERT (v2.5)

**Pattern:** Nutze Vector Search als "Sprungbrett" für Graph-Traversierung

**Status:** Vollständig implementiert mit Logic-Aware Retrieve-Reason-Prune Pipeline

**Implementierung:**
```typescript
// src/multi-hop-vector-pivot.ts
class MultiHopVectorPivot {
  // Retrieve-Reason-Prune Pipeline:
  // 1. RETRIEVE: Vector pivots via HNSW
  // 2. REASON: Logic-aware graph traversal mit relationship context
  // 3. PRUNE: Helpfulness scoring (textual similarity + logical importance)
  // 4. AGGREGATE: Deduplicate und rank entities
  
  async multiHopVectorPivot(query: string, maxHops: number, limit: number) {
    // 1. Vector Search für Startpunkte
    const pivots = await this.findVectorPivots(query);
    
    // 2. Reasoning-Augmented Traversal von jedem Pivot
    const paths = await this.reasoningAugmentedTraversal(pivots, query, maxHops);
    
    // 3. Prune by Helpfulness Score
    const prunedPaths = this.prunePathsByHelpfulness(paths, query);
    
    // 4. Aggregate und Re-Rank
    return this.aggregatePathResults(prunedPaths);
  }
}
```

**Features:**
- Logic-Aware Traversal: Berücksichtigt Relationship-Typen, Stärken und PageRank
- Helpfulness Scoring: 60% textuelle Ähnlichkeit + 40% logische Wichtigkeit
- Pivot Depth Security: Max-Depth-Limit gegen unkontrollierte Expansion
- Confidence Decay: Exponentieller Decay (0.9^depth) für Recency-Weighting
- Adaptive Pruning: Filtert Pfade unter Confidence-Threshold

**Research Foundation:**
- HopRAG (ACL 2025): 76.78% höhere Answer Accuracy
- Retrieval Pivot Attacks (arXiv:2602.08668): Security Patterns
- Neo4j GraphRAG: Multi-hop Reasoning Patterns

### 7. **Logical Edges from Knowledge Graph**

**Idee:** Nutze KG-Relationen als "logische Edges" für komplexe Multi-Hop Queries

**Für CozoDB Memory:**
```datalog
// Erweiterte Inference Rules mit logischen Edges
?[from, to, relation, confidence] := 
  *entity{id: from},
  *entity{id: to},
  // Logische Edge basierend auf Metadaten
  from.metadata.category = to.metadata.category,
  relation = "same_category",
  confidence = 0.8
```

### 8. **Context-Aware Similarity Boost**

**Pattern:** Metadata-basierter Confidence-Boost für Vector Similarity

**Für CozoDB Memory:**
```typescript
// Bereits teilweise vorhanden, aber ausbaubar:
async contextAwareSimilarity(query: string, context: {
  domain?: string,
  timeRange?: [Date, Date],
  entityType?: string
}) {
  const results = await search(query);
  
  // Boost basierend auf Kontext
  return results.map(r => ({
    ...r,
    score: r.score * getContextBoost(r, context)
  }));
}
```

## 💡 Konkrete Implementierungs-Vorschläge

### Priorität 1: Dynamic Fusion Framework
```typescript
// Neue Klasse in hybrid-search.ts
class DynamicFusionSearch {
  async search(query: string, config: {
    vector?: { weight: number, topK: number },
    fts?: { weight: number, topK: number },
    graph?: { weight: number, maxDepth: number },
    sparse?: { weight: number, topK: number }
  }) {
    // Parallel execution aller aktivierten Pfade
    // Weighted RRF Fusion
    // OHNE Index-Rebuild!
  }
}
```

### Priorität 2: Temporal Embeddings
```typescript
// In embedding-service.ts
async generateTemporalEmbedding(
  entityId: string,
  timepoint?: Date
): Promise<number[]> {
  // Hole Entity-State zu timepoint via Validity
  const historicalState = await this.getEntityAtTime(entityId, timepoint);
  
  // Generate Embedding das Historie berücksichtigt
  return this.embedWithHistory(historicalState);
}
```

### Priorität 3: Disambiguation Pipeline
```typescript
// Neue Datei: src/disambiguation-service.ts
export class DisambiguationService {
  async disambiguate(mention: string): Promise<Entity> {
    // 1. Vector candidates
    // 2. Graph context
    // 3. LLM decision
  }
}
```

