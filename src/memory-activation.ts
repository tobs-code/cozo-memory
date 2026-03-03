import { CozoDb } from 'cozo-node';

/**
 * Memory Activation Service
 * 
 * Implements ACT-R Base-Level Learning + Ebbinghaus Forgetting Curve
 * for intelligent memory activation and forgetting.
 * 
 * Formula: R = e^(-t/S)
 * where:
 * - R = retrievability/activation (0-1)
 * - t = time since last access
 * - S = memory strength (increases with each recall)
 */

export interface ActivationConfig {
  initialStrength: number;      // Initial memory strength (S₀)
  strengthIncrement: number;     // Strength increase per recall
  maxStrength: number;           // Maximum memory strength
  retentionThreshold: number;    // Minimum activation to retain
  decayBase: number;             // Base for exponential decay (e ≈ 2.718)
  timeUnit: 'hours' | 'days';    // Time unit for decay calculation
}

export interface ActivationScore {
  observationId: string;
  entityId: string;
  activation: number;            // Current activation level (0-1)
  strength: number;              // Memory strength (S)
  timeSinceAccess: number;       // Time since last access (in timeUnit)
  accessCount: number;           // Number of times accessed
  shouldRetain: boolean;         // Whether to keep this memory
  reason: string;                // Explanation for retention decision
}

export interface ActivationStats {
  totalObservations: number;
  averageActivation: number;
  averageStrength: number;
  belowThreshold: number;
  aboveThreshold: number;
  distribution: {
    veryWeak: number;    // < 0.1
    weak: number;        // 0.1 - 0.3
    moderate: number;    // 0.3 - 0.6
    strong: number;      // 0.6 - 0.9
    veryStrong: number;  // > 0.9
  };
}

export class MemoryActivationService {
  private db: CozoDb;
  private config: ActivationConfig;

  constructor(
    db: CozoDb,
    config: Partial<ActivationConfig> = {}
  ) {
    this.db = db;
    this.config = {
      initialStrength: config.initialStrength ?? 1.0,
      strengthIncrement: config.strengthIncrement ?? 1.0,
      maxStrength: config.maxStrength ?? 20.0,
      retentionThreshold: config.retentionThreshold ?? 0.15,
      decayBase: config.decayBase ?? Math.E,
      timeUnit: config.timeUnit ?? 'days',
    };
  }

  /**
   * Calculate activation score for an observation
   * Formula: R = e^(-t/S)
   * With emotional salience: decay rate is reduced by salienceBoostDecay
   */
  private calculateActivation(
    timeSinceAccess: number,
    strength: number,
    salienceBoostDecay: number = 0.0
  ): number {
    if (timeSinceAccess === 0) return 1.0;
    
    // Apply salience decay reduction (slower decay for emotionally salient memories)
    const effectiveTime = timeSinceAccess * (1.0 - salienceBoostDecay);
    const exponent = -effectiveTime / strength;
    const activation = Math.pow(this.config.decayBase, exponent);
    
    return Math.max(0, Math.min(1, activation));
  }

  /**
   * Get current memory strength for an observation
   * S = initialStrength + (accessCount * strengthIncrement)
   * With emotional salience boost: S = S * salienceBoostStrength
   */
  private calculateStrength(
    accessCount: number, 
    salienceBoostStrength: number = 1.0
  ): number {
    const baseStrength = this.config.initialStrength + 
                        (accessCount * this.config.strengthIncrement);
    const boostedStrength = baseStrength * salienceBoostStrength;
    return Math.min(boostedStrength, this.config.maxStrength);
  }

  /**
   * Convert timestamp to time units since last access
   */
  private getTimeSinceAccess(lastAccessTime: number): number {
    const now = Date.now();
    const diffMs = now - lastAccessTime;
    
    if (this.config.timeUnit === 'hours') {
      return diffMs / (1000 * 60 * 60);
    } else {
      return diffMs / (1000 * 60 * 60 * 24);
    }
  }

