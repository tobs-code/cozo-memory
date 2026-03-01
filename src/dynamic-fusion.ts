/**
 * Dynamic Fusion Framework for CozoDB Memory
 * 
 * Inspired by Allan-Poe (arXiv:2511.00855) - All-in-one Graph-based Indexing
 * 
 * Combines 4 retrieval paths with dynamic weighting:
 * 1. Dense Vector Search (HNSW semantic similarity)
 * 2. Sparse Vector Search (TF-IDF/BM25 keyword matching)
 * 3. Full-Text Search (FTS exact/fuzzy matching)
 * 4. Graph Traversal (relationship-based retrieval)
 * 
 * Key Innovation: Dynamic fusion without index reconstruction
 */

import { EmbeddingService } from './embedding-service.js';
import { HybridSearch } from './hybrid-search.js';
import { CozoDb } from 'cozo-node';

export interface FusionConfig {
  /** Dense vector search configuration */
  vector?: {
    enabled: boolean;
    weight: number;
    topK: number;
    efSearch?: number;
  };
  
  /** Sparse vector search (keyword-based) configuration */
  sparse?: {
    enabled: boolean;
    weight: number;
    topK: number;
    minScore?: number;
  };
  
  /** Full-text search configuration */
  fts?: {
    enabled: boolean;
    weight: number;
    topK: number;
    fuzzy?: boolean;
  };
  
  /** Graph traversal configuration */
  graph?: {
    enabled: boolean;
    weight: number;
    maxDepth: number;
    maxResults?: number;
    relationTypes?: string[];
  };
  
  /** Global fusion settings */
  fusion?: {
    strategy: 'rrf' | 'weighted_sum' | 'max' | 'adaptive';
    rrfK?: number; // RRF constant (default: 60)
    minScore?: number; // Minimum score threshold
    deduplication?: boolean; // Remove duplicates
  };
}

export interface FusionResult {
  id: string;
  entity_id: string;
  name: string;
  type: string;
  score: number;
  source: string; // Which retrieval path(s) contributed
  metadata?: Record<string, any>;
  explanation?: string;
  pathScores?: {
    vector?: number;
    sparse?: number;
    fts?: number;
    graph?: number;
  };
}

export interface FusionStats {
  totalResults: number;
  pathContributions: {
    vector: number;
    sparse: number;
    fts: number;
    graph: number;
  };
  fusionTime: number;
  pathTimes: {
    vector?: number;
    sparse?: number;
    fts?: number;
    graph?: number;
  };
}

/**
 * Default fusion configuration
 */
export const DEFAULT_FUSION_CONFIG: FusionConfig = {
  vector: {
    enabled: true,
    weight: 0.4,
    topK: 20,
    efSearch: 100
  },
  sparse: {
    enabled: true,
    weight: 0.3,
    topK: 20,
    minScore: 0.1
  },
  fts: {
    enabled: true,
    weight: 0.2,
    topK: 20,
    fuzzy: true
  },
  graph: {
    enabled: true,
    weight: 0.1,
    maxDepth: 2,
    maxResults: 20
  },
  fusion: {
    strategy: 'rrf',
    rrfK: 60,
    minScore: 0.0,
    deduplication: true
  }
};

/**
 * Dynamic Fusion Search Engine
 * 
 * Combines multiple retrieval paths with configurable weights
 * without requiring index reconstruction
 */
export class DynamicFusionSearch {
  private db: CozoDb;
  private embeddings: EmbeddingService;

  constructor(
    db: CozoDb,
    embeddings: EmbeddingService
  ) {
    this.db = db;
    this.embeddings = embeddings;
  }

  /**
   * Execute dynamic fusion search
   */
  async search(
    query: string,
    config: Partial<FusionConfig> = {}
  ): Promise<{ results: FusionResult[]; stats: FusionStats }> {
    const startTime = Date.now();
    
    // Merge with defaults
    const fullConfig = this.mergeConfig(config);
    
    console.log('[DynamicFusion] Starting search with config:', {
      query,
      enabledPaths: this.getEnabledPaths(fullConfig)
    });

    // Execute all enabled paths in parallel
    const pathResults = await this.executeAllPaths(query, fullConfig);
    
    // Fuse results based on strategy
    const fusedResults = this.fuseResults(pathResults, fullConfig);
    
    // Calculate statistics
    const stats = this.calculateStats(pathResults, fusedResults, startTime);
    
    console.log('[DynamicFusion] Search completed:', {
      totalResults: fusedResults.length,
      pathContributions: stats.pathContributions,
      fusionTime: stats.fusionTime
    });

    return { results: fusedResults, stats };
  }

