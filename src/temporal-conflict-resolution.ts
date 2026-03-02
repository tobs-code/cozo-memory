/**
 * Temporal Conflict Resolution Service
 * 
 * Inspired by T-GRAG (Li et al., 2025) - Dynamic GraphRAG Framework
 * 
 * Detects and resolves temporal conflicts in observations:
 * - Semantic contradictions across time periods
 * - Redundant information with temporal evolution
 * - Outdated facts superseded by newer information
 * 
 * Key Features:
 * - Embedding-based semantic similarity detection
 * - Keyword-based contradiction patterns
 * - Automatic conflict resolution via Validity retraction
 * - Audit trail preservation
 */

import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';

/**
 * Conflict types
 */
export enum ConflictType {
  SEMANTIC_CONTRADICTION = 'semantic_contradiction',
  TEMPORAL_REDUNDANCY = 'temporal_redundancy',
  SUPERSEDED_FACT = 'superseded_fact',
}

/**
 * Confidence level for conflict detection
 */
export enum ConflictConfidence {
  HIGH = 'high',      // >= 0.8
  MEDIUM = 'medium',  // 0.5 - 0.8
  LOW = 'low',        // < 0.5
}

/**
 * Detected conflict
 */
export interface TemporalConflict {
  older_observation_id: string;
  newer_observation_id: string;
  older_text: string;
  newer_text: string;
  older_time: number;
  newer_time: number;
  conflict_type: ConflictType;
  confidence: number;
  confidence_level: ConflictConfidence;
  reason: string;
  entity_id: string;
  entity_name: string;
}

/**
 * Resolution result
 */
export interface ConflictResolution {
  resolved_conflicts: number;
  invalidated_observations: string[];
  audit_observations: string[];
  conflicts: TemporalConflict[];
}

/**
 * Configuration for conflict detection
 */
export interface ConflictDetectionConfig {
  similarityThreshold?: number;        // Min similarity for redundancy (default: 0.85)
  contradictionThreshold?: number;     // Max similarity for contradiction (default: 0.3)
  timeWindowDays?: number;             // Time window for conflict detection (default: 365)
  autoResolve?: boolean;               // Automatically resolve conflicts (default: false)
  preserveAuditTrail?: boolean;        // Create audit observations (default: true)
}

/**
 * Contradiction patterns for keyword-based detection
 */
const CONTRADICTION_PATTERNS = [
  // Status contradictions
  { positive: ['active', 'running', 'ongoing', 'operational', 'continued'], 
    negative: ['inactive', 'discontinued', 'cancelled', 'stopped', 'shut down', 'closed', 'deprecated', 'archived', 'ended', 'abandoned'] },
  
  // Boolean contradictions
  { positive: ['yes', 'true', 'confirmed', 'approved', 'accepted', 'enabled'],
    negative: ['no', 'false', 'denied', 'rejected', 'refused', 'disabled'] },
  
  // Existence contradictions
  { positive: ['exists', 'present', 'available', 'found', 'located'],
    negative: ['missing', 'absent', 'unavailable', 'not found', 'removed', 'deleted'] },
  
  // Quantity contradictions (detected via numeric comparison)
  { positive: ['increased', 'grew', 'rose', 'higher', 'more', 'expanded'],
    negative: ['decreased', 'fell', 'dropped', 'lower', 'less', 'reduced', 'shrunk'] },
];

/**
 * Temporal Conflict Resolution Service
 */
export class TemporalConflictResolutionService {
  private db: CozoDb;
  private embeddings: EmbeddingService;
  private config: Required<ConflictDetectionConfig>;

  constructor(
    db: CozoDb,
    embeddings: EmbeddingService,
    config: ConflictDetectionConfig = {}
  ) {
    this.db = db;
    this.embeddings = embeddings;
    this.config = {
      similarityThreshold: config.similarityThreshold ?? 0.85,
      contradictionThreshold: config.contradictionThreshold ?? 0.3,
      timeWindowDays: config.timeWindowDays ?? 365,
      autoResolve: config.autoResolve ?? false,
      preserveAuditTrail: config.preserveAuditTrail ?? true,
    };
  }