  /**
   * Calculate activation scores for all observations
   */
  async calculateActivationScores(
    entityId?: string
  ): Promise<ActivationScore[]> {
    try {
      // Query observations with access metadata
      const query = entityId
        ? `
          ?[id, entity_id, text, metadata, created_at] := 
            *observation{id, entity_id, session_id, task_id, text, metadata, created_at, @ "NOW"},
            entity_id == $entity_id
        `
        : `
          ?[id, entity_id, text, metadata, created_at] := 
            *observation{id, entity_id, session_id, task_id, text, metadata, created_at, @ "NOW"}
        `;

      const result = await this.db.run(query, entityId ? { entity_id: entityId } : {});
      const observations = result.rows;

      const scores: ActivationScore[] = [];

      for (const [id, entity_id, text, metadata, created_at] of observations) {
        // Extract access metadata
        const accessCount = (metadata?.access_count || 0) as number;
        const lastAccessTime = (metadata?.last_access_time || created_at) as number;

        // Extract emotional salience boosts (if present)
        const salienceBoostStrength = (metadata?.salience_boost_strength || 1.0) as number;
        const salienceBoostDecay = (metadata?.salience_boost_decay || 0.0) as number;
        const salienceScore = (metadata?.emotional_salience || 0.0) as number;

        // Calculate activation with salience boosts
        const timeSinceAccess = this.getTimeSinceAccess(lastAccessTime);
        const strength = this.calculateStrength(accessCount, salienceBoostStrength);
        const activation = this.calculateActivation(timeSinceAccess, strength, salienceBoostDecay);

        // Determine retention
        const shouldRetain = activation >= this.config.retentionThreshold;
        const salienceInfo = salienceScore > 0 
          ? ` [Salience: ${salienceScore.toFixed(2)}, Boost: ×${salienceBoostStrength.toFixed(2)}]`
          : '';
        const reason = shouldRetain
          ? `Active memory (activation: ${activation.toFixed(3)}, strength: ${strength.toFixed(1)})${salienceInfo}`
          : `Below threshold (activation: ${activation.toFixed(3)} < ${this.config.retentionThreshold})${salienceInfo}`;

        scores.push({
          observationId: id as string,
          entityId: entity_id as string,
          activation,
          strength,
          timeSinceAccess,
          accessCount,
          shouldRetain,
          reason
        });
      }

      return scores.sort((a, b) => b.activation - a.activation);
    } catch (error) {
      console.error('[MemoryActivation] Error calculating activation scores:', error);
      return [];
    }
  }

  /**
   * Update access metadata when an observation is retrieved
   */
  async recordAccess(observationId: string): Promise<void> {
    try {
      // Get current observation
      const result = await this.db.run(`
        ?[id, entity_id, session_id, task_id, text, metadata, created_at] := 
          *observation{id, entity_id, session_id, task_id, text, metadata, created_at, @ "NOW"},
          id == $id
      `, { id: observationId });

      if (result.rows.length === 0) {
        console.warn(`[MemoryActivation] Observation ${observationId} not found`);
        return;
      }

      const [id, entity_id, session_id, task_id, text, metadata, created_at] = result.rows[0];
      const currentMetadata = (metadata || {}) as Record<string, any>;

      // Update access metadata
      const accessCount = (currentMetadata.access_count || 0) + 1;
      const lastAccessTime = Date.now();

      const updatedMetadata = {
        ...currentMetadata,
        access_count: accessCount,
        last_access_time: lastAccessTime,
      };

      // Get embedding (we need it for the update)
      const embResult = await this.db.run(`
        ?[embedding] := *observation{id: $id, embedding, @ "NOW"}
      `, { id: observationId });
      
      if (embResult.rows.length === 0) {
        console.warn(`[MemoryActivation] Could not get embedding for observation ${observationId}`);
        return;
      }
      
      const embedding = embResult.rows[0][0];

      // Update observation with new metadata
      await this.db.run(`
        ?[id, entity_id, session_id, task_id, text, embedding, metadata, created_at] <- [
          [$id, $entity_id, $session_id, $task_id, $text, $embedding, $metadata, $created_at]
        ]
        :put observation {id, created_at => entity_id, session_id, task_id, text, embedding, metadata}
      `, {
        id,
        entity_id,
        session_id,
        task_id,
        text,
        embedding,
        metadata: updatedMetadata,
        created_at
      });
      
    } catch (error) {
      console.error('[MemoryActivation] Error recording access:', error);
    }
  }

  /**
   * Prune weak memories below activation threshold
   */
  async pruneWeakMemories(
    dryRun: boolean = true,
    entityId?: string
  ): Promise<{ pruned: number; preserved: number; candidates: ActivationScore[] }> {
    try {
      const scores = await this.calculateActivationScores(entityId);
      const candidates = scores.filter(s => !s.shouldRetain);

      if (dryRun) {
        console.error(`[MemoryActivation] Dry run: ${candidates.length} observations below threshold`);
        return {
          pruned: 0,
          preserved: scores.length,
          candidates,
        };
      }

      // Actually delete weak memories
      let pruned = 0;
      for (const candidate of candidates) {
        // Delete the observation using :rm
        await this.db.run(`
          ?[id, entity_id, session_id, task_id, text, metadata, created_at] := 
            *observation{id, entity_id, session_id, task_id, text, metadata, created_at, @ "NOW"},
            id == $id
          :rm observation {id, created_at => entity_id, session_id, task_id, text, metadata}
        `, { id: candidate.observationId });
        
        pruned++;
      }

      return {
        pruned,
        preserved: scores.length - pruned,
        candidates,
      };
    } catch (error) {
      console.error('[MemoryActivation] Error pruning weak memories:', error);
      return { pruned: 0, preserved: 0, candidates: [] };
    }
  }

