import { EmbeddingService } from './embedding-service';

/**
 * Temporal Graph Neural Network Embedding Service
 * 
 * Implements time-aware node embeddings that capture:
 * 1. Historical context aggregation (past observations)
 * 2. Temporal smoothness (gradual changes over time)
 * 3. Time encoding (Time2Vec-inspired approach)
 * 4. Recency weighting (recent events matter more)
 * 
 * Based on research:
 * - ACM Temporal Graph Learning Primer (2025)
 * - TempGNN: Temporal Graph Neural Networks (2023)
 * - Time-Aware Graph Embedding with Temporal Smoothness (2021)
 */
export class TemporalEmbeddingService {
  private embeddingService: EmbeddingService;
  private dbQuery: (query: string, params?: any) => Promise<any>;
  private readonly EMBEDDING_DIM = 1024;
  private readonly TEMPORAL_ENCODING_DIM = 64;
  private readonly MEMORY_CACHE = new Map<string, TemporalNodeMemory>();

  constructor(embeddingService: EmbeddingService, dbQuery: (query: string, params?: any) => Promise<any>) {
    this.embeddingService = embeddingService;
    this.dbQuery = dbQuery;
  }

  /**
   * Generate temporal embedding for an entity at a specific timepoint
   * 
   * Combines:
   * 1. Content embedding (semantic meaning)
   * 2. Temporal encoding (time difference from now)
   * 3. Historical context (past observations)
   * 4. Neighborhood aggregation (related entities)
   */
  async generateTemporalEmbedding(
    entityId: string,
    timepoint?: Date
  ): Promise<TemporalNodeEmbedding> {
    const now = timepoint || new Date();
    
    // 1. Get entity state at timepoint via CozoDB Validity
    const entityState = await this.getEntityAtTime(entityId, now);
    if (!entityState) {
      throw new Error(`Entity ${entityId} not found at ${now.toISOString()}`);
    }

    // 2. Generate base content embedding
    const contentEmbedding = await this.embeddingService.embed(
      entityState.name + ' ' + (entityState.metadata?.description || '')
    );

    // 3. Generate temporal encoding (Time2Vec-inspired)
    const temporalEncoding = this.encodeTemporalDistance(
      entityState.createdAt,
      now
    );

    // 4. Aggregate historical context
    const historicalContext = await this.aggregateHistoricalContext(
      entityId,
      now
    );

    // 5. Aggregate neighborhood information
    const neighborhoodAggregation = await this.aggregateNeighborhood(
      entityId,
      now
    );

    // 6. Combine all signals with learned weights
    const combinedEmbedding = this.fuseEmbeddings(
      contentEmbedding,
      temporalEncoding,
      historicalContext,
      neighborhoodAggregation
    );

    return {
      entityId,
      timepoint: now,
      embedding: combinedEmbedding,
      contentEmbedding,
      temporalEncoding,
      historicalContext,
      neighborhoodAggregation,
      confidence: this.calculateConfidence(entityState, now),
      metadata: {
        ageInDays: Math.floor(
          (now.getTime() - entityState.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        ),
        observationCount: entityState.observationCount || 0,
        relationshipCount: entityState.relationshipCount || 0,
      },
    };
  }

  /**
   * Get entity state at a specific timepoint using CozoDB Validity
   * Returns the entity as it existed at that point in time
   */
  private async getEntityAtTime(
    entityId: string,
    timepoint: Date
  ): Promise<any> {
    try {
      const result = await this.dbQuery(
        `?[id, name, metadata, createdAt, observationCount, relationshipCount] := 
          *entity{id, name, metadata, @ $timepoint},
          id = $entityId,
          observationCount = count{*observation{entity_id: id}},
          relationshipCount = count{*relationship{from_id: id} or *relationship{to_id: id}},
          createdAt = now()`,
        {
          entityId,
          timepoint: timepoint.toISOString(),
        }
      );

      if (!result.rows || result.rows.length === 0) return null;

      const [id, name, metadata, createdAt, obsCount, relCount] = result.rows[0];
      return {
        id,
        name,
        metadata: metadata ? JSON.parse(metadata) : {},
        createdAt: new Date(createdAt),
        observationCount: obsCount,
        relationshipCount: relCount,
      };
    } catch (error) {
      console.error(`[TemporalEmbedding] Error fetching entity at time:`, error);
      return null;
    }
  }

  /**
   * Time2Vec-inspired temporal encoding
   * Captures periodicity and time differences using sinusoidal functions
   * 
   * Formula: t_enc[i] = sin(ω_i * Δt) for i in [0, d/2]
   *          t_enc[i+d/2] = cos(ω_i * Δt) for i in [0, d/2]
   * 
   * Where ω_i = 1 / 10000^(2i/d) (similar to transformer positional encoding)
   */
  private encodeTemporalDistance(
    createdAt: Date,
    currentTime: Date
  ): number[] {
    const deltaSeconds = (currentTime.getTime() - createdAt.getTime()) / 1000;
    const encoding: number[] = [];

    // Generate sinusoidal encodings for different frequencies
    for (let i = 0; i < this.TEMPORAL_ENCODING_DIM / 2; i++) {
      const omega = 1 / Math.pow(10000, (2 * i) / this.TEMPORAL_ENCODING_DIM);
      
      // Normalize delta to reasonable range (0-1 for recent, >1 for old)
      const normalizedDelta = Math.min(deltaSeconds / (365 * 24 * 3600), 10);
      
      encoding.push(Math.sin(omega * normalizedDelta));
      encoding.push(Math.cos(omega * normalizedDelta));
    }

    return encoding;
  }

  /**
   * Aggregate historical context from past observations
   * 
   * Implements temporal smoothness by:
   * 1. Fetching all observations up to timepoint
   * 2. Weighting by recency (exponential decay)
   * 3. Embedding each observation
   * 4. Averaging with recency weights
   */
  private async aggregateHistoricalContext(
    entityId: string,
    timepoint: Date
  ): Promise<number[]> {
    try {
      const result = await this.dbQuery(
        `?[id, text, createdAt] := 
          *observation{id, entity_id: $entityId, text, @ $timepoint},
          createdAt = now()
        | order by createdAt desc
        | limit 50`,
        {
          entityId,
          timepoint: timepoint.toISOString(),
        }
      );

      if (!result.rows || result.rows.length === 0) {
        return new Array(this.EMBEDDING_DIM).fill(0);
      }

      const embeddings: number[][] = [];
      const weights: number[] = [];

      for (const [, text, createdAt] of result.rows) {
        const embedding = await this.embeddingService.embed(text);
        const age = (timepoint.getTime() - new Date(createdAt).getTime()) / 1000;
        
        const halfLife = 30 * 24 * 3600;
        const weight = Math.exp(-age / halfLife);

        embeddings.push(embedding);
        weights.push(weight);
      }

      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const normalizedWeights = weights.map(w => w / totalWeight);

      const aggregated = new Array(this.EMBEDDING_DIM).fill(0);
      for (let i = 0; i < embeddings.length; i++) {
        for (let j = 0; j < this.EMBEDDING_DIM; j++) {
          aggregated[j] += embeddings[i][j] * normalizedWeights[i];
        }
      }

      return aggregated;
    } catch (error) {
      console.error(`[TemporalEmbedding] Error aggregating history:`, error);
      return new Array(this.EMBEDDING_DIM).fill(0);
    }
  }

  /**
   * Aggregate neighborhood information
   * 
   * Implements graph-based aggregation by:
   * 1. Finding related entities (via relationships)
   * 2. Embedding their content
   * 3. Weighting by relationship strength and recency
   * 4. Averaging to get neighborhood signal
   */
  private async aggregateNeighborhood(
    entityId: string,
    timepoint: Date
  ): Promise<number[]> {
    try {
      const result = await this.dbQuery(
        `?[toId, relationshipType, strength, createdAt] := 
          *relationship{from_id: $entityId, to_id: toId, relation_type: relationshipType, strength, @ $timepoint},
          createdAt = now()
        | limit 20`,
        {
          entityId,
          timepoint: timepoint.toISOString(),
        }
      );

      if (!result.rows || result.rows.length === 0) {
        return new Array(this.EMBEDDING_DIM).fill(0);
      }

      const embeddings: number[][] = [];
      const weights: number[] = [];

      for (const [toId, , strength, createdAt] of result.rows) {
        const neighbor = await this.getEntityAtTime(toId, timepoint);
        if (!neighbor) continue;

        const embedding = await this.embeddingService.embed(neighbor.name);
        
        const age = (timepoint.getTime() - new Date(createdAt).getTime()) / 1000;
        const halfLife = 30 * 24 * 3600;
        const recencyWeight = Math.exp(-age / halfLife);
        const weight = (strength || 0.5) * recencyWeight;

        embeddings.push(embedding);
        weights.push(weight);
      }

      if (embeddings.length === 0) {
        return new Array(this.EMBEDDING_DIM).fill(0);
      }

      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const normalizedWeights = weights.map(w => w / totalWeight);

      const aggregated = new Array(this.EMBEDDING_DIM).fill(0);
      for (let i = 0; i < embeddings.length; i++) {
        for (let j = 0; j < this.EMBEDDING_DIM; j++) {
          aggregated[j] += embeddings[i][j] * normalizedWeights[i];
        }
      }

      return aggregated;
    } catch (error) {
      console.error(`[TemporalEmbedding] Error aggregating neighborhood:`, error);
      return new Array(this.EMBEDDING_DIM).fill(0);
    }
  }

  /**
   * Fuse multiple embedding signals into final temporal embedding
   * 
   * Uses learned weights to combine:
   * - Content embedding (semantic meaning)
   * - Temporal encoding (time information)
   * - Historical context (past observations)
   * - Neighborhood aggregation (related entities)
   */
  private fuseEmbeddings(
    contentEmbedding: number[],
    temporalEncoding: number[],
    historicalContext: number[],
    neighborhoodAggregation: number[]
  ): number[] {
    // Learned fusion weights (can be tuned)
    const weights = {
      content: 0.4,
      temporal: 0.2,
      history: 0.2,
      neighborhood: 0.2,
    };

    const fused = new Array(this.EMBEDDING_DIM).fill(0);

    // Combine content embedding
    for (let i = 0; i < this.EMBEDDING_DIM; i++) {
      fused[i] += contentEmbedding[i] * weights.content;
    }

    // Combine historical context
    for (let i = 0; i < this.EMBEDDING_DIM; i++) {
      fused[i] += historicalContext[i] * weights.history;
    }

    // Combine neighborhood aggregation
    for (let i = 0; i < this.EMBEDDING_DIM; i++) {
      fused[i] += neighborhoodAggregation[i] * weights.neighborhood;
    }

    // Combine temporal encoding (pad to EMBEDDING_DIM)
    for (let i = 0; i < Math.min(this.TEMPORAL_ENCODING_DIM, this.EMBEDDING_DIM); i++) {
      fused[i] += temporalEncoding[i] * weights.temporal;
    }

    // Normalize
    const norm = Math.sqrt(fused.reduce((a, b) => a + b * b, 0));
    if (norm > 0) {
      for (let i = 0; i < fused.length; i++) {
        fused[i] /= norm;
      }
    }

    return fused;
  }

  /**
   * Calculate confidence score for the embedding
   * Based on data freshness and completeness
   */
  private calculateConfidence(entityState: any, timepoint: Date): number {
    let confidence = 0.5; // Base confidence

    // Boost for recent entities
    const ageInDays = Math.floor(
      (timepoint.getTime() - entityState.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (ageInDays < 7) confidence += 0.3;
    else if (ageInDays < 30) confidence += 0.2;
    else if (ageInDays < 90) confidence += 0.1;

    // Boost for entities with observations
    if ((entityState.observationCount || 0) > 5) confidence += 0.15;
    else if ((entityState.observationCount || 0) > 0) confidence += 0.05;

    // Boost for well-connected entities
    if ((entityState.relationshipCount || 0) > 10) confidence += 0.15;
    else if ((entityState.relationshipCount || 0) > 0) confidence += 0.05;

    return Math.min(confidence, 1.0);
  }

  /**
   * Get temporal memory for an entity
   * Caches temporal state for efficient multi-hop queries
   */
  getTemporalMemory(entityId: string): TemporalNodeMemory | undefined {
    return this.MEMORY_CACHE.get(entityId);
  }

  /**
   * Update temporal memory for an entity
   */
  setTemporalMemory(entityId: string, memory: TemporalNodeMemory): void {
    this.MEMORY_CACHE.set(entityId, memory);
  }

  /**
   * Clear temporal memory cache
   */
  clearMemoryCache(): void {
    this.MEMORY_CACHE.clear();
  }
}

/**
 * Temporal node embedding result
 */
export interface TemporalNodeEmbedding {
  entityId: string;
  timepoint: Date;
  embedding: number[]; // Final fused embedding
  contentEmbedding: number[]; // Semantic content
  temporalEncoding: number[]; // Time information
  historicalContext: number[]; // Past observations
  neighborhoodAggregation: number[]; // Related entities
  confidence: number; // 0-1 confidence score
  metadata: {
    ageInDays: number;
    observationCount: number;
    relationshipCount: number;
  };
}

/**
 * Temporal node memory for efficient multi-hop traversal
 */
export interface TemporalNodeMemory {
  entityId: string;
  lastUpdated: Date;
  embedding: number[];
  neighbors: Array<{
    entityId: string;
    relationshipType: string;
    strength: number;
  }>;
  recentObservations: Array<{
    text: string;
    timestamp: Date;
  }>;
}