  /**
   * Detect temporal conflicts for an entity
   */
  async detectConflicts(entityId: string): Promise<TemporalConflict[]> {
    try {
      // Get all observations for the entity, ordered by time
      // Query WITHOUT @ "NOW" to access created_at, then filter manually for valid rows
      const datalog = `
        ?[id, text, created_at_ms, embedding] := 
          *observation{
            id,
            created_at,
            entity_id,
            text,
            embedding
          },
          entity_id = $entity_id,
          to_bool(created_at),
          created_at_ms = to_int(created_at) / 1000
        
        :order created_at_ms
      `;

      const result = await this.db.run(datalog, { entity_id: entityId });
      
      if (result.rows.length < 2) {
        return []; // Need at least 2 observations to have conflicts
      }

      const observations = result.rows.map((row: any) => ({
        id: row[0],
        text: row[1],
        created_at: row[2], // Now in milliseconds
        embedding: row[3],
      }));

      // Get entity name (query without @ "NOW" and filter manually)
      const entityResult = await this.db.run(
        `?[name] := *entity{id, created_at, name}, id = $id, to_bool(created_at)`,
        { id: entityId }
      );
      const entityName = entityResult.rows[0]?.[0] || 'Unknown';

      const conflicts: TemporalConflict[] = [];

      // Compare each pair of observations
      for (let i = 0; i < observations.length; i++) {
        for (let j = i + 1; j < observations.length; j++) {
          const older = observations[i];
          const newer = observations[j];

          // Check time window
          const timeDiffDays = (newer.created_at - older.created_at) / (1000 * 60 * 60 * 24);
          if (timeDiffDays > this.config.timeWindowDays) {
            continue; // Outside time window
          }

          // Calculate semantic similarity
          const similarity = this.cosineSimilarity(older.embedding, newer.embedding);

          // Detect conflict type
          const conflict = this.detectConflictType(
            older,
            newer,
            similarity,
            entityId,
            entityName
          );

          if (conflict) {
            conflicts.push(conflict);
          }
        }
      }

      return conflicts;
    } catch (error) {
      console.error('[TemporalConflict] Error detecting conflicts:', error);
      return [];
    }
  }

  /**
   * Detect conflict type between two observations
   */
  private detectConflictType(
    older: any,
    newer: any,
    similarity: number,
    entityId: string,
    entityName: string
  ): TemporalConflict | null {
    // Type 1: Temporal Redundancy (very similar, likely duplicate)
    // Check this FIRST to avoid false contradiction detection
    if (similarity >= this.config.similarityThreshold) {
      return {
        older_observation_id: older.id,
        newer_observation_id: newer.id,
        older_text: older.text,
        newer_text: newer.text,
        older_time: older.created_at,
        newer_time: newer.created_at,
        conflict_type: ConflictType.TEMPORAL_REDUNDANCY,
        confidence: similarity,
        confidence_level: this.getConfidenceLevel(similarity),
        reason: `Highly similar observations (${(similarity * 100).toFixed(1)}% similarity) - likely redundant`,
        entity_id: entityId,
        entity_name: entityName,
      };
    }

    // Type 2: Semantic Contradiction (contradiction keywords detected)
    // Only check if NOT redundant (similarity < threshold)
    const contradictionScore = this.detectContradictionKeywords(older.text, newer.text);
    
    if (contradictionScore > 0.25) { // Lowered threshold from 0.5 to 0.25
      return {
        older_observation_id: older.id,
        newer_observation_id: newer.id,
        older_text: older.text,
        newer_text: newer.text,
        older_time: older.created_at,
        newer_time: newer.created_at,
        conflict_type: ConflictType.SEMANTIC_CONTRADICTION,
        confidence: contradictionScore,
        confidence_level: this.getConfidenceLevel(contradictionScore),
        reason: `Contradictory statements detected via keyword analysis`,
        entity_id: entityId,
        entity_name: entityName,
      };
    }

    // Type 3: Superseded Fact (moderate similarity, newer info updates older)
    if (similarity > 0.4 && similarity < 0.85) {
      // Check if newer observation explicitly supersedes older
      const supersessionScore = this.detectSupersession(older.text, newer.text);
      
      if (supersessionScore > 0.6) {
        return {
          older_observation_id: older.id,
          newer_observation_id: newer.id,
          older_text: older.text,
          newer_text: newer.text,
          older_time: older.created_at,
          newer_time: newer.created_at,
          conflict_type: ConflictType.SUPERSEDED_FACT,
          confidence: supersessionScore,
          confidence_level: this.getConfidenceLevel(supersessionScore),
          reason: `Newer observation updates or supersedes older information`,
          entity_id: entityId,
          entity_name: entityName,
        };
      }
    }

    return null;
  }

