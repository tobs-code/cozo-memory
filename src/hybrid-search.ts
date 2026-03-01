import { CozoDb } from "cozo-node";
import { EmbeddingService } from "./embedding-service";
import crypto from "crypto";
import { RerankerService } from "./reranker-service";

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
  rerank?: boolean;
  session_id?: string;
  task_id?: string;
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
  private rerankerService: RerankerService;
  private searchCache = new Map<string, { results: SearchResult[]; timestamp: number }>();
  private readonly CACHE_TTL = 300000; // 5 minutes cache

  constructor(db: CozoDb, embeddingService: EmbeddingService) {
    this.db = db;
    this.embeddingService = embeddingService;
    this.rerankerService = new RerankerService();
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
      console.error(`[HybridSearch] In-Memory cache hit for key: ${cacheKey}`);
      return cached.results;
    }

    try {
      const exactRes = await this.db.run(
        '?[results] := *search_cache{query_hash: $hash, results, created_at}, created_at > $min_ts',
        { hash: cacheKey, min_ts: Math.floor((Date.now() - this.CACHE_TTL) / 1000) }
      );
      if (exactRes.rows.length > 0) {
        console.error(`[HybridSearch] DB cache hit for key: ${cacheKey}`);
        const results = exactRes.rows[0][0] as SearchResult[];
        this.searchCache.set(cacheKey, { results, timestamp: Date.now() });
        return results;
      }
    } catch (e: any) {
      console.error(`[HybridSearch] Cache lookup error or table missing: ${e.message}`);
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
    } catch (e) { }
  }

  private applyTimeDecay(results: SearchResult[]): SearchResult[] {
    return results.map(r => {
      let score = Number(r.score);
      if (isNaN(score)) score = 0;

      if (r.created_at) {
        const createdAt = Array.isArray(r.created_at) ? r.created_at[0] : r.created_at;
        const ageHours = (Date.now() - Number(createdAt) / 1000) / (1000 * 60 * 60);
        const decay = Math.pow(0.5, ageHours / (24 * 90)); // 90 days half-life

        let newScore = score * decay;
        if (isNaN(newScore)) newScore = 0;

        return { ...r, score: newScore };
      }
      return { ...r, score };
    });
  }

  private applyContextBoost(results: SearchResult[], options: HybridSearchOptions): SearchResult[] {
    const { session_id, task_id } = options;
    if (!session_id && !task_id) return results;

    return results.map(result => {
      let boost = 1.0;
      let reasons: string[] = [];

      const metadata = result.metadata || {};

      if (task_id && metadata.task_id === task_id) {
        boost += 0.5;
        reasons.push("Task Match");
      }

      if (session_id && metadata.session_id === session_id) {
        boost += 0.3;
        reasons.push("Session Match");
      }

      if (boost > 1.0) {
        // Cap the score at 1.0 to stay within standard search score range
        const newScore = Math.min(1.0, result.score * boost);
        return {
          ...result,
          score: newScore,
          explanation: (typeof result.explanation === 'string' ? result.explanation : JSON.stringify(result.explanation)) +
            ` | Context Boost (x${boost.toFixed(1)}): ${reasons.join(', ')}`
        };
      }

      return result;
    });
  }

  private async applyReranking(query: string, results: SearchResult[]): Promise<SearchResult[]> {
    if (results.length <= 1) return results;

    console.error(`[HybridSearch] Reranking ${results.length} candidates...`);
    const documents = results.map(r => {
      const parts = [
        r.name ? `Name: ${r.name}` : '',
        r.type ? `Type: ${r.type}` : '',
        r.text ? `Description: ${r.text}` : '',
        r.metadata ? `Details: ${JSON.stringify(r.metadata)}` : ''
      ].filter(p => p !== '');
      return parts.join(' | ');
    });

    try {
      const rerankedOrder = await this.rerankerService.rerank(query, documents);

      return rerankedOrder.map((item, i) => {
        const original = results[item.index];
        return {
          ...original,
          score: (item.score + 1.0) / 2.0, // Normalize to 0-1 range if it's logits, or just use as is
          explanation: (typeof original.explanation === 'string' ? original.explanation : JSON.stringify(original.explanation)) +
            ` | Reranked (Rank ${i + 1}, Cross-Encoder Score: ${item.score.toFixed(4)})`
        };
      });
    } catch (e) {
      console.error(`[HybridSearch] Reranking failed, returning original results:`, e);
      return results;
    }
  }

  async advancedSearch(options: AdvancedHybridQueryOptions): Promise<SearchResult[]> {
    console.error("[HybridSearch] Starting advancedSearch with options:", JSON.stringify(options, null, 2));
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
      console.error("[HybridSearch] Cache hit for advancedSearch");
      return cachedResults;
    }
    console.error("[HybridSearch] Cache miss, executing Datalog query...");

    let topk = limit * 2;
    const hasFilters = (filters?.metadata && Object.keys(filters.metadata).length > 0) ||
      (filters?.entityTypes && filters.entityTypes.length > 0);

    if (hasFilters) {
      // Significantly increase topk for post-filtering
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
      // Post-filtering for types
      metaJoins.push(`is_in(type, $allowed_types)`);
    }

    // Use filtered indexes if possible (v1.7)
    let indexToUse = "entity:semantic";
    if (filters?.entityTypes && filters.entityTypes.length === 1) {
      const requestedType = filters.entityTypes[0].toLowerCase();
      const supportedFilteredIndexes = ['person', 'project', 'task', 'note'];
      if (supportedFilteredIndexes.includes(requestedType)) {
        indexToUse = `entity:semantic_${requestedType}`;
      }
    }

    // Multi-Vector Support: Use name_embedding if query is short (v1.7)
    let indexToSearch = indexToUse;
    const isShortQuery = query.split(' ').length <= 3;

    if (isShortQuery && !filters?.entityTypes) {
      // For short queries without type filter, the name_semantic index is often more precise
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

      // Post-Filtering for Time Range
      if (options.timeRangeHours) {
        const minTs = Date.now() - (options.timeRangeHours * 3600 * 1000);
        searchResults = searchResults.filter(r => (r.created_at || 0) > minTs);
      }

      // Post-Filtering for Metadata (since CozoDB get() in Datalog often fails)
      if (filters?.metadata) {
        searchResults = searchResults.filter(r => {
          if (!r.metadata || typeof r.metadata !== 'object') return false;
          return Object.entries(filters.metadata!).every(([key, val]) => r.metadata[key] === val);
        });
      }

      const timeDecayedResults = this.applyTimeDecay(searchResults);
      const finalResults = this.applyContextBoost(timeDecayedResults, options);

      // Phase 3: Reranking
      if (options.rerank) {
        const rerankedResults = await this.applyReranking(options.query, finalResults);
        await this.updateCache(options, queryEmbedding, rerankedResults);
        return rerankedResults;
      }

      await this.updateCache(options, queryEmbedding, finalResults);
      return finalResults;
    } catch (e: any) {
      console.error("[HybridSearch] Error in advancedSearch:", e.message);
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

    // Use advancedSearch as the default implementation
    return this.advancedSearch({
      ...options,
      vectorParams: {
        efSearch: 100
      }
    });
  }

  async graphRag(options: AdvancedHybridQueryOptions): Promise<SearchResult[]> {
    console.error("[HybridSearch] Starting graphRag with options:", JSON.stringify(options, null, 2));
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

    // Datalog Query for Graph-RAG:
    // 1. Find seed entities via vector search (with inline filtering)
    // 2. Explore the graph starting from seeds up to maxDepth hops
    // 3. Collect all reached entities and observations
    // 4. Calculate a combined score based on vector distance, graph distance, and PageRank
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
          details: `Found via graph expansion (Source: ${r[6]})`
        }
      }));

      // Post-filtering for time range
      if (options.timeRangeHours) {
        const minTs = Date.now() - (options.timeRangeHours * 3600 * 1000);
        searchResults = searchResults.filter(r => (r.created_at || 0) > minTs);
      }

      // Post-filtering for metadata
      if (filters?.metadata) {
        searchResults = searchResults.filter(r => {
          if (!r.metadata || typeof r.metadata !== 'object') return false;
          return Object.entries(filters.metadata!).every(([key, val]) => r.metadata[key] === val);
        });
      }

      const decayedResults = this.applyTimeDecay(searchResults);

      if (options.rerank) {
        return await this.applyReranking(options.query, decayedResults);
      }

      return decayedResults;
    } catch (e: any) {
      console.error("[HybridSearch] Error in graphRag:", e.message);
      // Fallback to normal search on error
      return this.search(options);
    }
  }

  async agenticRetrieve(options: AdvancedHybridQueryOptions & { routingModel?: string }): Promise<SearchResult[]> {
    console.error("[HybridSearch] Starting agenticRetrieve with query:", options.query);
    const { query, routingModel = "demyagent-4b-i1:Q6_K" } = options;

    const systemPrompt = `You are a Routing Agent for an advanced Memory/RAG system.
Your job is to analyze the user's query and decide which search strategy is the most appropriate.
Available strategies:
- "vector_search": Best for finding specific facts or general semantic queries (e.g., "What ORM is used?", "How does feature X work?", "Welches System nutzt B?").
- "graph_walk": Best for queries about relations, links, or paths between entities (e.g., "Who works with Bob?", "What depends on Project A?", "Wer arbeitet mit ReactJS?").
- "community_summary": Best for high-level, overarching questions about the big picture, status, or general themes of entire clusters (e.g., "What is the general tech stack?", "Give me an overview of the legacy project", "Wie ist der generelle Status aller Frontend-Projekte?").
- "hybrid": Best for complex queries that require both factual retrieval and deep relational context.

You MUST respond with a JSON object in this format: {"strategy": "one_of_the_above"}.
No markdown, no explanation. Just the JSON.`;

    let strategy = "vector_search"; // Fallback

    try {
      const ollamaMod: any = await import("ollama");
      const ollamaClient: any = ollamaMod?.default ?? ollamaMod;
      const response = await ollamaClient.chat({
        model: routingModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query },
        ],
        format: "json",
      });

      let responseText = (response as any)?.message?.content?.trim?.() ?? "";

      // Clean markdown formatting if Ollama returned it
      if (responseText.startsWith("```json")) {
        responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      } else if (responseText.startsWith("```")) {
        responseText = responseText.replace(/```/g, "").trim();
      }

      console.error(`[AgenticRetrieve] DEBUG: Raw LLM Output: ${responseText}`);

      try {
        const parsed = JSON.parse(responseText);
        let selected = "";
        if (Array.isArray(parsed) && parsed.length > 0) {
          selected = parsed[0];
        } else if (typeof parsed === "object" && parsed.strategy) {
          selected = parsed.strategy;
        } else if (typeof parsed === "string") {
          selected = parsed;
        }

        if (selected) {
          const s = selected.toLowerCase();
          if (["vector_search", "graph_walk", "community_summary", "hybrid"].includes(s)) {
            strategy = s;
          }
        }
      } catch (e) {
        console.warn(`[AgenticRetrieve] Failed to parse JSON from LLM: ${responseText}`);
      }
    } catch (e: any) {
      console.warn(`[AgenticRetrieve] Ollama routing failed: ${e.message}. Using fallback.`);
    }

    console.error(`[AgenticRetrieve] Selected Strategy: ${strategy}`);

    let results: SearchResult[] = [];

    // Map strategy to existing search methods
    switch (strategy) {
      case "graph_walk":
      case "hybrid":
        // Use our advanced Datalog graph-rag for deep relational context
        results = await this.graphRag(options);
        break;
      case "community_summary":
        // Prioritize CommunitySummary entities
        results = await this.advancedSearch({
          ...options,
          filters: {
            ...options.filters,
            entityTypes: ["CommunitySummary"]
          },
          rerank: options.rerank
        });

        // If no community summaries found, fallback to standard search
        if (results.length === 0) {
          console.error(`[AgenticRetrieve] No Community Summaries found, falling back to hybrid search.`);
          results = await this.advancedSearch(options);
        }
        break;
      case "vector_search":
      default:
        // Standard vector search (which is advancedSearch in v1.7)
        results = await this.advancedSearch(options);
        break;
    }

    // Annotate results with the routing decision for testing/transparency
    return results.map(r => ({
      ...r,
      metadata: {
        ...(r.metadata || {}),
        agentic_routing: strategy
      }
    }));
  }

  async clearCache() {
    this.searchCache.clear();
    try {
      await this.db.run(`{ ?[query_hash] := *search_cache{query_hash} :rm search_cache {query_hash} }`);
      console.error("[HybridSearch] Cache cleared successfully.");
    } catch (e) {
      console.error("[HybridSearch] Error clearing cache:", e);
    }
  }
}