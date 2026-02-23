 import { CozoDb } from "cozo-node";
 import { EmbeddingService } from "./embedding-service";
 import crypto from "crypto";
 
 export interface SearchResult {
   id: string;
   entity_id?: string;
   name?: string;
   type?: string;
   text?: string;
   score: number;
   metadata?: any;
   created_at?: number;
   updated_at?: number;
   source: "vector" | "keyword" | "graph" | "community" | "inference" | "advanced_hybrid";
   explanation?: {
    source_score: number;
    details: string;
  } | string;
}

export interface HybridSearchOptions {
   query: string;
   limit?: number;
   entityTypes?: string[];
   includeObservations?: boolean;
   includeEntities?: boolean;
   vectorWeight?: number;
   graphWeight?: number;
   keywordWeight?: number;
   inferenceWeight?: number;
   timeRangeHours?: number;
 }
 
 export interface AdvancedHybridQueryOptions extends HybridSearchOptions {
   filters?: {
     entityTypes?: string[];
     minScore?: number;
     metadata?: Record<string, any>;
   };
   graphConstraints?: {
     maxDepth?: number;
     requiredRelations?: string[];
     targetEntityIds?: string[];
   };
   vectorParams?: {
     efSearch?: number;
     radius?: number;
   };
 }
 
 const SEMANTIC_CACHE_THRESHOLD = 0.95;
 
 export class HybridSearch {
   private db: CozoDb;
   private embeddingService: EmbeddingService;
   private searchCache = new Map<string, { results: SearchResult[]; timestamp: number }>();
   private readonly CACHE_TTL = 300000; // 5 Minuten Cache
 
   constructor(db: CozoDb, embeddingService: EmbeddingService) {
     this.db = db;
     this.embeddingService = embeddingService;
   }
 
   private getCacheKey(options: HybridSearchOptions): string {
     const str = JSON.stringify({
       q: options.query,
       l: options.limit,
       t: options.entityTypes,
       io: options.includeObservations,
       ie: options.includeEntities,
       tr: options.timeRangeHours,
       f: (options as AdvancedHybridQueryOptions).filters,
       g: (options as AdvancedHybridQueryOptions).graphConstraints,
       v: (options as AdvancedHybridQueryOptions).vectorParams
     });
     return crypto.createHash('md5').update(str).digest('hex');
   }
 
   private async tryCacheLookup(options: HybridSearchOptions, queryEmbedding: number[]): Promise<SearchResult[] | null> {
     const cacheKey = this.getCacheKey(options);
    const cached = this.searchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
      console.error(`[HybridSearch] In-Memory Cache-Treffer für Key: ${cacheKey}`);
      return cached.results;
    }

    try {
      const exactRes = await this.db.run(
        '?[results] := *search_cache{query_hash: $hash, results, created_at}, created_at > $min_ts',
        { hash: cacheKey, min_ts: Math.floor((Date.now() - this.CACHE_TTL) / 1000) }
      );
      if (exactRes.rows.length > 0) {
        console.error(`[HybridSearch] DB Cache-Treffer für Key: ${cacheKey}`);
        const results = exactRes.rows[0][0] as SearchResult[];
        this.searchCache.set(cacheKey, { results, timestamp: Date.now() });
        return results;
      }
    } catch (e: any) {
      console.error(`[HybridSearch] Cache-Lookup Fehler oder Tabelle fehlt: ${e.message}`);
    }

    return null;
   }
 
   private async updateCache(options: HybridSearchOptions, queryEmbedding: number[], results: SearchResult[]) {
     const cacheKey = this.getCacheKey(options);
     this.searchCache.set(cacheKey, { results, timestamp: Date.now() });
     try {
       await this.db.run(
         '?[query_hash, results, options, created_at, embedding] <- [[$hash, $res, $opt, $now, vec($emb)]] :put search_cache{query_hash}',
         { hash: cacheKey, res: results, opt: options, now: Math.floor(Date.now() / 1000), emb: queryEmbedding }
       );
     } catch (e) {}
   }
 
   private applyTimeDecay(results: SearchResult[]): SearchResult[] {
    return results.map(r => {
      let score = Number(r.score);
      if (isNaN(score)) score = 0;

      if (r.created_at) {
        const createdAt = Array.isArray(r.created_at) ? r.created_at[0] : r.created_at;
        const ageHours = (Date.now() - Number(createdAt) / 1000) / (1000 * 60 * 60);
        const decay = Math.pow(0.5, ageHours / (24 * 90)); // 90 Tage Halbwertszeit
        
        let newScore = score * decay;
        if (isNaN(newScore)) newScore = 0;
        
        return { ...r, score: newScore };
      }
      return { ...r, score };
    });
  }
 
   async advancedSearch(options: AdvancedHybridQueryOptions): Promise<SearchResult[]> {
    console.error("[HybridSearch] Starte advancedSearch mit Optionen:", JSON.stringify(options, null, 2));
    const { query, limit = 10, filters, graphConstraints, vectorParams } = options;
    
    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.embeddingService.embed(query);
    } catch (e: any) {
      console.error("[HybridSearch] Embedding failed", e);
      throw e;
    }

    const cachedResults = await this.tryCacheLookup(options, queryEmbedding);
    if (cachedResults !== null) {
      console.error("[HybridSearch] Cache-Treffer für advancedSearch");
      return cachedResults;
    }
    console.error("[HybridSearch] Cache-Miss, führe Datalog-Abfrage aus...");
 
     let topk = limit * 2;
    const hasFilters = (filters?.metadata && Object.keys(filters.metadata).length > 0) || 
                       (filters?.entityTypes && filters.entityTypes.length > 0);
                       
    if (hasFilters) {
      // Erhöhe topk signifikant für Post-Filtering
      topk = Math.max(limit * 20, 200);
    }

    const params: Record<string, any> = {
      query_vector: queryEmbedding,
      limit: limit,
      topk: topk,
      ef_search: vectorParams?.efSearch || 100,
    };

    let hnswFilters: string[] = [];
    const metaRules: string[] = [];
    const metaJoins: string[] = [];

    if (filters?.metadata) {
      Object.entries(filters.metadata).forEach(([key, value], index) => {
        const paramName = `meta_val_${index}`;
        params[paramName] = value;
        // Use metadata->'key' syntax which is correct for CozoDB JSON access
        metaJoins.push(`metadata->'${key}' == $${paramName}`);
      });
    }

    if (filters?.entityTypes && filters.entityTypes.length > 0) {
      params.allowed_types = filters.entityTypes;
      // Post-Filtering für Typen
      metaJoins.push(`is_in(type, $allowed_types)`);
    }

    // Nutze gefilterte Indizes wenn möglich (v1.7)
    let indexToUse = "entity:semantic";
    if (filters?.entityTypes && filters.entityTypes.length === 1) {
      const requestedType = filters.entityTypes[0].toLowerCase();
      const supportedFilteredIndexes = ['person', 'project', 'task', 'note'];
      if (supportedFilteredIndexes.includes(requestedType)) {
        indexToUse = `entity:semantic_${requestedType}`;
      }
    }

    // Multi-Vector Support: Nutze name_embedding wenn die Query kurz ist (v1.7)
    let indexToSearch = indexToUse;
    const isShortQuery = query.split(' ').length <= 3;
    
    if (isShortQuery && !filters?.entityTypes) {
      // Für kurze Queries ohne Typ-Filter ist der name_semantic Index oft präziser
      indexToSearch = "entity:name_semantic";
    }

    let semanticCall = `~${indexToSearch}{id | query: vec($query_vector), k: $topk, ef: $ef_search, bind_distance: dist`;
    if (hnswFilters.length > 0) {
      semanticCall += `, filter: ${hnswFilters.join(" && ")}`;
    }
    semanticCall += `}`;

    let bodyConstraints = [semanticCall, `*entity{id, name, type, metadata, created_at}`];
    if (metaJoins.length > 0) {
      bodyConstraints.push(...metaJoins);
    }

    if (options.timeRangeHours) {
      const minTs = Date.now() - (options.timeRangeHours * 3600 * 1000);
      params.min_ts = minTs;
    }
 
     if (graphConstraints?.requiredRelations && graphConstraints.requiredRelations.length > 0) {
      graphConstraints.requiredRelations.forEach((relType, index) => {
        const relParam = `rel_type_${index}`;
        params[relParam] = relType;
        bodyConstraints.push(`rel_match[id, $${relParam}]`);
      });
    }

    if (graphConstraints?.targetEntityIds && graphConstraints.targetEntityIds.length > 0) {
      params.target_ids = graphConstraints.targetEntityIds;
      bodyConstraints.push(`target_match[id, t_id]`, `is_in(t_id, $target_ids)`);
    }

    if (filters?.minScore) {
      params.min_score = filters.minScore;
      bodyConstraints.push(`score >= $min_score`);
    }

    const helperRules: string[] = [
      `rank_val[id, r] := *entity_rank{entity_id: id, pagerank: r}`,
      `rank_val[id, r] := *entity{id, @ "NOW"}, not *entity_rank{entity_id: id}, r = 0.0`
    ];
    if (graphConstraints?.requiredRelations && graphConstraints.requiredRelations.length > 0) {
      helperRules.push(
        `rel_match[id, rel_type] := *relationship{from_id: id, relation_type: rel_type}`,
        `rel_match[id, rel_type] := *relationship{to_id: id, relation_type: rel_type}`
      );
    }
    if (graphConstraints?.targetEntityIds && graphConstraints.targetEntityIds.length > 0) {
      helperRules.push(
        `target_match[id, target_id] := *relationship{from_id: id, to_id: target_id}`,
        `target_match[id, target_id] := *relationship{to_id: id, from_id: target_id}`
      );
    }

    const datalogQuery = [
      ...helperRules,
      `?[id, name, type, metadata, created_at, score, dist] := ${bodyConstraints.join(', ')}, rank_val[id, pr], score = (1.0 - dist)`,
      `:sort -score`,
      `:limit $limit`
    ].join('\n').trim();

    console.error('--- DEBUG: Cozo Datalog Query ---');
    console.error(datalogQuery);
    console.error('--- DEBUG: Params ---');
    console.dir(params, { depth: null });

    try {
      const results = await this.db.run(datalogQuery, params);
      let searchResults: SearchResult[] = results.rows.map((r: any) => ({
        id: r[0],
        entity_id: r[0],
        name: r[1],
        type: r[2],
        metadata: r[3],
        explanation: `DEBUG: raw_score=${r[5]}, dist=${r[6]}`,
        created_at: Array.isArray(r[4]) ? r[4][0] : r[4], // CozoDB returns [start, end] for Validity
        score: Number(r[5]) || 0,
        source: "advanced_hybrid",
      }));

      // Post-Filtering für Zeitbereich
      if (options.timeRangeHours) {
        const minTs = Date.now() - (options.timeRangeHours * 3600 * 1000);
        searchResults = searchResults.filter(r => (r.created_at || 0) > minTs);
      }
 
       // Post-Filtering für Metadaten (da CozoDB get() im Datalog oft fehlschlägt)
      if (filters?.metadata) {
        searchResults = searchResults.filter(r => {
          if (!r.metadata || typeof r.metadata !== 'object') return false;
          return Object.entries(filters.metadata!).every(([key, val]) => r.metadata[key] === val);
        });
      }

      const finalResults = this.applyTimeDecay(searchResults);
       await this.updateCache(options, queryEmbedding, finalResults);
       return finalResults;
     } catch (e: any) {
       console.error("[HybridSearch] Fehler bei advancedSearch:", e.message);
       return this.search(options);
     }
   }
 
   async search(options: HybridSearchOptions): Promise<SearchResult[]> {
     const { query, limit = 10 } = options;
     const queryEmbedding = await this.embeddingService.embed(query);
     const cachedResults = await this.tryCacheLookup(options, queryEmbedding);
    if (cachedResults) {
      // Add debug info to cached results too
      return cachedResults.map(r => ({
          ...r,
          explanation: (typeof r.explanation === 'string' ? r.explanation : JSON.stringify(r.explanation)) + ` | CACHED`
      }));
    }

    const { limit: queryLimit = 10, filters, graphConstraints, vectorParams } = options as AdvancedHybridQueryOptions;
    // @ts-ignore
    const { topk = 5, efSearch = 50 } = vectorParams || {};
 
     // Fallback Mock
     return [];
   }
 
   async graphRag(options: AdvancedHybridQueryOptions): Promise<SearchResult[]> {
    console.error("[HybridSearch] Starte graphRag mit Optionen:", JSON.stringify(options, null, 2));
    const { query, limit = 5, filters, graphConstraints } = options;
    const maxDepth = graphConstraints?.maxDepth || 2;
    const queryEmbedding = await this.embeddingService.embed(query);

    const topk = limit * 2;
    const params: Record<string, any> = {
      query_vector: queryEmbedding,
      topk: topk,
      ef_search: 100,
      max_depth: maxDepth,
      limit: limit
    };

    let hnswFilters: string[] = [];
    const metaRules: string[] = [];
    const metaJoins: string[] = [];

    if (filters?.entityTypes && filters.entityTypes.length > 0) {
      params.allowed_types = filters.entityTypes;
      hnswFilters.push(`is_in(type, $allowed_types)`);
    }

    if (filters?.metadata) {
      Object.entries(filters.metadata).forEach(([key, value], index) => {
        const paramName = `meta_val_${index}`;
        params[paramName] = value;
      });
    }

    let seedSemanticCall = `~entity:semantic{id, type, metadata | query: vec($query_vector), k: $topk, ef: $ef_search, bind_distance: dist`;
    if (hnswFilters.length > 0) {
      seedSemanticCall += `, filter: ${hnswFilters.join(" && ")}`;
    }
    seedSemanticCall += `}`;

    let seedConstraints = [seedSemanticCall];
    if (options.timeRangeHours) {
      const minTs = Date.now() - (options.timeRangeHours * 3600 * 1000);
      params.min_ts = minTs;
    }

     // Datalog Query für Graph-RAG:
    // 1. Finde Seed-Entitäten via Vektorsuche (mit Inline-Filtering)
    // 2. Exploriere den Graphen ausgehend von den Seeds bis zu maxDepth Hops
    // 3. Sammle alle erreichten Entitäten und Observations
    // 4. Berechne einen kombinierten Score basierend auf Vektor-Distanz, Graph-Distanz und PageRank
    const datalogQuery = `
      rank_val[id, r] := *entity_rank{entity_id: id, pagerank: r}
      rank_val[id, r] := *entity{id, @ "NOW"}, not *entity_rank{entity_id: id}, r = 0.0

      seeds[id, score] := ${seedConstraints.join(", ")}, score = 1.0 - dist
      
      path[start_id, current_id, d] := seeds[start_id, _], current_id = start_id, d = 0
      path[start_id, next_id, d_new] := path[start_id, current_id, d], *relationship{from_id: current_id, to_id: next_id}, d < $max_depth, d_new = d + 1
      path[start_id, next_id, d_new] := path[start_id, current_id, d], *relationship{to_id: current_id, from_id: next_id}, d < $max_depth, d_new = d + 1

      result_entities[id, final_score, depth] := path[seed_id, id, depth], seeds[seed_id, seed_score], rank_val[id, pr], final_score = seed_score * (1.0 - 0.2 * depth)
      
      ?[id, name, type, metadata, created_at, score, source, text] := result_entities[id, score, depth], *entity{id, name, type, metadata, created_at}, source = 'graph_rag_entity', text = ''
      
      :sort -score
      :limit $limit
    `.trim();

    console.error("[HybridSearch] Graph-RAG Datalog Query:\n", datalogQuery);

    try {
      const results = await this.db.run(datalogQuery, params);
      let searchResults: SearchResult[] = results.rows.map((r: any) => ({
        id: r[0],
        name: r[1],
        type: r[2],
        metadata: r[3],
        created_at: Array.isArray(r[4]) ? r[4][0] : r[4],
        score: Number(r[5]) || 0,
        source: r[6] as any,
        text: r[7] || undefined,
        explanation: {
          source_score: r[5],
          details: `Gefunden via Graph-Expansion (Quelle: ${r[6]})`
        }
      }));

      // Post-Filtering für Zeitbereich
      if (options.timeRangeHours) {
        const minTs = Date.now() - (options.timeRangeHours * 3600 * 1000);
        searchResults = searchResults.filter(r => (r.created_at || 0) > minTs);
      }

      // Post-Filtering für Metadaten
      if (filters?.metadata) {
        searchResults = searchResults.filter(r => {
          if (!r.metadata || typeof r.metadata !== 'object') return false;
          return Object.entries(filters.metadata!).every(([key, val]) => r.metadata[key] === val);
        });
      }

      return this.applyTimeDecay(searchResults);
    } catch (e: any) {
      console.error("[HybridSearch] Fehler bei graphRag:", e.message);
      // Fallback auf normale Suche bei Fehler
      return this.search(options);
    }
  }
 }