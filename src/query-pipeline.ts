import { EmbeddingService } from './embedding-service';
import { DatabaseService } from './db-service';
import { HybridSearch } from './hybrid-search';
import { RerankerService } from './reranker-service';
import { CozoDb } from 'cozo-node';

// Pipeline Stage Types
export type PipelineStage = 
  | PreprocessStage
  | SearchStage
  | RerankStage
  | PostProcessStage;

export interface StageContext {
  query: string;
  embedding?: number[];
  results?: any[];
  metadata: Record<string, any>;
  metrics: Record<string, number>;
}

export interface StageConfig {
  name: string;
  enabled: boolean;
  condition?: (ctx: StageContext) => boolean;
  params?: Record<string, any>;
}

// Preprocessing Stages
export interface PreprocessStage extends StageConfig {
  type: 'preprocess';
  execute: (ctx: StageContext) => Promise<StageContext>;
}

// Search Stages
export interface SearchStage extends StageConfig {
  type: 'search';
  execute: (ctx: StageContext) => Promise<StageContext>;
}

// Reranking Stages
export interface RerankStage extends StageConfig {
  type: 'rerank';
  execute: (ctx: StageContext) => Promise<StageContext>;
}

// Post-processing Stages
export interface PostProcessStage extends StageConfig {
  type: 'postprocess';
  execute: (ctx: StageContext) => Promise<StageContext>;
}

// Pipeline Configuration
export interface PipelineConfig {
  name: string;
  stages: PipelineStage[];
  abTest?: {
    enabled: boolean;
    variants: string[];
    splitRatio?: number[];
  };
}

// Built-in Preprocessing Stages
export const preprocessStages = {
  embedQuery: (embeddingService: EmbeddingService): PreprocessStage => ({
    type: 'preprocess',
    name: 'embed-query',
    enabled: true,
    execute: async (ctx) => {
      const start = Date.now();
      ctx.embedding = await embeddingService.embed(ctx.query);
      ctx.metrics['preprocess.embedding'] = Date.now() - start;
      return ctx;
    }
  }),

  queryNormalization: (): PreprocessStage => ({
    type: 'preprocess',
    name: 'query-normalization',
    enabled: true,
    execute: async (ctx) => {
      const start = Date.now();
      ctx.query = ctx.query.trim().toLowerCase();
      ctx.metrics['preprocess.normalization'] = Date.now() - start;
      return ctx;
    }
  })
};

// Built-in Search Stages
export const searchStages = {
  hybridSearch: (hybridSearch: HybridSearch): SearchStage => ({
    type: 'search',
    name: 'hybrid-search',
    enabled: true,
    params: { limit: 10 },
    execute: async (ctx) => {
      const start = Date.now();
      const limit = ctx.metadata.limit || 10;
      ctx.results = await hybridSearch.search({
        query: ctx.query,
        limit,
        includeEntities: true,
        includeObservations: true
      });
      ctx.metrics['search.hybrid'] = Date.now() - start;
      return ctx;
    }
  }),

  graphRag: (hybridSearch: HybridSearch): SearchStage => ({
    type: 'search',
    name: 'graph-rag',
    enabled: true,
    params: { maxDepth: 3, limit: 10 },
    execute: async (ctx) => {
      const start = Date.now();
      const limit = ctx.metadata.limit || 10;
      ctx.results = await hybridSearch.graphRag({
        query: ctx.query,
        limit,
        graphConstraints: {
          maxDepth: ctx.metadata.maxDepth || 3
        }
      });
      ctx.metrics['search.graphRag'] = Date.now() - start;
      return ctx;
    }
  }),

  agenticSearch: (hybridSearch: HybridSearch): SearchStage => ({
    type: 'search',
    name: 'agentic-search',
    enabled: true,
    params: { limit: 10 },
    execute: async (ctx) => {
      const start = Date.now();
      const limit = ctx.metadata.limit || 10;
      ctx.results = await hybridSearch.agenticRetrieve({
        query: ctx.query,
        limit
      });
      ctx.metrics['search.agentic'] = Date.now() - start;
      return ctx;
    }
  })
};