  /**
   * Detect contradiction keywords
   */
  private detectContradictionKeywords(text1: string, text2: string): number {
    const lower1 = text1.toLowerCase();
    const lower2 = text2.toLowerCase();
    
    let contradictionCount = 0;
    let totalChecks = 0;

    for (const pattern of CONTRADICTION_PATTERNS) {
      const hasPositive1 = pattern.positive.some(kw => lower1.includes(kw));
      const hasNegative1 = pattern.negative.some(kw => lower1.includes(kw));
      const hasPositive2 = pattern.positive.some(kw => lower2.includes(kw));
      const hasNegative2 = pattern.negative.some(kw => lower2.includes(kw));

      // Only count if at least one text has a keyword from this pattern
      if (hasPositive1 || hasNegative1 || hasPositive2 || hasNegative2) {
        totalChecks++;
        
        // Contradiction: one has positive, other has negative
        if ((hasPositive1 && hasNegative2) || (hasNegative1 && hasPositive2)) {
          contradictionCount++;
        }
      }
    }

    // Return 0 if no patterns were checked, otherwise return ratio
    return totalChecks === 0 ? 0 : contradictionCount / totalChecks;
  }

  /**
   * Detect if newer observation supersedes older
   */
  private detectSupersession(olderText: string, newerText: string): number {
    const supersessionKeywords = [
      'updated', 'revised', 'changed', 'modified', 'corrected',
      'now', 'currently', 'as of', 'latest', 'recent',
      'replaced', 'superseded', 'obsolete', 'outdated'
    ];

    const lowerNewer = newerText.toLowerCase();
    const matchCount = supersessionKeywords.filter(kw => lowerNewer.includes(kw)).length;
    
    return Math.min(matchCount / 3, 1.0); // Normalize to 0-1
  }

  /**
   * Resolve conflicts by invalidating older observations
   */
  async resolveConflicts(
    entityId: string,
    conflicts?: TemporalConflict[]
  ): Promise<ConflictResolution> {
    try {
      // Detect conflicts if not provided
      if (!conflicts) {
        conflicts = await this.detectConflicts(entityId);
      }

      if (conflicts.length === 0) {
        return {
          resolved_conflicts: 0,
          invalidated_observations: [],
          audit_observations: [],
          conflicts: [],
        };
      }

      const invalidatedObservations: string[] = [];
      const auditObservations: string[] = [];

      // Resolve each conflict
      for (const conflict of conflicts) {
        // Invalidate older observation
        await this.invalidateObservation(conflict.older_observation_id);
        invalidatedObservations.push(conflict.older_observation_id);

        // Create audit trail if enabled
        if (this.config.preserveAuditTrail) {
          const auditId = await this.createAuditObservation(conflict);
          auditObservations.push(auditId);
        }
      }

      console.log(`[TemporalConflict] Resolved ${conflicts.length} conflicts for entity ${entityId}`);

      return {
        resolved_conflicts: conflicts.length,
        invalidated_observations: invalidatedObservations,
        audit_observations: auditObservations,
        conflicts,
      };
    } catch (error) {
      console.error('[TemporalConflict] Error resolving conflicts:', error);
      throw error;
    }
  }

  /**
   * Invalidate an observation using Validity retraction
   */
  private async invalidateObservation(observationId: string): Promise<void> {
    // Delete the observation (query without @ "NOW" and filter manually)
    const datalog = `
      ?[id, created_at, entity_id, text, embedding, metadata] := 
        *observation{
          id,
          created_at,
          entity_id,
          text,
          embedding,
          metadata
        },
        id = $id,
        to_bool(created_at)
      
      :delete observation {
        id, created_at, entity_id, text, embedding, metadata
      }
    `;

    await this.db.run(datalog, { id: observationId });
  }

  /**
   * Create audit observation for conflict resolution
   */
  private async createAuditObservation(conflict: TemporalConflict): Promise<string> {
    const { v4: uuidv4 } = await import('uuid');
    const auditId = uuidv4();
    const now = Date.now() * 1000; // Convert to microseconds

    const auditText = `[CONFLICT RESOLVED] ${conflict.conflict_type}: Observation superseded by newer information (confidence: ${(conflict.confidence * 100).toFixed(1)}%)`;
    
    const embedding = await this.embeddings.embed(auditText);

    const datalog = `
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
    `;

    await this.db.run(datalog, {
      id: auditId,
      created_at: [now, true],
      entity_id: conflict.entity_id,
      text: auditText,
      embedding,
      metadata: {
        conflict_resolution: true,
        conflict_type: conflict.conflict_type,
        superseded_by: conflict.newer_observation_id,
        original_observation: conflict.older_observation_id,
        original_time: conflict.older_time,
        resolution_time: now / 1000, // Store as milliseconds in metadata
        confidence: conflict.confidence,
        reason: conflict.reason,
      },
    });

    return auditId;
  }

  /**
   * Get confidence level from numeric confidence
   */
  private getConfidenceLevel(confidence: number): ConflictConfidence {
    if (confidence >= 0.8) return ConflictConfidence.HIGH;
    if (confidence >= 0.5) return ConflictConfidence.MEDIUM;
    return ConflictConfidence.LOW;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ConflictDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<ConflictDetectionConfig> {
    return { ...this.config };
  }
}
