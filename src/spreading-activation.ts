import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';

/**
 * SYNAPSE - Spreading Activation with Lateral Inhibition
 * 
 * Based on: "Empowering LLM Agents with Episodic-Semantic Memory via Spreading Activation"
 * arXiv 2601.02744 (January 2026)
 * 
 * Implements cognitive dynamics where relevance emerges from activation propagation
 * rather than pre-computed links. Combines:
 * - Spreading Activation (Collins & Loftus, 1975)
 * - Lateral Inhibition (biological attention mechanism)
 * - Fan Effect (ACT-R, Anderson 1983)
 * - Temporal Decay
 */

export interface SpreadingActivationConfig {
  spreadingFactor: number;        // S - How much activation spreads (default: 0.8)
  decayFactor: number;             // δ - Node retention rate (default: 0.5)
  temporalDecay: number;           // ρ - Time decay rate (default: 0.01)
  inhibitionBeta: number;          // β - Lateral inhibition strength (default: 0.15)
  inhibitionTopM: number;          // M - Number of top nodes for inhibition (default: 7)
  propagationSteps: number;        // T - Number of propagation iterations (default: 3)
  activationThreshold: number;     // Minimum activation to consider (default: 0.01)
  sigmoidGamma: number;            // γ - Sigmoid steepness (default: 5.0)
  sigmoidTheta: number;            // θ - Sigmoid threshold (default: 0.5)
}

export interface ActivationScore {
  entityId: string;
  activation: number;              // Final activation level (0-1)
  potential: number;               // Raw potential before sigmoid
  source: 'seed' | 'propagated';   // How this node was activated
  hops: number;                    // Distance from seed nodes
}

export interface SpreadingActivationResult {
  scores: ActivationScore[];
  iterations: number;
  converged: boolean;
  seedNodes: string[];
}

export class SpreadingActivationService {
  private db: CozoDb;
  private embeddings: EmbeddingService;
  private config: SpreadingActivationConfig;

  constructor(
    db: CozoDb,
    embeddings: EmbeddingService,
    config: Partial<SpreadingActivationConfig> = {}
  ) {
    this.db = db;
    this.embeddings = embeddings;
    this.config = {
      spreadingFactor: config.spreadingFactor ?? 0.8,
      decayFactor: config.decayFactor ?? 0.5,
      temporalDecay: config.temporalDecay ?? 0.01,
      inhibitionBeta: config.inhibitionBeta ?? 0.15,
      inhibitionTopM: config.inhibitionTopM ?? 7,
      propagationSteps: config.propagationSteps ?? 3,
      activationThreshold: config.activationThreshold ?? 0.01,
      sigmoidGamma: config.sigmoidGamma ?? 5.0,
      sigmoidTheta: config.sigmoidTheta ?? 0.5,
    };
  }

  /**
   * Perform spreading activation from seed nodes
   */
  async spreadActivation(
    query: string,
    seedTopK: number = 5
  ): Promise<SpreadingActivationResult> {
    try {
      // Step 1: Initialize - Find seed nodes via dual trigger (BM25 + Semantic)
      const queryEmbedding = await this.embeddings.embed(query);
      const seedNodes = await this.findSeedNodes(query, queryEmbedding, seedTopK);

      if (seedNodes.length === 0) {
        console.error('[SpreadingActivation] No seed nodes found');
        return {
          scores: [],
          iterations: 0,
          converged: false,
          seedNodes: [],
        };
      }

      // Step 2: Initialize activation vector
      let activation = new Map<string, number>();
      for (const seed of seedNodes) {
        activation.set(seed.id, seed.score);
      }

      // Step 3: Propagate activation for T steps
      let converged = false;
      let iteration = 0;

      for (iteration = 0; iteration < this.config.propagationSteps; iteration++) {
        const newActivation = await this.propagateStep(activation);
        
        // Check convergence (activation change < threshold)
        const maxChange = this.calculateMaxChange(activation, newActivation);
        if (maxChange < 0.001) {
          converged = true;
          break;
        }

        activation = newActivation;
      }

      // Step 4: Convert to result format
      const scores: ActivationScore[] = [];
      for (const [entityId, act] of activation.entries()) {
        if (act >= this.config.activationThreshold) {
          const isSeed = seedNodes.some(s => s.id === entityId);
          scores.push({
            entityId,
            activation: act,
            potential: act, // After sigmoid, potential ≈ activation
            source: isSeed ? 'seed' : 'propagated',
            hops: isSeed ? 0 : iteration,
          });
        }
      }

      // Sort by activation (highest first)
      scores.sort((a, b) => b.activation - a.activation);

      return {
        scores,
        iterations: iteration + 1,
        converged,
        seedNodes: seedNodes.map(s => s.id),
      };
    } catch (error) {
      console.error('[SpreadingActivation] Error in spreadActivation:', error);
      return {
        scores: [],
        iterations: 0,
        converged: false,
        seedNodes: [],
      };
    }
  }

