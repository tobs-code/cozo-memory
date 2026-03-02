/**
 * Hierarchical Memory Levels Service
 * 
 * Based on 2026 SOTA Research:
 * - Multi-level memory architecture (L0-L3)
 * - Importance scoring using PageRank + Recency + Access Frequency
 * - Intelligent compression with context preservation
 * - Vector store + summarization approach
 * 
 * Memory Levels:
 * - L0: Raw observations (immediate context)
 * - L1: Session summaries (short-term memory)
 * - L2: Weekly summaries (medium-term memory)
 * - L3: Monthly summaries (long-term memory)
 */

import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Memory levels following AI agent memory hierarchy
 */
export enum MemoryLevel {
  L0_RAW = 0,           // Raw observations (immediate context)
  L1_SESSION = 1,       // Session summaries (hours to days)
  L2_WEEKLY = 2,        // Weekly summaries (7-30 days)
  L3_MONTHLY = 3        // Monthly summaries (30+ days)
}

/**
 * Importance score components
 */
export interface ImportanceScore {
  pagerank: number;      // Graph centrality (0-1)
  recency: number;       // Time decay (0-1)
  accessFrequency: number; // Access count normalized (0-1)
  combined: number;      // Weighted combination (0-1)
}

/**
 * Compression result
 */
export interface CompressionResult {
  level: MemoryLevel;
  compressed_observations: number;
  summary_id: string;
  summary_text: string;
  preserved_observations: string[];
  deleted_observations: string[];
  importance_threshold: number;
}

/**
 * Configuration for hierarchical memory
 */
export interface HierarchicalMemoryConfig {
  l0_retention_hours?: number;      // How long to keep L0 (default: 24)
  l1_retention_days?: number;       // How long to keep L1 (default: 7)
  l2_retention_days?: number;       // How long to keep L2 (default: 30)
  l3_retention_days?: number;       // How long to keep L3 (default: 365)
  
  importance_weights?: {
    pagerank: number;               // Weight for PageRank (default: 0.4)
    recency: number;                // Weight for recency (default: 0.3)
    access_frequency: number;       // Weight for access frequency (default: 0.3)
  };
  
  compression_threshold?: number;   // Min importance to preserve (default: 0.5)
  min_observations_for_compression?: number; // Min obs to trigger (default: 10)
  llm_model?: string;               // Model for summarization
}

/**
 * Hierarchical Memory Service
 */
export class HierarchicalMemoryService {
  private db: CozoDb;
  private embeddings: EmbeddingService;
  private config: Required<HierarchicalMemoryConfig>;

  constructor(
    db: CozoDb,
    embeddings: EmbeddingService,
    config: HierarchicalMemoryConfig = {}
  ) {
    this.db = db;
    this.embeddings = embeddings;
    
    this.config = {
      l0_retention_hours: config.l0_retention_hours ?? 24,
      l1_retention_days: config.l1_retention_days ?? 7,
      l2_retention_days: config.l2_retention_days ?? 30,
      l3_retention_days: config.l3_retention_days ?? 365,
      importance_weights: {
        pagerank: config.importance_weights?.pagerank ?? 0.4,
        recency: config.importance_weights?.recency ?? 0.3,
        access_frequency: config.importance_weights?.access_frequency ?? 0.3
      },
      compression_threshold: config.compression_threshold ?? 0.5,
      min_observations_for_compression: config.min_observations_for_compression ?? 10,
      llm_model: config.llm_model ?? 'demyagent-4b-i1:Q6_K'
    };
  }

  /**
   * Calculate importance score for an observation
   */
  async calculateImportanceScore(observationId: string): Promise<ImportanceScore> {
    try {
      // Get observation details
      const obsResult = await this.db.run(`
        ?[id, entity_id, created_at, metadata] :=
          *observation{id, entity_id, created_at, metadata, @ "NOW"},
          id = $id
      `, { id: observationId });

      if (obsResult.rows.length === 0) {
        return { pagerank: 0, recency: 0, accessFrequency: 0, combined: 0 };
      }

      const [id, entityId, createdAt, metadata] = obsResult.rows[0];
      const createdAtMs = Array.isArray(createdAt) ? createdAt[0] / 1000 : createdAt;

      // 1. PageRank score (entity centrality)
      let pagerank = 0;
      try {
        const pagerankResult = await this.db.run(`
          ?[entity_id, rank] :=
            *entity_rank{entity_id, rank},
            entity_id = $entity_id
        `, { entity_id: entityId });
        
        if (pagerankResult.rows.length > 0) {
          pagerank = Number(pagerankResult.rows[0][1]);
        }
      } catch (e) {
        // PageRank not computed yet, use default
        pagerank = 0.5;
      }

      // 2. Recency score (exponential decay)
      const ageHours = (Date.now() - createdAtMs) / (1000 * 60 * 60);
      const halfLifeHours = 24 * 30; // 30 days half-life
      const recency = Math.pow(0.5, ageHours / halfLifeHours);

      // 3. Access frequency score
      const accessCount = (metadata as any)?.access_count ?? 0;
      const maxAccessCount = 100; // Normalize to 0-1
      const accessFrequency = Math.min(1.0, accessCount / maxAccessCount);

      // 4. Combined score (weighted)
      const combined = 
        (pagerank * this.config.importance_weights.pagerank) +
        (recency * this.config.importance_weights.recency) +
        (accessFrequency * this.config.importance_weights.access_frequency);

      return {
        pagerank,
        recency,
        accessFrequency,
        combined
      };
    } catch (error) {
      console.error('[HierarchicalMemory] Error calculating importance:', error);
      return { pagerank: 0, recency: 0, accessFrequency: 0, combined: 0 };
    }
  }

