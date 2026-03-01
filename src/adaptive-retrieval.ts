/**
 * GraphRAG-R1 Inspired Adaptive Retrieval System
 * 
 * Based on: Yu et al., "GraphRAG-R1: Graph Retrieval-Augmented Generation 
 * with Process-Constrained Reinforcement Learning" (WWW 2026)
 * 
 * Key Innovations:
 * 1. Strategy Performance Tracking
 * 2. Progressive Retrieval Attenuation (PRA)
 * 3. Cost-Aware F1 (CAF) Scoring
 * 4. Adaptive Strategy Selection
 */

import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';

// Retrieval Strategies
export enum RetrievalStrategy {
  VECTOR_ONLY = 'vector_only',
  GRAPH_WALK = 'graph_walk',
  HYBRID_FUSION = 'hybrid_fusion',
  COMMUNITY_EXPANSION = 'community_expansion',
  SEMANTIC_WALK = 'semantic_walk'
}

// Query Complexity Classification
export enum QueryComplexity {
  SIMPLE = 'simple',           // Single-hop, factual
  MODERATE = 'moderate',       // 2-3 hops, some reasoning
  COMPLEX = 'complex',         // Multi-hop, deep reasoning
  EXPLORATORY = 'exploratory'  // Open-ended, broad search
}

interface StrategyPerformance {
  strategy: RetrievalStrategy;
  successCount: number;
  totalCount: number;
  avgF1Score: number;
  avgRetrievalCost: number;  // Number of retrieval calls
  avgLatency: number;         // ms
  lastUsed: number;           // timestamp
}

interface RetrievalResult {
  results: any[];
  strategy: RetrievalStrategy;
  retrievalCount: number;
  latency: number;
  f1Score?: number;
  cafScore?: number;  // Cost-Aware F1
}

interface AdaptiveConfig {
  enablePRA: boolean;          // Progressive Retrieval Attenuation
  enableCAF: boolean;          // Cost-Aware F1
  maxRetrievalCalls: number;
  explorationRate: number;     // Epsilon for exploration
  decayFactor: number;         // For PRA
  costPenalty: number;         // For CAF
}

export class AdaptiveGraphRetrieval {
  private db: CozoDb;
  private embeddingService: EmbeddingService;
  private strategyPerformance: Map<RetrievalStrategy, StrategyPerformance>;
  private config: AdaptiveConfig;
  
  // Performance tracking table name
  private readonly PERF_TABLE = 'adaptive_retrieval_performance';

  constructor(
    db: CozoDb,
    embeddingService: EmbeddingService,
    config?: Partial<AdaptiveConfig>
  ) {
    this.db = db;
    this.embeddingService = embeddingService;
    this.strategyPerformance = new Map();
    
    this.config = {
      enablePRA: true,
      enableCAF: true,
      maxRetrievalCalls: 5,
      explorationRate: 0.1,  // 10% exploration
      decayFactor: 0.8,       // PRA decay
      costPenalty: 0.1,       // CAF penalty per retrieval
      ...config
    };

    this.initializePerformanceTracking();
  }

  /**
   * Initialize performance tracking table in CozoDB
   */
  private async initializePerformanceTracking() {
    try {
      // Check if table exists
      const relations = await this.db.run('::relations');
      const tableExists = relations.rows.some((r: any) => r[0] === this.PERF_TABLE);

      if (!tableExists) {
        await this.db.run(`
          :create ${this.PERF_TABLE} {
            strategy: String =>
            success_count: Int,
            total_count: Int,
            avg_f1_score: Float,
            avg_retrieval_cost: Float,
            avg_latency: Float,
            last_used: Int
          }
        `);
        console.error('[AdaptiveRetrieval] Performance tracking table created');
      }

      // Load existing performance data
      await this.loadPerformanceData();
    } catch (error: any) {
      console.error('[AdaptiveRetrieval] Error initializing:', error.message);
    }
  }