  /**
   * Get activation statistics
   */
  async getActivationStats(entityId?: string): Promise<ActivationStats> {
    try {
      const scores = await this.calculateActivationScores(entityId);

      if (scores.length === 0) {
        return {
          totalObservations: 0,
          averageActivation: 0,
          averageStrength: 0,
          belowThreshold: 0,
          aboveThreshold: 0,
          distribution: {
            veryWeak: 0,
            weak: 0,
            moderate: 0,
            strong: 0,
            veryStrong: 0,
          },
        };
      }

      const totalActivation = scores.reduce((sum, s) => sum + s.activation, 0);
      const totalStrength = scores.reduce((sum, s) => sum + s.strength, 0);

      const distribution = {
        veryWeak: scores.filter(s => s.activation < 0.1).length,
        weak: scores.filter(s => s.activation >= 0.1 && s.activation < 0.3).length,
        moderate: scores.filter(s => s.activation >= 0.3 && s.activation < 0.6).length,
        strong: scores.filter(s => s.activation >= 0.6 && s.activation < 0.9).length,
        veryStrong: scores.filter(s => s.activation >= 0.9).length,
      };

      return {
        totalObservations: scores.length,
        averageActivation: totalActivation / scores.length,
        averageStrength: totalStrength / scores.length,
        belowThreshold: scores.filter(s => !s.shouldRetain).length,
        aboveThreshold: scores.filter(s => s.shouldRetain).length,
        distribution,
      };
    } catch (error) {
      console.error('[MemoryActivation] Error getting activation stats:', error);
      return {
        totalObservations: 0,
        averageActivation: 0,
        averageStrength: 0,
        belowThreshold: 0,
        aboveThreshold: 0,
        distribution: {
          veryWeak: 0,
          weak: 0,
          moderate: 0,
          strong: 0,
          veryStrong: 0,
        },
      };
    }
  }

  /**
   * Boost activation of related memories (priming effect)
   */
  async boostRelatedMemories(
    observationId: string,
    boostFactor: number = 0.5
  ): Promise<number> {
    try {
      // Get the observation
      const result = await this.db.run(`
        ?[id, entity_id, session_id, task_id, text, metadata, created_at] := 
          *observation{id, entity_id, session_id, task_id, text, metadata, created_at, @ "NOW"},
          id == $id
      `, { id: observationId });
      
      if (result.rows.length === 0) {
        console.warn(`[MemoryActivation] Observation ${observationId} not found`);
        return 0;
      }

      const [id, entity_id] = result.rows[0];

      // Get all observations for the same entity (excluding the current one)
      const relatedResult = await this.db.run(`
        ?[id, entity_id, session_id, task_id, text, metadata, created_at] := 
          *observation{id, entity_id, session_id, task_id, text, metadata, created_at, @ "NOW"},
          entity_id == $entity_id,
          id != $id
      `, { entity_id, id: observationId });

      let boosted = 0;
      for (const [relId, relEntityId, relSessionId, relTaskId, relText, relMetadata, relCreatedAt] of relatedResult.rows) {
        const currentMetadata = (relMetadata || {}) as Record<string, any>;
        
        // Simulate a partial access (priming effect)
        const accessCount = (currentMetadata.access_count || 0) + boostFactor;
        
        const updatedMetadata = {
          ...currentMetadata,
          access_count: accessCount,
        };

        // Get embedding
        const embResult = await this.db.run(`
          ?[embedding] := *observation{id: $id, embedding, @ "NOW"}
        `, { id: relId });
        
        if (embResult.rows.length === 0) continue;
        const relEmbedding = embResult.rows[0][0];

        // Update the related observation
        await this.db.run(`
          ?[id, entity_id, session_id, task_id, text, embedding, metadata, created_at] <- [
            [$id, $entity_id, $session_id, $task_id, $text, $embedding, $metadata, $created_at]
          ]
          :put observation {id, created_at => entity_id, session_id, task_id, text, embedding, metadata}
        `, {
          id: relId,
          entity_id: relEntityId,
          session_id: relSessionId,
          task_id: relTaskId,
          text: relText,
          embedding: relEmbedding,
          metadata: updatedMetadata,
          created_at: relCreatedAt
        });
        
        boosted++;
      }

      return boosted;
    } catch (error) {
      console.error('[MemoryActivation] Error boosting related memories:', error);
      return 0;
    }
  }
}