  /**
   * Get observations eligible for compression at a given level
   */
  private async getObservationsForCompression(
    entityId: string,
    level: MemoryLevel
  ): Promise<Array<{ id: string; text: string; created_at: number; importance: number }>> {
    // Determine time threshold based on level
    let retentionMs: number;
    switch (level) {
      case MemoryLevel.L0_RAW:
        retentionMs = this.config.l0_retention_hours * 60 * 60 * 1000;
        break;
      case MemoryLevel.L1_SESSION:
        retentionMs = this.config.l1_retention_days * 24 * 60 * 60 * 1000;
        break;
      case MemoryLevel.L2_WEEKLY:
        retentionMs = this.config.l2_retention_days * 24 * 60 * 60 * 1000;
        break;
      case MemoryLevel.L3_MONTHLY:
        retentionMs = this.config.l3_retention_days * 24 * 60 * 60 * 1000;
        break;
      default:
        retentionMs = 24 * 60 * 60 * 1000; // 1 day default
    }

    const cutoffTime = (Date.now() - retentionMs) * 1000; // Convert to microseconds

    // Get observations older than retention period at this level
    const result = await this.db.run(`
      ?[id, text, created_at_ts, memory_level] :=
        *observation{id, entity_id, text, created_at, metadata, @ "NOW"},
        entity_id = $entity_id,
        created_at_ts = to_int(created_at),
        created_at_ts < $cutoff,
        memory_level = get(metadata, "memory_level", 0),
        memory_level = $level
      
      :order created_at_ts
    `, { 
      entity_id: entityId, 
      cutoff: cutoffTime,
      level 
    });

    // Calculate importance for each observation
    const observations = await Promise.all(
      result.rows.map(async (row: any) => {
        const id = row[0];
        const text = row[1];
        const createdAt = Array.isArray(row[2]) ? row[2][0] / 1000 : row[2];
        
        const importanceScore = await this.calculateImportanceScore(id);
        
        return {
          id,
          text,
          created_at: createdAt,
          importance: importanceScore.combined
        };
      })
    );

    return observations;
  }

  /**
   * Compress observations at a given level using LLM summarization
   */
  async compressMemoryLevel(
    entityId: string,
    level: MemoryLevel
  ): Promise<CompressionResult | null> {
    try {
      console.error(`[HierarchicalMemory] Compressing level ${level} for entity ${entityId}`);

      // Get observations eligible for compression
      const observations = await this.getObservationsForCompression(entityId, level);

      if (observations.length < this.config.min_observations_for_compression) {
        console.error(`[HierarchicalMemory] Not enough observations (${observations.length}) for compression`);
        return null;
      }

      // Separate high-importance vs low-importance observations
      const highImportance = observations.filter(o => o.importance >= this.config.compression_threshold);
      const lowImportance = observations.filter(o => o.importance < this.config.compression_threshold);

      console.error(`[HierarchicalMemory] High importance: ${highImportance.length}, Low importance: ${lowImportance.length}`);

      // Generate summary using LLM
      const summaryText = await this.generateSummary(observations, level);

      // Create summary observation at next level
      const summaryId = uuidv4();
      const summaryEmbedding = await this.embeddings.embed(summaryText);
      const now = Date.now() * 1000; // microseconds

      await this.db.run(`
        ?[id, created_at, entity_id, text, embedding, metadata] :=
          id = $id,
          created_at = $created_at,
          entity_id = $entity_id,
          text = $text,
          embedding = $embedding,
          metadata = $metadata
        
        :put observation {
          id, created_at => entity_id, text, embedding, metadata
        }
      `, {
        id: summaryId,
        created_at: [now, true],
        entity_id: entityId,
        text: summaryText,
        embedding: summaryEmbedding,
        metadata: {
          memory_level: level + 1,
          compression_source: level,
          compressed_count: observations.length,
          compression_time: Date.now(),
          is_summary: true
        }
      });

      // Delete low-importance observations
      const deletedIds: string[] = [];
      for (const obs of lowImportance) {
        await this.db.run(`
          ?[id, created_at, entity_id, text, embedding, metadata] :=
            *observation{id, created_at, entity_id, text, embedding, metadata, @ "NOW"},
            id = $id
          
          :delete observation {
            id, created_at, entity_id, text, embedding, metadata
          }
        `, { id: obs.id });
        
        deletedIds.push(obs.id);
      }

      // Update high-importance observations to next level
      for (const obs of highImportance) {
        await this.db.run(`
          ?[id, created_at, entity_id, text, embedding, metadata] :=
            *observation{id, created_at, entity_id, text, embedding, metadata, @ "NOW"},
            id = $id,
            new_metadata = {
              "memory_level": ${level + 1},
              "preserved_by_importance": true,
              "importance_score": ${obs.importance}
            }
          
          :put observation {
            id, created_at => entity_id, text, embedding, metadata: new_metadata
          }
        `, { id: obs.id });
      }

      console.error(`[HierarchicalMemory] Compression complete: ${deletedIds.length} deleted, ${highImportance.length} preserved`);

      return {
        level,
        compressed_observations: observations.length,
        summary_id: summaryId,
        summary_text: summaryText,
        preserved_observations: highImportance.map(o => o.id),
        deleted_observations: deletedIds,
        importance_threshold: this.config.compression_threshold
      };
    } catch (error) {
      console.error('[HierarchicalMemory] Error compressing memory:', error);
      return null;
    }
  }

