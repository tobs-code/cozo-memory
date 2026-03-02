import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';
import { v4 as uuidv4 } from 'uuid';

export enum PatternType {
  RECURRING_EVENT = 'recurring_event',
  CYCLICAL_RELATIONSHIP = 'cyclical_relationship',
  TEMPORAL_CORRELATION = 'temporal_correlation',
  SEASONAL_TREND = 'seasonal_trend',
  ANOMALY = 'anomaly'
}

export interface TemporalPattern {
  id: string;
  pattern_type: PatternType;
  entity_id: string;
  entity_name: string;
  description: string;
  frequency: number;
  confidence: number;
  first_occurrence: number;
  last_occurrence: number;
  interval_days?: number;
  occurrences: Array<{ timestamp: number; observation_id: string; text: string; }>;
  metadata?: Record<string, any>;
}

export interface PatternDetectionConfig {
  min_occurrences?: number;
  min_confidence?: number;
  time_window_days?: number;
  similarity_threshold?: number;
  seasonal_buckets?: number;
}

export class TemporalPatternDetectionService {
  private db: CozoDb;
  private embeddings: EmbeddingService;
  private config: Required<PatternDetectionConfig>;

  constructor(db: CozoDb, embeddings: EmbeddingService, config: PatternDetectionConfig = {}) {
    this.db = db;
    this.embeddings = embeddings;
    this.config = {
      min_occurrences: config.min_occurrences ?? 3,
      min_confidence: config.min_confidence ?? 0.6,
      time_window_days: config.time_window_days ?? 365,
      similarity_threshold: config.similarity_threshold ?? 0.75,
      seasonal_buckets: config.seasonal_buckets ?? 12
    };
  }

  async detectPatterns(entityId: string): Promise<TemporalPattern[]> {
    const patterns: TemporalPattern[] = [];

    // Get entity name (without time travel since test doesn't use Validity)
    let entityName = 'Unknown';
    try {
      const entityResult = await this.db.run(`
        ?[name] := *entity{id, name, @ "NOW"}, id = $entity_id
      `, { entity_id: entityId });
      entityName = entityResult.rows.length > 0 ? entityResult.rows[0][0] as string : 'Unknown';
    } catch (error: any) {
      // Fallback if Validity is not used
      const entityResult = await this.db.run(`
        ?[name] := *entity{id, name}, id = $entity_id
      `, { entity_id: entityId });
      entityName = entityResult.rows.length > 0 ? entityResult.rows[0][0] as string : 'Unknown';
    }

    // 1. Detect recurring events
    const recurringPatterns = await this.detectRecurringEvents(entityId, entityName);
    patterns.push(...recurringPatterns);

    // 2. Detect cyclical relationships
    const cyclicalPatterns = await this.detectCyclicalRelationships(entityId, entityName);
    patterns.push(...cyclicalPatterns);

    // 3. Detect temporal correlations
    const correlationPatterns = await this.detectTemporalCorrelations(entityId, entityName);
    patterns.push(...correlationPatterns);

    // 4. Detect seasonal trends
    const seasonalPatterns = await this.detectSeasonalTrends(entityId, entityName);
    patterns.push(...seasonalPatterns);

    return patterns;
  }

  private async detectRecurringEvents(entityId: string, entityName: string): Promise<TemporalPattern[]> {
    const patterns: TemporalPattern[] = [];
    const timeWindowMicros = this.config.time_window_days * 24 * 60 * 60 * 1000 * 1000;
    const nowMicros = Date.now() * 1000;
    const startTime = nowMicros - timeWindowMicros;

    // Get all observations for this entity within time window
    const obsResult = await this.db.run(`
      ?[id, text, embedding, created_at] := 
        *observation{id, entity_id, text, embedding, created_at},
        entity_id = $entity_id,
        to_int(created_at) >= $start_time
    `, { entity_id: entityId, start_time: startTime });

    if (obsResult.rows.length < this.config.min_occurrences) {
      return patterns;
    }

    // Group similar observations using embeddings
    const observations = obsResult.rows.map((row: any) => {
      const createdAt = row[3];
      const timestamp = Array.isArray(createdAt) ? createdAt[0] : createdAt;
      return {
        id: row[0] as string,
        text: row[1] as string,
        embedding: row[2] as number[],
        timestamp
      };
    });

    // Cluster similar observations
    const clusters = this.clusterObservations(observations);

    // Analyze each cluster for recurring patterns
    for (const cluster of clusters) {
      if (cluster.length < this.config.min_occurrences) continue;

      // Sort by timestamp
      cluster.sort((a, b) => a.timestamp - b.timestamp);

      // Calculate intervals between occurrences
      const intervals: number[] = [];
      for (let i = 1; i < cluster.length; i++) {
        const intervalMs = (cluster[i].timestamp - cluster[i - 1].timestamp) / 1000;
        const intervalDays = intervalMs / (24 * 60 * 60 * 1000);
        intervals.push(intervalDays);
      }

      // Check if intervals are relatively consistent (recurring pattern)
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = stdDev / avgInterval;

      // If coefficient of variation is low, it's a recurring pattern
      if (coefficientOfVariation < 0.3) {
        const confidence = Math.max(0, 1 - coefficientOfVariation);
        
        if (confidence >= this.config.min_confidence) {
          patterns.push({
            id: uuidv4(),
            pattern_type: PatternType.RECURRING_EVENT,
            entity_id: entityId,
            entity_name: entityName,
            description: `Recurring event: "${cluster[0].text}" occurs approximately every ${avgInterval.toFixed(0)} days`,
            frequency: cluster.length,
            confidence,
            first_occurrence: cluster[0].timestamp,
            last_occurrence: cluster[cluster.length - 1].timestamp,
            interval_days: avgInterval,
            occurrences: cluster.map(obs => ({
              timestamp: obs.timestamp,
              observation_id: obs.id,
              text: obs.text
            })),
            metadata: {
              avg_interval_days: avgInterval,
              std_dev_days: stdDev,
              coefficient_of_variation: coefficientOfVariation
            }
          });
        }
      }
    }

    return patterns;
  }