  /**
   * Execute all enabled retrieval paths in parallel
   */
  private async executeAllPaths(
    query: string,
    config: FusionConfig
  ): Promise<{
    vector?: { results: any[]; time: number };
    sparse?: { results: any[]; time: number };
    fts?: { results: any[]; time: number };
    graph?: { results: any[]; time: number };
  }> {
    const promises: Promise<any>[] = [];
    const pathNames: string[] = [];

    // Vector search
    if (config.vector?.enabled) {
      pathNames.push('vector');
      promises.push(this.executeVectorSearch(query, config.vector));
    }

    // Sparse search
    if (config.sparse?.enabled) {
      pathNames.push('sparse');
      promises.push(this.executeSparseSearch(query, config.sparse));
    }

    // FTS search
    if (config.fts?.enabled) {
      pathNames.push('fts');
      promises.push(this.executeFTSSearch(query, config.fts));
    }

    // Graph search
    if (config.graph?.enabled) {
      pathNames.push('graph');
      promises.push(this.executeGraphSearch(query, config.graph));
    }

    const results = await Promise.all(promises);
    
    // Map results back to path names
    const pathResults: any = {};
    pathNames.forEach((name, idx) => {
      pathResults[name] = results[idx];
    });

    return pathResults;
  }

  /**
   * Execute dense vector search (HNSW)
   */
  private async executeVectorSearch(
    query: string,
    config: NonNullable<FusionConfig['vector']>
  ): Promise<{ results: any[]; time: number }> {
    const startTime = Date.now();
    
    try {
      // Generate query embedding
      const embedding = await this.embeddings.embed(query);
      
      // HNSW vector search using correct CozoDB syntax
      const datalogQuery = `
        ?[id, name, type, score, metadata] := 
          ~entity:content_hnsw{
            id | 
            query: vec($embedding), 
            k: ${config.topK},
            ef: ${config.efSearch || 100},
            bind_distance: dist
          },
          *entity{
            id,
            name,
            type,
            metadata
          },
          score = 1.0 - dist
        
        :order -score
        :limit ${config.topK}
      `;

      const dbResult = await this.db.run(datalogQuery, { embedding });
      const results = dbResult.rows.map((row: any) => ({
        id: row[0],
        name: row[1],
        type: row[2],
        entity_id: row[0],
        score: row[3],
        metadata: row[4],
        source: 'vector',
        rawScore: row[3]
      }));
      
      return {
        results,
        time: Date.now() - startTime
      };
    } catch (error) {
      console.error('[DynamicFusion] Vector search error:', error);
      return { results: [], time: Date.now() - startTime };
    }
  }