// Built-in Reranking Stages
export const rerankStages = {
  crossEncoder: (reranker: RerankerService): RerankStage => ({
    type: 'rerank',
    name: 'cross-encoder',
    enabled: true,
    execute: async (ctx) => {
      const start = Date.now();
      if (!ctx.results || ctx.results.length === 0) {
        return ctx;
      }
      ctx.results = await reranker.rerank(ctx.query, ctx.results);
      ctx.metrics['rerank.crossEncoder'] = Date.now() - start;
      return ctx;
    }
  }),

  diversityRerank: (): RerankStage => ({
    type: 'rerank',
    name: 'diversity-rerank',
    enabled: true,
    params: { diversityWeight: 0.3 },
    execute: async (ctx) => {
      const start = Date.now();
      if (!ctx.results || ctx.results.length === 0) {
        return ctx;
      }
      
      // MMR-style diversity reranking
      const diversityWeight = ctx.metadata.diversityWeight || 0.3;
      const reranked = [];
      const remaining = [...ctx.results];
      
      while (remaining.length > 0 && reranked.length < ctx.results.length) {
        let bestIdx = 0;
        let bestScore = -Infinity;
        
        for (let i = 0; i < remaining.length; i++) {
          const candidate = remaining[i];
          const relevance = candidate.score || 0;
          
          // Calculate diversity (min similarity to already selected)
          let minSim = 1.0;
          for (const selected of reranked) {
            const sim = cosineSimilarity(candidate.embedding || [], selected.embedding || []);
            minSim = Math.min(minSim, sim);
          }
          
          const score = (1 - diversityWeight) * relevance + diversityWeight * (1 - minSim);
          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }
        
        reranked.push(remaining.splice(bestIdx, 1)[0]);
      }
      
      ctx.results = reranked;
      ctx.metrics['rerank.diversity'] = Date.now() - start;
      return ctx;
    }
  })
};

// Built-in Post-processing Stages
export const postProcessStages = {
  deduplication: (): PostProcessStage => ({
    type: 'postprocess',
    name: 'deduplication',
    enabled: true,
    params: { threshold: 0.95 },
    execute: async (ctx) => {
      const start = Date.now();
      if (!ctx.results || ctx.results.length === 0) {
        return ctx;
      }
      
      const threshold = ctx.metadata.dedupThreshold || 0.95;
      const deduplicated = [];
      
      for (const result of ctx.results) {
        let isDuplicate = false;
        for (const existing of deduplicated) {
          if (result.entity_id === existing.entity_id) {
            isDuplicate = true;
            break;
          }
          
          const sim = cosineSimilarity(result.embedding || [], existing.embedding || []);
          if (sim >= threshold) {
            isDuplicate = true;
            break;
          }
        }
        
        if (!isDuplicate) {
          deduplicated.push(result);
        }
      }
      
      ctx.results = deduplicated;
      ctx.metrics['postprocess.deduplication'] = Date.now() - start;
      return ctx;
    }
  }),

  scoreNormalization: (): PostProcessStage => ({
    type: 'postprocess',
    name: 'score-normalization',
    enabled: true,
    execute: async (ctx) => {
      const start = Date.now();
      if (!ctx.results || ctx.results.length === 0) {
        return ctx;
      }
      
      const scores = ctx.results.map(r => r.score || 0);
      const maxScore = Math.max(...scores);
      const minScore = Math.min(...scores);
      const range = maxScore - minScore;
      
      if (range > 0) {
        ctx.results = ctx.results.map(r => ({
          ...r,
          score: (r.score - minScore) / range
        }));
      }
      
      ctx.metrics['postprocess.normalization'] = Date.now() - start;
      return ctx;
    }
  }),

  topK: (): PostProcessStage => ({
    type: 'postprocess',
    name: 'top-k',
    enabled: true,
    params: { k: 10 },
    execute: async (ctx) => {
      const start = Date.now();
      const k = ctx.metadata.topK || 10;
      if (ctx.results && ctx.results.length > k) {
        ctx.results = ctx.results.slice(0, k);
      }
      ctx.metrics['postprocess.topK'] = Date.now() - start;
      return ctx;
    }
  })
};

// Pipeline Executor
export class QueryPipeline {
  private config: PipelineConfig;
  
  constructor(config: PipelineConfig) {
    this.config = config;
  }
  