  private async detectCyclicalRelationships(entityId: string, entityName: string): Promise<TemporalPattern[]> {
    const patterns: TemporalPattern[] = [];

    // Find cycles in the relationship graph starting from this entity
    // A cycle is: A -> B -> ... -> A
    const cycleResult = await this.db.run(`
      cycle[from_id, to_id, path] := 
        *relationship{from_id, to_id},
        from_id = $entity_id,
        path = [from_id, to_id]
      
      cycle[from_id, to_id, path] :=
        cycle[from_id, mid, prev_path],
        *relationship{from_id: mid, to_id},
        to_id != from_id,
        !is_in(to_id, prev_path),
        length(prev_path) < 10,
        path = append(prev_path, to_id)
      
      ?[from_id, to_id, path] :=
        cycle[from_id, to_id, path],
        to_id = $entity_id,
        length(path) >= 3
    `, { entity_id: entityId });

    for (const row of cycleResult.rows) {
      const path = row[2] as string[];
      const cycleLength = path.length;

      // Get relationship types in the cycle
      const relationTypes: string[] = [];
      for (let i = 0; i < path.length - 1; i++) {
        const relResult = await this.db.run(`
          ?[relation_type] := 
            *relationship{from_id, to_id, relation_type},
            from_id = $from_id,
            to_id = $to_id
        `, { from_id: path[i], to_id: path[i + 1] });
        
        if (relResult.rows.length > 0) {
          relationTypes.push(relResult.rows[0][0] as string);
        }
      }

      // Add closing relationship
      const closingRelResult = await this.db.run(`
        ?[relation_type] := 
          *relationship{from_id, to_id, relation_type},
          from_id = $from_id,
          to_id = $to_id
      `, { from_id: path[path.length - 1], to_id: path[0] });
      
      if (closingRelResult.rows.length > 0) {
        relationTypes.push(closingRelResult.rows[0][0] as string);
      }

      const confidence = Math.min(1.0, 0.7 + (0.1 * cycleLength));

      if (confidence >= this.config.min_confidence) {
        patterns.push({
          id: uuidv4(),
          pattern_type: PatternType.CYCLICAL_RELATIONSHIP,
          entity_id: entityId,
          entity_name: entityName,
          description: `Cyclical relationship detected: ${relationTypes.join(' → ')}`,
          frequency: 1,
          confidence,
          first_occurrence: Date.now() * 1000,
          last_occurrence: Date.now() * 1000,
          occurrences: [],
          metadata: {
            cycle_path: path,
            cycle_length: cycleLength,
            relation_types: relationTypes
          }
        });
      }
    }

    return patterns;
  }