  /**
   * Load performance data from database
   */
  private async loadPerformanceData() {
    try {
      const result = await this.db.run(`
        ?[strategy, success_count, total_count, avg_f1_score, avg_retrieval_cost, avg_latency, last_used] :=
          *${this.PERF_TABLE}{
            strategy,
            success_count,
            total_count,
            avg_f1_score,
            avg_retrieval_cost,
            avg_latency,
            last_used
          }
      `);

      for (const row of result.rows) {
        const [strategy, successCount, totalCount, avgF1, avgCost, avgLatency, lastUsed] = row;
        this.strategyPerformance.set(strategy as RetrievalStrategy, {
          strategy: strategy as RetrievalStrategy,
          successCount: Number(successCount),
          totalCount: Number(totalCount),
          avgF1Score: Number(avgF1),
          avgRetrievalCost: Number(avgCost),
          avgLatency: Number(avgLatency),
          lastUsed: Number(lastUsed)
        });
      }

      console.error(`[AdaptiveRetrieval] Loaded ${result.rows.length} strategy performance records`);
    } catch (error: any) {
      console.error('[AdaptiveRetrieval] Error loading performance data:', error.message);
    }
  }

  /**
   * Classify query complexity using heuristics
   * In production, this could use an LLM classifier
   */
  private classifyQueryComplexity(query: string): QueryComplexity {
    const words = query.toLowerCase().split(/\s+/);
    const questionWords = ['who', 'what', 'where', 'when', 'why', 'how'];
    const complexIndicators = ['relationship', 'connection', 'compare', 'analyze', 'explain'];
    const multiHopIndicators = ['and', 'also', 'related', 'connected', 'between'];

    // Simple: Short, single question word
    if (words.length < 8 && questionWords.some(w => words.includes(w))) {
      return QueryComplexity.SIMPLE;
    }

    // Complex: Contains complex indicators or multiple question words
    if (complexIndicators.some(ind => query.toLowerCase().includes(ind)) ||
        questionWords.filter(w => words.includes(w)).length > 1) {
      return QueryComplexity.COMPLEX;
    }

    // Exploratory: Broad, open-ended
    if (words.includes('all') || words.includes('everything') || words.includes('explore')) {
      return QueryComplexity.EXPLORATORY;
    }

    // Moderate: Multi-hop indicators
    if (multiHopIndicators.some(ind => words.includes(ind))) {
      return QueryComplexity.MODERATE;
    }

    return QueryComplexity.MODERATE;
  }

  /**
   * Select best strategy based on query complexity and historical performance
   * Implements epsilon-greedy exploration
   */
  private selectStrategy(complexity: QueryComplexity): RetrievalStrategy {
    // Exploration: Random strategy
    if (Math.random() < this.config.explorationRate) {
      const strategies = Object.values(RetrievalStrategy);
      return strategies[Math.floor(Math.random() * strategies.length)];
    }

    // Exploitation: Best strategy for complexity
    const strategyScores = new Map<RetrievalStrategy, number>();

    for (const strategy of Object.values(RetrievalStrategy)) {
      const perf = this.strategyPerformance.get(strategy);
      
      if (!perf || perf.totalCount === 0) {
        // No data: Give moderate score to encourage exploration
        strategyScores.set(strategy, 0.5);
        continue;
      }

      // Calculate score based on F1, cost, and recency
      const successRate = perf.successCount / perf.totalCount;
      const costEfficiency = 1 / (1 + perf.avgRetrievalCost);
      const recencyBonus = (Date.now() - perf.lastUsed) < 3600000 ? 0.1 : 0; // 1 hour

      let score = (successRate * 0.6) + (costEfficiency * 0.3) + recencyBonus;

      // Adjust based on query complexity
      switch (complexity) {
        case QueryComplexity.SIMPLE:
          if (strategy === RetrievalStrategy.VECTOR_ONLY) score *= 1.2;
          break;
        case QueryComplexity.MODERATE:
          if (strategy === RetrievalStrategy.HYBRID_FUSION) score *= 1.2;
          break;
        case QueryComplexity.COMPLEX:
          if (strategy === RetrievalStrategy.GRAPH_WALK || 
              strategy === RetrievalStrategy.SEMANTIC_WALK) score *= 1.2;
          break;
        case QueryComplexity.EXPLORATORY:
          if (strategy === RetrievalStrategy.COMMUNITY_EXPANSION) score *= 1.2;
          break;
      }

      strategyScores.set(strategy, score);
    }

    // Select strategy with highest score
    let bestStrategy = RetrievalStrategy.HYBRID_FUSION;
    let bestScore = 0;

    for (const [strategy, score] of strategyScores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestStrategy = strategy;
      }
    }