  async execute(query: string, metadata: Record<string, any> = {}): Promise<{
    results: any[];
    metrics: Record<string, number>;
    metadata: Record<string, any>;
  }> {
    const ctx: StageContext = {
      query,
      metadata: { ...metadata },
      metrics: {},
      results: []
    };
    
    const pipelineStart = Date.now();
    
    for (const stage of this.config.stages) {
      if (!stage.enabled) {
        continue;
      }
      
      // Check condition if present
      if (stage.condition && !stage.condition(ctx)) {
        console.log(`[Pipeline] Skipping stage ${stage.name} (condition not met)`);
        continue;
      }
      
      try {
        const stageStart = Date.now();
        await stage.execute(ctx);
        ctx.metrics[`stage.${stage.name}`] = Date.now() - stageStart;
      } catch (error) {
        console.error(`[Pipeline] Error in stage ${stage.name}:`, error);
        ctx.metadata[`error.${stage.name}`] = String(error);
      }
    }
    
    ctx.metrics['pipeline.total'] = Date.now() - pipelineStart;
    
    return {
      results: ctx.results || [],
      metrics: ctx.metrics,
      metadata: ctx.metadata
    };
  }
  
  // A/B Testing support
  async executeWithVariants(query: string, metadata: Record<string, any> = {}): Promise<{
    primary: any;
    variants?: Record<string, any>;
  }> {
    if (!this.config.abTest?.enabled) {
      return { primary: await this.execute(query, metadata) };
    }
    
    const primary = await this.execute(query, metadata);
    
    // Execute variant pipelines if configured
    const variants: Record<string, any> = {};
    if (this.config.abTest.variants) {
      for (const variant of this.config.abTest.variants) {
        variants[variant] = await this.execute(query, { ...metadata, variant });
      }
    }
    
    return { primary, variants };
  }
}

// Helper: Cosine Similarity
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// Pipeline Builder for easy construction
export class PipelineBuilder {
  private stages: PipelineStage[] = [];
  private name: string;
  
  constructor(name: string) {
    this.name = name;
  }
  
  addStage(stage: PipelineStage): this {
    this.stages.push(stage);
    return this;
  }
  
  addPreprocess(stage: PreprocessStage): this {
    return this.addStage(stage);
  }
  
  addSearch(stage: SearchStage): this {
    return this.addStage(stage);
  }
  
  addRerank(stage: RerankStage): this {
    return this.addStage(stage);
  }
  
  addPostProcess(stage: PostProcessStage): this {
    return this.addStage(stage);
  }
  
  build(): PipelineConfig {
    return {
      name: this.name,
      stages: this.stages
    };
  }
}

// Preset Pipelines
export function createStandardPipeline(
  hybridSearch: HybridSearch,
  embeddingService: EmbeddingService,
  reranker: RerankerService
): QueryPipeline {
  const config = new PipelineBuilder('standard')
    .addPreprocess(preprocessStages.queryNormalization())
    .addPreprocess(preprocessStages.embedQuery(embeddingService))
    .addSearch(searchStages.hybridSearch(hybridSearch))
    .addRerank(rerankStages.crossEncoder(reranker))
    .addPostProcess(postProcessStages.deduplication())
    .addPostProcess(postProcessStages.topK())
    .build();
  
  return new QueryPipeline(config);
}

export function createGraphRagPipeline(
  hybridSearch: HybridSearch,
  embeddingService: EmbeddingService
): QueryPipeline {
  const config = new PipelineBuilder('graph-rag')
    .addPreprocess(preprocessStages.embedQuery(embeddingService))
    .addSearch(searchStages.graphRag(hybridSearch))
    .addRerank(rerankStages.diversityRerank())
    .addPostProcess(postProcessStages.deduplication())
    .addPostProcess(postProcessStages.scoreNormalization())
    .addPostProcess(postProcessStages.topK())
    .build();
  
  return new QueryPipeline(config);
}

export function createAgenticPipeline(
  hybridSearch: HybridSearch,
  embeddingService: EmbeddingService,
  reranker: RerankerService
): QueryPipeline {
  const config = new PipelineBuilder('agentic')
    .addPreprocess(preprocessStages.queryNormalization())
    .addPreprocess(preprocessStages.embedQuery(embeddingService))
    .addSearch(searchStages.agenticSearch(hybridSearch))
    .addRerank(rerankStages.crossEncoder(reranker))
    .addPostProcess(postProcessStages.deduplication())
    .addPostProcess(postProcessStages.topK())
    .build();
  
  return new QueryPipeline(config);
}