  private async detectTemporalCorrelations(entityId: string, entityName: string): Promise<TemporalPattern[]> {
    const patterns: TemporalPattern[] = [];
    const timeWindowMicros = this.config.time_window_days * 24 * 60 * 60 * 1000 * 1000;
    const nowMicros = Date.now() * 1000;
    const startTime = nowMicros - timeWindowMicros;

    // Get all observations
    const obsResult = await this.db.run(`
      ?[id, text, embedding, created_at] := 
        *observation{id, entity_id, text, embedding, created_at},
        entity_id = $entity_id,
        to_int(created_at) >= $start_time
    `, { entity_id: entityId, start_time: startTime });

    if (obsResult.rows.length < this.config.min_occurrences * 2) {
      return patterns;
    }

    const observations = obsResult.rows.map((row: any) => {
      const createdAt = row[3];
      const timestamp = Array.isArray(createdAt) ? createdAt[0] : createdAt;
      return {
        id: row[0] as string,
        text: row[1] as string,
        embedding: row[2] as number[],
        timestamp
      };
    });

    // Find pairs of different observation types that occur close together
    const correlationWindow = 2 * 24 * 60 * 60 * 1000 * 1000; // 2 days in microseconds
    const correlations = new Map<string, Array<{ obs1: typeof observations[0], obs2: typeof observations[0] }>>();

    for (let i = 0; i < observations.length; i++) {
      for (let j = i + 1; j < observations.length; j++) {
        const timeDiff = Math.abs(observations[j].timestamp - observations[i].timestamp);
        
        if (timeDiff <= correlationWindow) {
          const similarity = this.cosineSimilarity(observations[i].embedding, observations[j].embedding);
          
          // Only correlate different types of events (low similarity)
          if (similarity < 0.5) {
            const key = [observations[i].text, observations[j].text].sort().join('|||');
            
            if (!correlations.has(key)) {
              correlations.set(key, []);
            }
            
            correlations.get(key)!.push({
              obs1: observations[i],
              obs2: observations[j]
            });
          }
        }
      }
    }

    // Analyze correlations
    for (const [key, pairs] of correlations.entries()) {
      if (pairs.length >= this.config.min_occurrences) {
        const [text1, text2] = key.split('|||');
        const confidence = Math.min(1.0, pairs.length / (this.config.min_occurrences * 2));

        if (confidence >= this.config.min_confidence) {
          patterns.push({
            id: uuidv4(),
            pattern_type: PatternType.TEMPORAL_CORRELATION,
            entity_id: entityId,
            entity_name: entityName,
            description: `Temporal correlation: "${text1}" often occurs near "${text2}"`,
            frequency: pairs.length,
            confidence,
            first_occurrence: Math.min(...pairs.map(p => Math.min(p.obs1.timestamp, p.obs2.timestamp))),
            last_occurrence: Math.max(...pairs.map(p => Math.max(p.obs1.timestamp, p.obs2.timestamp))),
            occurrences: pairs.flatMap(p => [
              { timestamp: p.obs1.timestamp, observation_id: p.obs1.id, text: p.obs1.text },
              { timestamp: p.obs2.timestamp, observation_id: p.obs2.id, text: p.obs2.text }
            ]),
            metadata: {
              event_pair: [text1, text2],
              correlation_window_days: correlationWindow / (24 * 60 * 60 * 1000 * 1000)
            }
          });
        }
      }
    }

    return patterns;
  }

  private async detectSeasonalTrends(entityId: string, entityName: string): Promise<TemporalPattern[]> {
    const patterns: TemporalPattern[] = [];
    const timeWindowMicros = this.config.time_window_days * 24 * 60 * 60 * 1000 * 1000;
    const nowMicros = Date.now() * 1000;
    const startTime = nowMicros - timeWindowMicros;

    // Get all observations
    const obsResult = await this.db.run(`
      ?[id, text, created_at] := 
        *observation{id, entity_id, text, created_at},
        entity_id = $entity_id,
        to_int(created_at) >= $start_time
    `, { entity_id: entityId, start_time: startTime });

    if (obsResult.rows.length < this.config.min_occurrences) {
      return patterns;
    }

    // Group observations by seasonal bucket (month or quarter)
    const buckets = new Map<number, Array<{ id: string; text: string; timestamp: number }>>();
    
    for (const row of obsResult.rows) {
      const createdAt = row[2];
      // Handle both Validity tuple [timestamp, valid] and plain timestamp
      const timestamp = Array.isArray(createdAt) ? createdAt[0] : createdAt;
      const date = new Date(timestamp / 1000); // Convert microseconds to milliseconds
      const bucket = date.getMonth(); // 0-11 for monthly buckets
      
      if (!buckets.has(bucket)) {
        buckets.set(bucket, []);
      }
      
      buckets.get(bucket)!.push({
        id: row[0] as string,
        text: row[1] as string,
        timestamp
      });
    }

    // Calculate average activity per bucket
    const avgActivity = obsResult.rows.length / this.config.seasonal_buckets;
    
    // Find buckets with significantly higher activity
    for (const [bucket, observations] of buckets.entries()) {
      const activityRatio = observations.length / avgActivity;
      
      // If activity is 2x or more than average, it's a seasonal trend
      if (activityRatio >= 2.0 && observations.length >= this.config.min_occurrences) {
        const confidence = Math.min(1.0, activityRatio / 3);
        
        if (confidence >= this.config.min_confidence) {
          const monthName = new Date(2024, bucket, 1).toLocaleString('default', { month: 'long' });
          
          patterns.push({
            id: uuidv4(),
            pattern_type: PatternType.SEASONAL_TREND,
            entity_id: entityId,
            entity_name: entityName,
            description: `Seasonal trend: Increased activity in ${monthName} (${activityRatio.toFixed(1)}x average)`,
            frequency: observations.length,
            confidence,
            first_occurrence: Math.min(...observations.map(o => o.timestamp)),
            last_occurrence: Math.max(...observations.map(o => o.timestamp)),
            occurrences: observations.map(obs => ({
              timestamp: obs.timestamp,
              observation_id: obs.id,
              text: obs.text
            })),
            metadata: {
              seasonal_bucket: bucket,
              bucket_name: monthName,
              activity_ratio: activityRatio,
              avg_activity: avgActivity
            }
          });
        }
      }
    }

    return patterns;
  }