  /**
   * Generate summary using LLM
   */
  private async generateSummary(
    observations: Array<{ id: string; text: string; created_at: number; importance: number }>,
    level: MemoryLevel
  ): Promise<string> {
    try {
      // Dynamic import to avoid hard dependency
      const ollamaModule: any = await import('ollama');
      const ollama: any = ollamaModule?.default ?? ollamaModule;

      const levelName = ['Raw', 'Session', 'Weekly', 'Monthly'][level];
      const observationTexts = observations
        .sort((a, b) => b.importance - a.importance) // Sort by importance
        .slice(0, 50) // Limit to top 50
        .map(o => `- ${o.text}`)
        .join('\n');

      const prompt = `Summarize the following ${observations.length} observations into a concise ${levelName}-level memory summary. Focus on key themes, important facts, and recurring patterns. Preserve critical details while reducing redundancy.

Observations:
${observationTexts}

Summary:`;

      const response = await ollama.chat({
        model: this.config.llm_model,
        messages: [
          { role: 'system', content: 'You are a memory compression expert. Create concise, information-dense summaries that preserve key facts and patterns.' },
          { role: 'user', content: prompt }
        ]
      });

      const summary = (response as any)?.message?.content?.trim?.() ?? 'Summary generation failed';
      return `[${levelName} Summary] ${summary}`;
    } catch (error) {
      console.error('[HierarchicalMemory] LLM summarization failed:', error);
      // Fallback: simple concatenation
      return `[${['Raw', 'Session', 'Weekly', 'Monthly'][level]} Summary] Compressed ${observations.length} observations.`;
    }
  }

  /**
   * Compress all levels for an entity
   */
  async compressAllLevels(entityId: string): Promise<CompressionResult[]> {
    const results: CompressionResult[] = [];

    // Compress in order: L0 -> L1 -> L2 -> L3
    for (let level = MemoryLevel.L0_RAW; level < MemoryLevel.L3_MONTHLY; level++) {
      const result = await this.compressMemoryLevel(entityId, level);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Get memory statistics for an entity
   */
  async getMemoryStats(entityId: string): Promise<{
    total_observations: number;
    by_level: Record<number, number>;
    avg_importance: number;
  }> {
    try {
      // Get all observations and group by level
      const result = await this.db.run(`
        ?[memory_level, count(id)] :=
          *observation{id, entity_id, metadata, @ "NOW"},
          entity_id = $entity_id,
          memory_level = get(metadata, "memory_level", 0)
      `, { entity_id: entityId });

      const byLevel: Record<number, number> = {};
      let total = 0;

      for (const row of result.rows) {
        const level = Number(row[0]);
        const count = Number(row[1]);
        byLevel[level] = count;
        total += count;
      }

      return {
        total_observations: total,
        by_level: byLevel,
        avg_importance: 0.5 // TODO: Calculate actual average
      };
    } catch (error) {
      console.error('[HierarchicalMemory] Error getting stats:', error);
      return {
        total_observations: 0,
        by_level: {},
        avg_importance: 0
      };
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HierarchicalMemoryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<HierarchicalMemoryConfig> {
    return { ...this.config };
  }
}