  /**
   * Find seed nodes using dual trigger: BM25 (lexical) + Semantic (dense)
   */
  private async findSeedNodes(
    query: string,
    queryEmbedding: number[],
    topK: number
  ): Promise<Array<{ id: string; score: number }>> {
    try {
      // Get all entities
      const allEntities = await this.db.run(`
        ?[id, name, embedding] :=
          *entity{id, name, embedding}
      `);

      const scores = new Map<string, number>();

      // Calculate semantic similarity for each entity
      for (const row of allEntities.rows) {
        const [id, name, embedding] = row;
        const entityEmbedding = embedding as number[];
        
        // Lexical score: simple keyword matching
        const nameLower = (name as string).toLowerCase();
        const queryLower = query.toLowerCase();
        const lexicalScore = nameLower.includes(queryLower) || queryLower.includes(nameLower) ? 1.0 : 0.0;
        
        // Semantic score: cosine similarity
        const semanticScore = this.cosineSimilarity(queryEmbedding, entityEmbedding);
        
        // Combine scores (max of lexical and semantic)
        const combinedScore = Math.max(lexicalScore, semanticScore);
        scores.set(id as string, combinedScore);
      }

      // Sort and return top-K
      return Array.from(scores.entries())
        .map(([id, score]) => ({ id, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    } catch (error) {
      console.error('[SpreadingActivation] Error finding seed nodes:', error);
      return [];
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
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
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Single propagation step with Fan Effect, Lateral Inhibition, and Sigmoid
   */
  private async propagateStep(
    currentActivation: Map<string, number>
  ): Promise<Map<string, number>> {
    try {
      const now = Date.now();
      const newPotential = new Map<string, number>();

      // Step 1: Propagation with Fan Effect
      // For each active node, spread activation to neighbors
      for (const [nodeId, activation] of currentActivation.entries()) {
        if (activation < this.config.activationThreshold) continue;

        // Get outgoing relationships
        const relationships = await this.db.run(`
          ?[from_id, to_id, strength, created_at] :=
            *relationship{from_id, to_id, strength, created_at},
            from_id == $node_id
        `, { node_id: nodeId });

        // Calculate fan (out-degree)
        const fan = Math.max(1, relationships.rows.length);

        // Propagate to each neighbor
        for (const row of relationships.rows) {
          const [, toId, strength, createdAt] = row;
          const targetId = toId as string;

          // Calculate edge weight with temporal decay
          const timeDiff = (now - (createdAt as number)) / (1000 * 60 * 60 * 24); // days
          const temporalWeight = Math.exp(-this.config.temporalDecay * timeDiff);
          const edgeWeight = (strength as number) * temporalWeight;

          // Spread activation with fan effect
          const spreadAmount = (this.config.spreadingFactor * edgeWeight * activation) / fan;

          // Accumulate potential
          const currentPotential = newPotential.get(targetId) || 0;
          newPotential.set(targetId, currentPotential + spreadAmount);
        }

        // Node decay: retain some of current activation
        const retainedActivation = (1 - this.config.decayFactor) * activation;
        const currentPotential = newPotential.get(nodeId) || 0;
        newPotential.set(nodeId, currentPotential + retainedActivation);
      }

      // Step 2: Lateral Inhibition
      // Top-M nodes inhibit weaker competitors
      const potentialArray = Array.from(newPotential.entries())
        .sort((a, b) => b[1] - a[1]);
      
      const topM = potentialArray.slice(0, this.config.inhibitionTopM);
      const inhibitedPotential = new Map<string, number>();

      for (const [nodeId, potential] of newPotential.entries()) {
        let inhibition = 0;

        // Calculate inhibition from top-M nodes
        for (const [topId, topPotential] of topM) {
          if (topId !== nodeId && topPotential > potential) {
            inhibition += this.config.inhibitionBeta * (topPotential - potential);
          }
        }

        // Apply inhibition (cannot go below 0)
        const inhibitedValue = Math.max(0, potential - inhibition);
        inhibitedPotential.set(nodeId, inhibitedValue);
      }

      // Step 3: Sigmoid Activation Function
      const newActivation = new Map<string, number>();
      for (const [nodeId, potential] of inhibitedPotential.entries()) {
        const activation = this.sigmoid(potential);
        if (activation >= this.config.activationThreshold) {
          newActivation.set(nodeId, activation);
        }
      }

      return newActivation;
    } catch (error) {
      console.error('[SpreadingActivation] Error in propagateStep:', error);
      return currentActivation;
    }
  }

  /**
   * Sigmoid activation function: σ(u) = 1 / (1 + exp(-γ(u - θ)))
   */
  private sigmoid(potential: number): number {
    const exponent = -this.config.sigmoidGamma * (potential - this.config.sigmoidTheta);
    return 1 / (1 + Math.exp(exponent));
  }

  /**
   * Calculate maximum activation change between iterations
   */
  private calculateMaxChange(
    oldActivation: Map<string, number>,
    newActivation: Map<string, number>
  ): number {
    let maxChange = 0;

    // Check all nodes in both maps
    const allNodes = new Set([...oldActivation.keys(), ...newActivation.keys()]);

    for (const nodeId of allNodes) {
      const oldValue = oldActivation.get(nodeId) || 0;
      const newValue = newActivation.get(nodeId) || 0;
      const change = Math.abs(newValue - oldValue);
      maxChange = Math.max(maxChange, change);
    }

    return maxChange;
  }

  /**
   * Triple Hybrid Retrieval: Semantic + Activation + PageRank
   */
  async tripleHybridRetrieval(
    query: string,
    options: {
      topK?: number;
      lambdaSemantic?: number;
      lambdaActivation?: number;
      lambdaStructural?: number;
      seedTopK?: number;
    } = {}
  ): Promise<Array<{ entityId: string; score: number; breakdown: any }>> {
    try {
      const {
        topK = 30,
        lambdaSemantic = 0.5,
        lambdaActivation = 0.3,
        lambdaStructural = 0.2,
        seedTopK = 5,
      } = options;

      // 1. Semantic similarity
      const queryEmbedding = await this.embeddings.embed(query);
      const allEntities = await this.db.run(`
        ?[id, embedding] :=
          *entity{id, embedding}
      `);

      const semanticScores = new Map<string, number>();
      for (const row of allEntities.rows) {
        const [id, embedding] = row;
        const score = this.cosineSimilarity(queryEmbedding, embedding as number[]);
        semanticScores.set(id as string, score);
      }

      // 2. Spreading activation
      const activationResult = await this.spreadActivation(query, seedTopK);
      const activationScores = new Map<string, number>();
      for (const score of activationResult.scores) {
        activationScores.set(score.entityId, score.activation);
      }

      // 3. PageRank (structural importance)
      const pageRankResults = await this.db.run(`
        ?[id, rank] :=
          *entity_rank{entity_id: id, rank}
      `);

      const pageRankScores = new Map<string, number>();
      for (const row of pageRankResults.rows) {
        const [id, rank] = row;
        pageRankScores.set(id as string, rank as number);
      }

      // 4. Combine scores
      const allEntityIds = new Set([
        ...semanticScores.keys(),
        ...activationScores.keys(),
        ...pageRankScores.keys(),
      ]);

      const results: Array<{ entityId: string; score: number; breakdown: any }> = [];

      for (const entityId of allEntityIds) {
        const semantic = semanticScores.get(entityId) || 0;
        const activation = activationScores.get(entityId) || 0;
        const structural = pageRankScores.get(entityId) || 0;

        const combinedScore =
          lambdaSemantic * semantic +
          lambdaActivation * activation +
          lambdaStructural * structural;

        results.push({
          entityId,
          score: combinedScore,
          breakdown: {
            semantic,
            activation,
            structural,
            formula: `${lambdaSemantic}×${semantic.toFixed(3)} + ${lambdaActivation}×${activation.toFixed(3)} + ${lambdaStructural}×${structural.toFixed(3)}`,
          },
        });
      }

      // Sort by combined score and return top-K
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, topK);
    } catch (error) {
      console.error('[SpreadingActivation] Error in tripleHybridRetrieval:', error);
      return [];
    }
  }
}