  private clusterObservations(observations: Array<{ id: string; text: string; embedding: number[]; timestamp: number }>): Array<Array<{ id: string; text: string; embedding: number[]; timestamp: number }>> {
    const clusters: Array<Array<typeof observations[0]>> = [];
    const used = new Set<number>();

    for (let i = 0; i < observations.length; i++) {
      if (used.has(i)) continue;

      const cluster = [observations[i]];
      used.add(i);

      for (let j = i + 1; j < observations.length; j++) {
        if (used.has(j)) continue;

        const similarity = this.cosineSimilarity(observations[i].embedding, observations[j].embedding);
        
        if (similarity >= this.config.similarity_threshold) {
          cluster.push(observations[j]);
          used.add(j);
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
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

  async storePattern(pattern: TemporalPattern): Promise<void> {
    // Create temporal_pattern relation if it doesn't exist (only once)
    try {
      await this.db.run(`
        :create temporal_pattern {
          id: String =>
          pattern_type: String,
          entity_id: String,
          entity_name: String,
          description: String,
          frequency: Int,
          confidence: Float,
          first_occurrence: Int,
          last_occurrence: Int,
          interval_days: Float?,
          metadata: Json
        }
      `);
    } catch (error: any) {
      // Relation already exists, that's fine - continue with insert
      if (!error.display?.includes('already exists') && !error.display?.includes('conflicts with an existing')) {
        throw error;
      }
    }

    await this.db.run(`
      ?[id, pattern_type, entity_id, entity_name, description, frequency, confidence, first_occurrence, last_occurrence, interval_days, metadata] :=
        id = $id,
        pattern_type = $pattern_type,
        entity_id = $entity_id,
        entity_name = $entity_name,
        description = $description,
        frequency = $frequency,
        confidence = $confidence,
        first_occurrence = $first_occurrence,
        last_occurrence = $last_occurrence,
        interval_days = $interval_days,
        metadata = $metadata
      
      :put temporal_pattern {
        id => pattern_type, entity_id, entity_name, description, frequency, confidence, first_occurrence, last_occurrence, interval_days, metadata
      }
    `, {
      id: pattern.id,
      pattern_type: pattern.pattern_type,
      entity_id: pattern.entity_id,
      entity_name: pattern.entity_name,
      description: pattern.description,
      frequency: pattern.frequency,
      confidence: pattern.confidence,
      first_occurrence: pattern.first_occurrence,
      last_occurrence: pattern.last_occurrence,
      interval_days: pattern.interval_days ?? null,
      metadata: pattern.metadata ?? {}
    });
  }

  async getStoredPatterns(entityId?: string, patternType?: PatternType): Promise<TemporalPattern[]> {
    let query = `
      ?[id, pattern_type, entity_id, entity_name, description, frequency, confidence, first_occurrence, last_occurrence, interval_days, metadata] :=
        *temporal_pattern{id, pattern_type, entity_id, entity_name, description, frequency, confidence, first_occurrence, last_occurrence, interval_days, metadata}
    `;

    const params: Record<string, any> = {};

    if (entityId) {
      query += `, entity_id = $entity_id`;
      params.entity_id = entityId;
    }

    if (patternType) {
      query += `, pattern_type = $pattern_type`;
      params.pattern_type = patternType;
    }

    const result = await this.db.run(query, params);

    return result.rows.map((row: any) => ({
      id: row[0] as string,
      pattern_type: row[1] as PatternType,
      entity_id: row[2] as string,
      entity_name: row[3] as string,
      description: row[4] as string,
      frequency: row[5] as number,
      confidence: row[6] as number,
      first_occurrence: row[7] as number,
      last_occurrence: row[8] as number,
      interval_days: row[9] as number | undefined,
      occurrences: [],
      metadata: row[10] as Record<string, any>
    }));
  }

  updateConfig(config: Partial<PatternDetectionConfig>): void {
    this.config = { ...this.config, ...config as any };
  }

  getConfig(): Required<PatternDetectionConfig> {
    return { ...this.config };
  }
}