  /**
   * Execute sparse vector search (keyword-based)
   */
  private async executeSparseSearch(
    query: string,
    config: NonNullable<FusionConfig['sparse']>
  ): Promise<{ results: any[]; time: number }> {
    const startTime = Date.now();
    
    try {
      // Extract keywords (simple tokenization)
      const keywords = query.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2);
      
      if (keywords.length === 0) {
        return { results: [], time: Date.now() - startTime };
      }

      // Pad keywords to always have 3 (for simpler query)
      while (keywords.length < 3) {
        keywords.push('');
      }

      // Keyword matching with TF-IDF-like scoring using str_includes
      const datalogQuery = `
        ?[id, name, type, score, metadata] := 
          *entity{
            id,
            name,
            type,
            metadata
          },
          name_lower = lowercase(name),
          match_count = if(str_includes(name_lower, $kw1), 1, 0) + if(str_includes(name_lower, $kw2), 1, 0) + if(str_includes(name_lower, $kw3), 1, 0),
          match_count > 0,
          score = to_float(match_count) / to_float(length(name_lower))
        
        :order -score
        :limit ${config.topK}
      `;

      const params: any = {
        kw1: keywords[0],
        kw2: keywords[1],
        kw3: keywords[2]
      };

      const dbResult = await this.db.run(datalogQuery, params);
      
      return {
        results: dbResult.rows
          .filter((row: any) => row[3] >= (config.minScore || 0.1))
          .map((row: any) => ({
            id: row[0],
            name: row[1],
            type: row[2],
            entity_id: row[0],
            score: row[3],
            metadata: row[4],
            source: 'sparse',
            rawScore: row[3]
          })),
        time: Date.now() - startTime
      };
    } catch (error) {
      console.error('[DynamicFusion] Sparse search error:', error);
      return { results: [], time: Date.now() - startTime };
    }
  }

  /**
   * Execute full-text search
   */
  private async executeFTSSearch(
    query: string,
    config: NonNullable<FusionConfig['fts']>
  ): Promise<{ results: any[]; time: number }> {
    const startTime = Date.now();
    
    try {
      // FTS search on entity names using correct CozoDB syntax
      const datalogQuery = `
        ?[id, name, type, score, metadata] := 
          ~entity:name_fts{
            id | 
            query: $query,
            k: ${config.topK},
            bind_score_bm_25: score
          },
          *entity{
            id,
            name,
            type,
            metadata
          }
        
        :order -score
        :limit ${config.topK}
      `;

      const dbResult = await this.db.run(datalogQuery, { query });
      
      return {
        results: dbResult.rows.map((row: any) => ({
          id: row[0],
          name: row[1],
          type: row[2],
          entity_id: row[0],
          score: row[3],
          metadata: row[4],
          source: 'fts',
          rawScore: row[3]
        })),
        time: Date.now() - startTime
      };
    } catch (error) {
      console.error('[DynamicFusion] FTS search error:', error);
      return { results: [], time: Date.now() - startTime };
    }
  }

  /**
   * Execute graph traversal search
   */
  private async executeGraphSearch(
    query: string,
    config: NonNullable<FusionConfig['graph']>
  ): Promise<{ results: any[]; time: number }> {
    const startTime = Date.now();
    
    try {
      // First, find seed nodes via vector search
      const embedding = await this.embeddings.embed(query);
      
      // HNSW index returns 'id' not 'entity_id'
      const seedQuery = `
        ?[id] := 
          ~entity:content_hnsw{
            id | 
            query: vec($embedding), 
            k: 5,
            ef: 100
          }
      `;
      
      const seedResult = await this.db.run(seedQuery, { embedding });
      
      if (seedResult.rows.length === 0) {
        return { results: [], time: Date.now() - startTime };
      }

      // Graph traversal from seeds
      const relationFilter = config.relationTypes && config.relationTypes.length > 0
        ? `is_in(relation_type, [${config.relationTypes.map(t => `"${t}"`).join(', ')}])`
        : 'true';

      const seedIds = seedResult.rows.map((row: any) => `"${row[0]}"`).join(', ');

      const graphQuery = `
        seed[id] := id in [${seedIds}]
        
        reachable[to_id, depth] := 
          seed[from_id],
          *relationship{from_id, to_id, relation_type},
          ${relationFilter},
          depth = 1
        
        reachable[to_id, depth] := 
          reachable[from_id, prev_depth],
          prev_depth < ${config.maxDepth},
          *relationship{from_id, to_id, relation_type},
          ${relationFilter},
          depth = prev_depth + 1
        
        ?[id, name, type, score, metadata] := 
          reachable[id, depth],
          *entity{
            id,
            name,
            type,
            metadata
          },
          score = 1.0 / to_float(depth)
        
        :order -score
        :limit ${config.maxResults || 20}
      `;

      const graphResult = await this.db.run(graphQuery, {});
      
      return {
        results: graphResult.rows.map((row: any) => ({
          id: row[0],
          name: row[1],
          type: row[2],
          entity_id: row[0],
          score: row[3],
          metadata: row[4],
          source: 'graph',
          rawScore: row[3]
        })),
        time: Date.now() - startTime
      };
    } catch (error) {
      console.error('[DynamicFusion] Graph search error:', error);
      return { results: [], time: Date.now() - startTime };
    }
  }

  /**
   * Fuse results from multiple paths
   */
  private fuseResults(
    pathResults: {
      vector?: { results: any[]; time: number };
      sparse?: { results: any[]; time: number };
      fts?: { results: any[]; time: number };
      graph?: { results: any[]; time: number };
    },
    config: FusionConfig
  ): FusionResult[] {
    const strategy = config.fusion?.strategy || 'rrf';
    
    switch (strategy) {
      case 'rrf':
        return this.fuseRRF(pathResults, config);
      case 'weighted_sum':
        return this.fuseWeightedSum(pathResults, config);
      case 'max':
        return this.fuseMax(pathResults, config);
      case 'adaptive':
        return this.fuseAdaptive(pathResults, config);
      default:
        return this.fuseRRF(pathResults, config);
    }
  }

  /**
   * Reciprocal Rank Fusion (RRF)
   */
  private fuseRRF(
    pathResults: {
      vector?: { results: any[]; time: number };
      sparse?: { results: any[]; time: number };
      fts?: { results: any[]; time: number };
      graph?: { results: any[]; time: number };
    },
    config: FusionConfig
  ): FusionResult[] {
    const k = config.fusion?.rrfK || 60;
    const entityScores = new Map<string, {
      score: number;
      sources: Set<string>;
      pathScores: Record<string, number>;
      entity: any;
    }>();

    // Process each path
    for (const [pathName, pathData] of Object.entries(pathResults)) {
      if (!pathData || !pathData.results) continue;
      
      const weight = (config as any)[pathName]?.weight || 1.0;
      
      pathData.results.forEach((result: any, rank: number) => {
        const entityId = result.entity_id;
        const rrfScore = weight / (k + rank + 1);
        
        if (!entityScores.has(entityId)) {
          entityScores.set(entityId, {
            score: 0,
            sources: new Set(),
            pathScores: {},
            entity: result
          });
        }
        
        const entry = entityScores.get(entityId)!;
        entry.score += rrfScore;
        entry.sources.add(pathName);
        entry.pathScores[pathName] = rrfScore;
      });
    }

    // Convert to array and sort
    const results = Array.from(entityScores.entries())
      .map(([entityId, data]) => ({
        id: data.entity.id,
        entity_id: entityId,
        name: data.entity.name,
        type: data.entity.type,
        score: data.score,
        source: Array.from(data.sources).join('+'),
        metadata: data.entity.metadata,
        pathScores: data.pathScores,
        explanation: `RRF fusion from ${data.sources.size} path(s)`
      }))
      .sort((a, b) => b.score - a.score);

    // Apply deduplication and min score filter
    const minScore = config.fusion?.minScore || 0.0;
    const filtered = results.filter(r => r.score >= minScore);
    
    return config.fusion?.deduplication 
      ? this.deduplicateResults(filtered)
      : filtered;
  }

  /**
   * Weighted sum fusion
   */
  private fuseWeightedSum(
    pathResults: {
      vector?: { results: any[]; time: number };
      sparse?: { results: any[]; time: number };
      fts?: { results: any[]; time: number };
      graph?: { results: any[]; time: number };
    },
    config: FusionConfig
  ): FusionResult[] {
    const entityScores = new Map<string, {
      score: number;
      sources: Set<string>;
      pathScores: Record<string, number>;
      entity: any;
    }>();

    // Process each path
    for (const [pathName, pathData] of Object.entries(pathResults)) {
      if (!pathData || !pathData.results) continue;
      
      const weight = (config as any)[pathName]?.weight || 1.0;
      
      pathData.results.forEach((result: any) => {
        const entityId = result.entity_id;
        const weightedScore = result.rawScore * weight;
        
        if (!entityScores.has(entityId)) {
          entityScores.set(entityId, {
            score: 0,
            sources: new Set(),
            pathScores: {},
            entity: result
          });
        }
        
        const entry = entityScores.get(entityId)!;
        entry.score += weightedScore;
        entry.sources.add(pathName);
        entry.pathScores[pathName] = weightedScore;
      });
    }

    // Convert and sort
    const results = Array.from(entityScores.entries())
      .map(([entityId, data]) => ({
        id: data.entity.id,
        entity_id: entityId,
        name: data.entity.name,
        type: data.entity.type,
        score: data.score,
        source: Array.from(data.sources).join('+'),
        metadata: data.entity.metadata,
        pathScores: data.pathScores,
        explanation: `Weighted sum from ${data.sources.size} path(s)`
      }))
      .sort((a, b) => b.score - a.score);

    const minScore = config.fusion?.minScore || 0.0;
    const filtered = results.filter(r => r.score >= minScore);
    
    return config.fusion?.deduplication 
      ? this.deduplicateResults(filtered)
      : filtered;
  }

  /**
   * Max score fusion
   */
  private fuseMax(
    pathResults: {
      vector?: { results: any[]; time: number };
      sparse?: { results: any[]; time: number };
      fts?: { results: any[]; time: number };
      graph?: { results: any[]; time: number };
    },
    config: FusionConfig
  ): FusionResult[] {
    const entityScores = new Map<string, {
      score: number;
      sources: Set<string>;
      pathScores: Record<string, number>;
      entity: any;
    }>();

    // Process each path
    for (const [pathName, pathData] of Object.entries(pathResults)) {
      if (!pathData || !pathData.results) continue;
      
      const weight = (config as any)[pathName]?.weight || 1.0;
      
      pathData.results.forEach((result: any) => {
        const entityId = result.entity_id;
        const weightedScore = result.rawScore * weight;
        
        if (!entityScores.has(entityId)) {
          entityScores.set(entityId, {
            score: weightedScore,
            sources: new Set([pathName]),
            pathScores: { [pathName]: weightedScore },
            entity: result
          });
        } else {
          const entry = entityScores.get(entityId)!;
          if (weightedScore > entry.score) {
            entry.score = weightedScore;
          }
          entry.sources.add(pathName);
          entry.pathScores[pathName] = weightedScore;
        }
      });
    }

    // Convert and sort
    const results = Array.from(entityScores.entries())
      .map(([entityId, data]) => ({
        id: data.entity.id,
        entity_id: entityId,
        name: data.entity.name,
        type: data.entity.type,
        score: data.score,
        source: Array.from(data.sources).join('+'),
        metadata: data.entity.metadata,
        pathScores: data.pathScores,
        explanation: `Max score from ${data.sources.size} path(s)`
      }))
      .sort((a, b) => b.score - a.score);

    const minScore = config.fusion?.minScore || 0.0;
    const filtered = results.filter(r => r.score >= minScore);
    
    return config.fusion?.deduplication 
      ? this.deduplicateResults(filtered)
      : filtered;
  }

  /**
   * Adaptive fusion (query-dependent weighting)
   */
  private fuseAdaptive(
    pathResults: {
      vector?: { results: any[]; time: number };
      sparse?: { results: any[]; time: number };
      fts?: { results: any[]; time: number };
      graph?: { results: any[]; time: number };
    },
    config: FusionConfig
  ): FusionResult[] {
    // Analyze query characteristics to adjust weights
    // For now, fall back to RRF
    // TODO: Implement adaptive weighting based on query analysis
    console.log('[DynamicFusion] Adaptive fusion not yet implemented, using RRF');
    return this.fuseRRF(pathResults, config);
  }

  /**
   * Remove duplicate results
   */
  private deduplicateResults(results: FusionResult[]): FusionResult[] {
    const seen = new Set<string>();
    return results.filter(r => {
      if (seen.has(r.entity_id)) {
        return false;
      }
      seen.add(r.entity_id);
      return true;
    });
  }

  /**
   * Calculate search statistics
   */
  private calculateStats(
    pathResults: {
      vector?: { results: any[]; time: number };
      sparse?: { results: any[]; time: number };
      fts?: { results: any[]; time: number };
      graph?: { results: any[]; time: number };
    },
    fusedResults: FusionResult[],
    startTime: number
  ): FusionStats {
    const pathContributions = {
      vector: 0,
      sparse: 0,
      fts: 0,
      graph: 0
    };

    const pathTimes: any = {};

    // Count contributions
    for (const [pathName, pathData] of Object.entries(pathResults)) {
      if (pathData && pathData.results) {
        (pathContributions as any)[pathName] = pathData.results.length;
        pathTimes[pathName] = pathData.time;
      }
    }

    return {
      totalResults: fusedResults.length,
      pathContributions,
      fusionTime: Date.now() - startTime,
      pathTimes
    };
  }

  /**
   * Merge user config with defaults
   */
  private mergeConfig(config: Partial<FusionConfig>): FusionConfig {
    return {
      vector: { ...DEFAULT_FUSION_CONFIG.vector!, ...config.vector } as NonNullable<FusionConfig['vector']>,
      sparse: { ...DEFAULT_FUSION_CONFIG.sparse!, ...config.sparse } as NonNullable<FusionConfig['sparse']>,
      fts: { ...DEFAULT_FUSION_CONFIG.fts!, ...config.fts } as NonNullable<FusionConfig['fts']>,
      graph: { ...DEFAULT_FUSION_CONFIG.graph!, ...config.graph } as NonNullable<FusionConfig['graph']>,
      fusion: { ...DEFAULT_FUSION_CONFIG.fusion!, ...config.fusion } as NonNullable<FusionConfig['fusion']>
    };
  }

  /**
   * Get list of enabled paths
   */
  private getEnabledPaths(config: FusionConfig): string[] {
    const paths: string[] = [];
    if (config.vector?.enabled) paths.push('vector');
    if (config.sparse?.enabled) paths.push('sparse');
    if (config.fts?.enabled) paths.push('fts');
    if (config.graph?.enabled) paths.push('graph');
    return paths;
  }
}
