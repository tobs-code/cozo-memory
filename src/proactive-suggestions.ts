import { DatabaseService } from './db-service.js';
import { EmbeddingService } from './embedding-service.js';
import { Entity, Relationship } from './types.js';

/**
 * Suggestion source type
 */
export enum SuggestionSource {
  VECTOR_SIMILARITY = 'vector_similarity',
  COMMON_NEIGHBORS = 'common_neighbors',
  INFERENCE = 'inference',
  GRAPH_PROXIMITY = 'graph_proximity',
}

/**
 * Suggestion confidence level
 */
export enum ConfidenceLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

/**
 * Proactive suggestion result
 */
export interface ProactiveSuggestion {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  relation_type?: string;
  source: SuggestionSource;
  confidence: number;
  confidence_level: ConfidenceLevel;
  reason: string;
  metadata?: Record<string, any>;
}

/**
 * Suggestion configuration
 */
export interface SuggestionConfig {
  maxSuggestions?: number;
  minConfidence?: number;
  enableVectorSimilarity?: boolean;
  enableCommonNeighbors?: boolean;
  enableInference?: boolean;
  enableGraphProximity?: boolean;
  vectorSimilarityWeight?: number;
  commonNeighborsWeight?: number;
  inferenceWeight?: number;
  graphProximityWeight?: number;
}

/**
 * ProactiveSuggestionsService
 * 
 * Provides intelligent relationship discovery and connection suggestions
 * using multiple strategies:
 * 1. Vector Similarity - Find semantically similar entities
 * 2. Common Neighbors - Find entities sharing connections
 * 3. Inference Engine - Discover implicit relationships
 * 4. Graph Proximity - Find nearby entities in the knowledge graph
 */
export class ProactiveSuggestionsService {
  private db: DatabaseService;
  private embeddings: EmbeddingService;
  private config: Required<SuggestionConfig>;

  constructor(db: DatabaseService, embeddings: EmbeddingService, config: SuggestionConfig = {}) {
    this.db = db;
    this.embeddings = embeddings;
    this.config = {
      maxSuggestions: config.maxSuggestions ?? 10,
      minConfidence: config.minConfidence ?? 0.5,
      enableVectorSimilarity: config.enableVectorSimilarity ?? true,
      enableCommonNeighbors: config.enableCommonNeighbors ?? true,
      enableInference: config.enableInference ?? true,
      enableGraphProximity: config.enableGraphProximity ?? true,
      vectorSimilarityWeight: config.vectorSimilarityWeight ?? 0.35,
      commonNeighborsWeight: config.commonNeighborsWeight ?? 0.25,
      inferenceWeight: config.inferenceWeight ?? 0.25,
      graphProximityWeight: config.graphProximityWeight ?? 0.15,
    };
  }