    return bestStrategy;
  }

  /**
   * Execute retrieval with selected strategy
   */
  private async executeStrategy(
    strategy: RetrievalStrategy,
    query: string,
    limit: number = 10
  ): Promise<RetrievalResult> {
    const startTime = Date.now();
    let results: any[] = [];
    let retrievalCount = 0;

    try {
      const queryEmbedding = await this.embeddingService.embed(query);
      retrievalCount++;

      switch (strategy) {
        case RetrievalStrategy.VECTOR_ONLY:
          results = await this.vectorSearch(queryEmbedding, limit);
          break;

        case RetrievalStrategy.GRAPH_WALK:
          results = await this.graphWalkSearch(query, queryEmbedding, limit);
          retrievalCount += 2; // Additional graph traversal
          break;

        case RetrievalStrategy.HYBRID_FUSION:
          results = await this.hybridFusionSearch(query, queryEmbedding, limit);
          retrievalCount += 3; // Vector + FTS + Graph
          break;

        case RetrievalStrategy.COMMUNITY_EXPANSION:
          results = await this.communityExpansionSearch(queryEmbedding, limit);
          retrievalCount += 2; // Vector + Community
          break;

        case RetrievalStrategy.SEMANTIC_WALK:
          results = await this.semanticWalkSearch(query, queryEmbedding, limit);
          retrievalCount += 3; // Multi-hop traversal
          break;
      }

      const latency = Date.now() - startTime;

      return {
        results,
        strategy,
        retrievalCount,
        latency
      };
    } catch (error: any) {
      console.error(`[AdaptiveRetrieval] Strategy ${strategy} failed:`, error.message);
      return {
        results: [],
        strategy,
        retrievalCount,
        latency: Date.now() - startTime
      };
    }
  }

  /**
   * Progressive Retrieval Attenuation (PRA) Reward
   * Encourages essential retrievals, penalizes excessive ones
   */
  private calculatePRAReward(retrievalCount: number): number {
    if (!this.config.enablePRA) return 1.0;

    // Reward decreases exponentially with retrieval count
    const reward = Math.pow(this.config.decayFactor, retrievalCount - 1);
    return Math.max(0.1, reward); // Minimum 0.1
  }

  /**
   * Cost-Aware F1 (CAF) Score
   * Balances answer quality with computational cost
   */
  private calculateCAFScore(f1Score: number, retrievalCount: number): number {
    if (!this.config.enableCAF) return f1Score;

    // Exponentially decaying penalty for retrieval calls
    const costPenalty = Math.exp(-this.config.costPenalty * retrievalCount);
    return f1Score * costPenalty;
  }

  /**
   * Update strategy performance based on feedback
   */
  async updateStrategyPerformance(
    strategy: RetrievalStrategy,
    f1Score: number,
    retrievalCount: number,
    latency: number,
    success: boolean
  ) {
    const perf = this.strategyPerformance.get(strategy) || {
      strategy,
      successCount: 0,
      totalCount: 0,
      avgF1Score: 0,
      avgRetrievalCost: 0,
      avgLatency: 0,
      lastUsed: Date.now()
    };

    // Update counts
    perf.totalCount++;
    if (success) perf.successCount++;

    // Update running averages
    const n = perf.totalCount;
    perf.avgF1Score = ((perf.avgF1Score * (n - 1)) + f1Score) / n;
    perf.avgRetrievalCost = ((perf.avgRetrievalCost * (n - 1)) + retrievalCount) / n;
    perf.avgLatency = ((perf.avgLatency * (n - 1)) + latency) / n;
    perf.lastUsed = Date.now();

    this.strategyPerformance.set(strategy, perf);

    // Persist to database
    try {
      await this.db.run(`
        ?[strategy, success_count, total_count, avg_f1_score, avg_retrieval_cost, avg_latency, last_used] <-
          [[$strategy, $success_count, $total_count, $avg_f1_score, $avg_retrieval_cost, $avg_latency, $last_used]]
        :put ${this.PERF_TABLE} {
          strategy => success_count, total_count, avg_f1_score, avg_retrieval_cost, avg_latency, last_used
        }
      `, {
        strategy,
        success_count: perf.successCount,
        total_count: perf.totalCount,
        avg_f1_score: perf.avgF1Score,
        avg_retrieval_cost: perf.avgRetrievalCost,
        avg_latency: perf.avgLatency,
        last_used: perf.lastUsed
      });
    } catch (error: any) {
      console.error('[AdaptiveRetrieval] Error persisting performance:', error.message);
    }
  }

  /**
   * Main adaptive retrieval method
   */
  async retrieve(query: string, limit: number = 10): Promise<RetrievalResult> {
    // 1. Classify query complexity
    const complexity = this.classifyQueryComplexity(query);
    console.error(`[AdaptiveRetrieval] Query complexity: ${complexity}`);

    // 2. Select best strategy
    const strategy = this.selectStrategy(complexity);
    console.error(`[AdaptiveRetrieval] Selected strategy: ${strategy}`);

    // 3. Execute strategy
    const result = await this.executeStrategy(strategy, query, limit);

    // 4. Calculate rewards
    const praReward = this.calculatePRAReward(result.retrievalCount);
    result.cafScore = this.calculateCAFScore(result.f1Score || 0.5, result.retrievalCount);

    console.error(`[AdaptiveRetrieval] PRA Reward: ${praReward.toFixed(3)}, CAF Score: ${result.cafScore.toFixed(3)}`);

    return result;
  }

  // ==================== Strategy Implementations ====================

  private async vectorSearch(embedding: number[], limit: number): Promise<any[]> {
    const result = await this.db.run(`
      ?[id, name, type, score] :=
        ~entity:semantic{id | query: vec($embedding), k: $limit, ef: 100, bind_distance: dist},
        *entity{id, name, type, @ "NOW"},
        score = 1.0 - dist
      :order -score
    `, { embedding, limit });

    return result.rows.map((r: any) => ({
      id: r[0],
      name: r[1],
      type: r[2],
      score: r[3]
    }));
  }

  private async graphWalkSearch(query: string, embedding: number[], limit: number): Promise<any[]> {
    // Simplified graph walk - find seeds then expand
    const seeds = await this.vectorSearch(embedding, 3);
    
    if (seeds.length === 0) return [];

    const seedIds = seeds.map(s => s.id);
    
    const result = await this.db.run(`
      seeds[id] <- $seeds
      
      # 1-hop expansion
      neighbors[id] :=
        seeds[seed_id],
        *relationship{from_id: seed_id, to_id: id, @ "NOW"}
      
      neighbors[id] :=
        seeds[seed_id],
        *relationship{from_id: id, to_id: seed_id, @ "NOW"}
      
      # Get entity details
      ?[id, name, type, score] :=
        neighbors[id],
        *entity{id, name, type, @ "NOW"},
        score = 0.8
      
      :limit $limit
    `, { seeds: seedIds.map(id => [id]), limit });

    return result.rows.map((r: any) => ({
      id: r[0],
      name: r[1],
      type: r[2],
      score: r[3]
    }));
  }

  private async hybridFusionSearch(query: string, embedding: number[], limit: number): Promise<any[]> {
    // Simplified hybrid - combine vector + FTS
    const [vectorResults, ftsResults] = await Promise.all([
      this.vectorSearch(embedding, limit),
      this.ftsSearch(query, limit)
    ]);

    // Simple RRF fusion
    const scoreMap = new Map<string, number>();
    
    vectorResults.forEach((r, idx) => {
      scoreMap.set(r.id, (scoreMap.get(r.id) || 0) + (1 / (idx + 1)));
    });
    
    ftsResults.forEach((r, idx) => {
      scoreMap.set(r.id, (scoreMap.get(r.id) || 0) + (1 / (idx + 1)));
    });

    const allResults = [...vectorResults, ...ftsResults];
    const uniqueResults = Array.from(new Map(allResults.map(r => [r.id, r])).values());

    return uniqueResults
      .map(r => ({ ...r, score: scoreMap.get(r.id) || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async ftsSearch(query: string, limit: number): Promise<any[]> {
    try {
      const result = await this.db.run(`
        ?[id, name, type, score] :=
          ~entity:fts{id | query: $query, k: $limit, score_kind: 'tf_idf', bind_score: score},
          *entity{id, name, type, @ "NOW"}
        :order -score
      `, { query, limit });

      return result.rows.map((r: any) => ({
        id: r[0],
        name: r[1],
        type: r[2],
        score: r[3]
      }));
    } catch (error) {
      return [];
    }
  }

  private async communityExpansionSearch(embedding: number[], limit: number): Promise<any[]> {
    // Find seeds, get their communities, expand
    const seeds = await this.vectorSearch(embedding, 2);
    
    if (seeds.length === 0) return [];

    const result = await this.db.run(`
      seeds[id] <- $seeds
      
      # Get communities of seeds
      communities[comm_id] :=
        seeds[seed_id],
        *entity_community{entity_id: seed_id, community_id: comm_id}
      
      # Get all entities in those communities
      ?[id, name, type, score] :=
        communities[comm_id],
        *entity_community{entity_id: id, community_id: comm_id},
        *entity{id, name, type, @ "NOW"},
        score = 0.7
      
      :limit $limit
    `, { seeds: seeds.map(s => [s.id]), limit });

    return result.rows.map((r: any) => ({
      id: r[0],
      name: r[1],
      type: r[2],
      score: r[3]
    }));
  }

  private async semanticWalkSearch(query: string, embedding: number[], limit: number): Promise<any[]> {
    // Multi-hop semantic walk
    const seeds = await this.vectorSearch(embedding, 2);
    
    if (seeds.length === 0) return [];

    const result = await this.db.run(`
      seeds[id, score] <- $seeds
      
      # 2-hop walk with semantic filtering
      path[id, hop, path_score] :=
        seeds[id, score],
        hop = 0,
        path_score = score
      
      path[next_id, hop_new, path_score_new] :=
        path[current_id, hop, path_score],
        *relationship{from_id: current_id, to_id: next_id, @ "NOW"},
        hop < 2,
        hop_new = hop + 1,
        ~entity:semantic{id: next_id | query: vec($embedding), k: 100, ef: 100, bind_distance: dist},
        sim = 1.0 - dist,
        sim > 0.5,
        path_score_new = path_score * sim * 0.8
      
      ?[id, name, type, max_score] :=
        path[id, _, score],
        *entity{id, name, type, @ "NOW"},
        max_score = max(score)
      
      :order -max_score
      :limit $limit
    `, { 
      seeds: seeds.map(s => [s.id, s.score]),
      embedding,
      limit 
    });

    return result.rows.map((r: any) => ({
      id: r[0],
      name: r[1],
      type: r[2],
      score: r[3]
    }));
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): Map<RetrievalStrategy, StrategyPerformance> {
    return new Map(this.strategyPerformance);
  }

  /**
   * Reset performance tracking (for testing)
   */
  async resetPerformance() {
    this.strategyPerformance.clear();
    try {
      await this.db.run(`:rm ${this.PERF_TABLE} {}`);
      console.error('[AdaptiveRetrieval] Performance data reset');
    } catch (error: any) {
      console.error('[AdaptiveRetrieval] Error resetting performance:', error.message);
    }
  }
}