  /**
   * Suggest connections for an entity
   * Combines multiple discovery strategies with weighted scoring
   */
  async suggestConnections(entityId: string): Promise<ProactiveSuggestion[]> {
    try {
      const entity = await this.db.getEntity(entityId);
      if (!entity) {
        console.error(`[ProactiveSuggestions] Entity not found: ${entityId}`);
        return [];
      }

      const suggestions = new Map<string, ProactiveSuggestion>();

      // Strategy 1: Vector Similarity
      if (this.config.enableVectorSimilarity) {
        const vectorSuggestions = await this.findVectorSimilarities(entity);
        vectorSuggestions.forEach(s => {
          const key = s.entity_id;
          if (!suggestions.has(key)) {
            suggestions.set(key, s);
          } else {
            const existing = suggestions.get(key)!;
            existing.confidence = Math.max(existing.confidence, s.confidence * this.config.vectorSimilarityWeight);
          }
        });
      }

      // Strategy 2: Common Neighbors
      if (this.config.enableCommonNeighbors) {
        const commonNeighborSuggestions = await this.findCommonNeighbors(entityId);
        commonNeighborSuggestions.forEach(s => {
          const key = s.entity_id;
          if (!suggestions.has(key)) {
            suggestions.set(key, s);
          } else {
            const existing = suggestions.get(key)!;
            existing.confidence = Math.max(existing.confidence, s.confidence * this.config.commonNeighborsWeight);
          }
        });
      }

      // Strategy 3: Graph Proximity
      if (this.config.enableGraphProximity) {
        const graphProximitySuggestions = await this.findGraphProximity(entityId);
        graphProximitySuggestions.forEach(s => {
          const key = s.entity_id;
          if (!suggestions.has(key)) {
            suggestions.set(key, s);
          } else {
            const existing = suggestions.get(key)!;
            existing.confidence = Math.max(existing.confidence, s.confidence * this.config.graphProximityWeight);
          }
        });
      }

      // Strategy 4: Inference Engine
      if (this.config.enableInference) {
        const inferenceSuggestions = await this.findInferredRelations(entityId);
        inferenceSuggestions.forEach(s => {
          const key = s.entity_id;
          if (!suggestions.has(key)) {
            suggestions.set(key, s);
          } else {
            const existing = suggestions.get(key)!;
            existing.confidence = Math.max(existing.confidence, s.confidence * this.config.inferenceWeight);
          }
        });
      }

      // Filter by minimum confidence and sort
      const results = Array.from(suggestions.values())
        .filter(s => s.confidence >= this.config.minConfidence)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, this.config.maxSuggestions)
        .map(s => ({
          ...s,
          confidence_level: this.getConfidenceLevel(s.confidence),
        }));

      return results;
    } catch (error) {
      console.error('[ProactiveSuggestions] Error suggesting connections:', error);
      return [];
    }
  }

  /**
   * Find semantically similar entities using vector search
   */
  private async findVectorSimilarities(entity: Entity): Promise<ProactiveSuggestion[]> {
    try {
      const results = await this.db.vectorSearchEntity(entity.embedding, this.config.maxSuggestions * 2);
      
      return results
        .filter((row: any[]) => row[0] !== entity.id) // Exclude self
        .slice(0, this.config.maxSuggestions)
        .map((row: any[], index: number) => ({
          entity_id: row[0],
          entity_name: row[1],
          entity_type: row[2],
          source: SuggestionSource.VECTOR_SIMILARITY,
          confidence: Math.max(0.5, 1 - (index * 0.1)), // Decay confidence by rank
          confidence_level: ConfidenceLevel.MEDIUM,
          reason: `Semantically similar to "${entity.name}" based on vector embeddings`,
          metadata: {
            similarity_rank: index + 1,
          },
        }));
    } catch (error) {
      console.error('[ProactiveSuggestions] Error in vector similarity search:', error);
      return [];
    }
  }

  /**
   * Find entities that share common neighbors (connections)
   * Entities with many shared neighbors are likely related
   */
  private async findCommonNeighbors(entityId: string): Promise<ProactiveSuggestion[]> {
    try {
      // Get all neighbors of the entity
      const directRelations = await this.db.getRelations(entityId);
      const neighborIds = new Set(directRelations.map(r => r.to_id));

      if (neighborIds.size === 0) {
        return [];
      }

      // For each neighbor, find their other connections
      const commonNeighborCounts = new Map<string, { count: number; relationTypes: Set<string> }>();

      for (const neighborId of neighborIds) {
        const neighborRelations = await this.db.getRelations(neighborId);
        
        for (const rel of neighborRelations) {
          if (rel.to_id !== entityId && !neighborIds.has(rel.to_id)) {
            const key = rel.to_id;
            if (!commonNeighborCounts.has(key)) {
              commonNeighborCounts.set(key, { count: 0, relationTypes: new Set() });
            }
            const entry = commonNeighborCounts.get(key)!;
            entry.count++;
            entry.relationTypes.add(rel.relation_type);
          }
        }
      }

      // Convert to suggestions, sorted by common neighbor count
      const suggestions: ProactiveSuggestion[] = [];
      for (const [targetId, data] of commonNeighborCounts.entries()) {
        const targetEntity = await this.db.getEntity(targetId);
        if (targetEntity) {
          const confidence = Math.min(0.95, 0.5 + (data.count * 0.15)); // Confidence increases with shared neighbors
          suggestions.push({
            entity_id: targetId,
            entity_name: targetEntity.name,
            entity_type: targetEntity.type,
            source: SuggestionSource.COMMON_NEIGHBORS,
            confidence: confidence,
            confidence_level: ConfidenceLevel.MEDIUM,
            reason: `Shares ${data.count} common connection(s) with "${(await this.db.getEntity(entityId))?.name || 'entity'}"`,
            metadata: {
              common_neighbors_count: data.count,
              relation_types: Array.from(data.relationTypes),
            },
          });
        }
      }

      return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, this.config.maxSuggestions);
    } catch (error) {
      console.error('[ProactiveSuggestions] Error finding common neighbors:', error);
      return [];
    }
  }

  /**
   * Find entities within graph proximity (N hops away)
   * Closer entities get higher confidence scores
   */
  private async findGraphProximity(entityId: string, maxHops: number = 2): Promise<ProactiveSuggestion[]> {
    try {
      const visited = new Set<string>();
      const suggestions = new Map<string, { entity: Entity; hops: number }>();
      const queue: { id: string; hops: number }[] = [{ id: entityId, hops: 0 }];

      visited.add(entityId);

      while (queue.length > 0) {
        const { id, hops } = queue.shift()!;

        if (hops > maxHops) continue;

        const relations = await this.db.getRelations(id);
        
        for (const rel of relations) {
          if (!visited.has(rel.to_id)) {
            visited.add(rel.to_id);
            const targetEntity = await this.db.getEntity(rel.to_id);
            
            if (targetEntity && rel.to_id !== entityId) {
              const hopDistance = hops + 1;
              if (!suggestions.has(rel.to_id) || suggestions.get(rel.to_id)!.hops > hopDistance) {
                suggestions.set(rel.to_id, { entity: targetEntity, hops: hopDistance });
              }
            }

            if (hops < maxHops) {
              queue.push({ id: rel.to_id, hops: hops + 1 });
            }
          }
        }
      }

      // Convert to suggestions, with confidence inversely proportional to hops
      const results: ProactiveSuggestion[] = [];
      for (const [targetId, data] of suggestions.entries()) {
        const confidence = Math.max(0.5, 1 - (data.hops * 0.25)); // Decay by hops
        results.push({
          entity_id: targetId,
          entity_name: data.entity.name,
          entity_type: data.entity.type,
          source: SuggestionSource.GRAPH_PROXIMITY,
          confidence: confidence,
          confidence_level: ConfidenceLevel.MEDIUM,
          reason: `Located ${data.hops} hop(s) away in the knowledge graph`,
          metadata: {
            hops: data.hops,
          },
        });
      }

      return results.sort((a, b) => b.confidence - a.confidence).slice(0, this.config.maxSuggestions);
    } catch (error) {
      console.error('[ProactiveSuggestions] Error finding graph proximity:', error);
      return [];
    }
  }

  /**
   * Find inferred relationships using the inference engine
   * Applies logical rules to discover implicit connections
   */
  private async findInferredRelations(entityId: string): Promise<ProactiveSuggestion[]> {
    try {
      // Get direct relations
      const directRelations = await this.db.getRelations(entityId);
      const suggestions: ProactiveSuggestion[] = [];

      // Rule 1: Transitive relations (A -> B -> C implies A -> C)
      for (const rel of directRelations) {
        const secondHopRelations = await this.db.getRelations(rel.to_id);
        
        for (const secondRel of secondHopRelations) {
          if (secondRel.to_id !== entityId) {
            const targetEntity = await this.db.getEntity(secondRel.to_id);
            if (targetEntity) {
              suggestions.push({
                entity_id: secondRel.to_id,
                entity_name: targetEntity.name,
                entity_type: targetEntity.type,
                relation_type: `${rel.relation_type}_via_${secondRel.relation_type}`,
                source: SuggestionSource.INFERENCE,
                confidence: 0.7 * rel.strength * secondRel.strength, // Confidence based on relation strengths
                confidence_level: ConfidenceLevel.MEDIUM,
                reason: `Inferred transitive relationship: ${rel.relation_type} -> ${secondRel.relation_type}`,
                metadata: {
                  inference_type: 'transitive',
                  intermediate_entity: rel.to_id,
                  combined_strength: rel.strength * secondRel.strength,
                },
              });
            }
          }
        }
      }

      // Rule 2: Symmetric relations (if A -> B with "colleague", suggest B -> A)
      for (const rel of directRelations) {
        if (['colleague_of', 'related_to', 'similar_to', 'connected_to'].includes(rel.relation_type)) {
          const targetEntity = await this.db.getEntity(rel.to_id);
          if (targetEntity) {
            suggestions.push({
              entity_id: rel.to_id,
              entity_name: targetEntity.name,
              entity_type: targetEntity.type,
              relation_type: rel.relation_type,
              source: SuggestionSource.INFERENCE,
              confidence: 0.8 * rel.strength,
              confidence_level: ConfidenceLevel.MEDIUM,
              reason: `Inferred symmetric relationship: ${rel.relation_type} (bidirectional)`,
              metadata: {
                inference_type: 'symmetric',
                original_strength: rel.strength,
              },
            });
          }
        }
      }

      // Deduplicate and sort
      const deduped = new Map<string, ProactiveSuggestion>();
      for (const s of suggestions) {
        const key = `${s.entity_id}_${s.relation_type}`;
        if (!deduped.has(key) || deduped.get(key)!.confidence < s.confidence) {
          deduped.set(key, s);
        }
      }

      return Array.from(deduped.values())
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, this.config.maxSuggestions);
    } catch (error) {
      console.error('[ProactiveSuggestions] Error finding inferred relations:', error);
      return [];
    }
  }

  /**
   * Convert numeric confidence to confidence level
   */
  private getConfidenceLevel(confidence: number): ConfidenceLevel {
    if (confidence >= 0.75) return ConfidenceLevel.HIGH;
    if (confidence >= 0.5) return ConfidenceLevel.MEDIUM;
    return ConfidenceLevel.LOW;
  }

  /**
   * Get suggestions for multiple entities
   */
  async suggestConnectionsBatch(entityIds: string[]): Promise<Map<string, ProactiveSuggestion[]>> {
    const results = new Map<string, ProactiveSuggestion[]>();
    
    for (const entityId of entityIds) {
      results.set(entityId, await this.suggestConnections(entityId));
    }
    
    return results;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SuggestionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<SuggestionConfig> {
    return { ...this.config };
  }
}
