/**
 * Query-Aware Flow Diffusion for Graph Traversal
 * 
 * Based on QAFD-RAG (ICLR 2026):
 * - Dynamically weights edges based on query-node semantic alignment
 * - Uses flow diffusion similar to Personalized PageRank
 * - Provides statistical guarantees for subgraph retrieval
 * - Training-free approach using cosine similarity
 * 
 * Reference: "Query-Aware Flow Diffusion for Graph-Based RAG with Retrieval Guarantees"
 */

import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';

export interface QueryAwareTraversalOptions {
  maxHops?: number;           // Maximum traversal depth (default: 3)
  dampingFactor?: number;     // Flow damping factor α (default: 0.85)
  minScore?: number;          // Minimum score threshold (default: 0.1)
  topK?: number;              // Number of results to return (default: 20)
  relationTypes?: string[];   // Filter by relationship types
  convergenceThreshold?: number; // Convergence threshold for iterative diffusion (default: 0.001)
}

export interface QueryAwareResult {
  id: string;
  entity_id: string;
  name: string;
  type: string;
  score: number;              // Flow diffusion score
  hops: number;               // Distance from start entity
  path_score: number;         // Accumulated path score
  metadata: any;
  source: string;
}

/**
 * Query-Aware Graph Traversal Service
 * 
 * Implements flow diffusion with dynamic edge weighting based on query semantics.
 */
export class QueryAwareTraversal {
  constructor(
    private db: CozoDb,
    private embeddingService: EmbeddingService
  ) {}

  /**
   * Performs query-aware graph traversal from a start entity
   * 
   * @param startEntityId - Starting entity ID
   * @param query - Query string for semantic alignment
   * @param options - Traversal options
   * @returns Array of query-aware results
   */
  async traverse(
    startEntityId: string,
    query: string,
    options: QueryAwareTraversalOptions = {}
  ): Promise<QueryAwareResult[]> {
    const {
      maxHops = 3,
      dampingFactor = 0.85,
      minScore = 0.1,
      topK = 20,
      relationTypes,
      convergenceThreshold = 0.001
    } = options;

    console.log('[QueryAwareTraversal] Starting traversal:', {
      startEntityId,
      query,
      maxHops,
      dampingFactor
    });

    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingService.embed(query);

      // Build relation type filter
      const relationFilter = relationTypes && relationTypes.length > 0
        ? `is_in(relation_type, [${relationTypes.map(t => `"${t}"`).join(', ')}])`
        : 'true';

      // Query-Aware Flow Diffusion using Datalog
      // This implements a simplified version of QAFD-RAG's flow diffusion
      const datalogQuery = `
        # Initialize: Start entity has score 1.0
        flow[entity_id, hop, score] := 
          entity_id = $start_id,
          hop = 0,
          score = 1.0

        # Compute edge weights based on query-node semantic alignment
        # weight = cosine_similarity(node_embedding, query_embedding)
        edge_weight[from_id, to_id, weight, relation_type] := 
          *relationship{
            from_id,
            to_id,
            relation_type,
            @ "NOW"
          },
          ${relationFilter},
          *entity{
            id: to_id,
            embedding: to_emb,
            @ "NOW"
          },
          # Cosine similarity between query and target node
          similarity = cos_dist(to_emb, vec($query_emb)),
          # Convert distance to similarity (1 - distance)
          weight = 1.0 - similarity,
          # Ensure positive weights
          weight > 0.0

        # Flow diffusion: propagate flow through weighted edges
        # score_new = damping_factor * score_current * edge_weight
        flow[to_id, hop_new, score_new] := 
          flow[from_id, hop, score],
          hop < $max_hops,
          edge_weight[from_id, to_id, weight, _],
          hop_new = hop + 1,
          # Flow diffusion formula
          score_new = $damping * score * weight,
          score_new >= $min_score

        # Join with entity data and aggregate scores
        # Variables without aggregation (id, name, type, metadata) are grouping keys
        ?[id, name, type, sum(flow_score), min(hop), metadata] := 
          flow[id, hop, flow_score],
          *entity{
            id,
            name,
            type,
            metadata,
            @ "NOW"
          }

        :order -sum(flow_score)
        :limit $top_k
      `;

      const result = await this.db.run(datalogQuery, {
        start_id: startEntityId,
        query_emb: queryEmbedding,
        max_hops: maxHops,
        damping: dampingFactor,
        min_score: minScore,
        top_k: topK
      });

      const results: QueryAwareResult[] = result.rows.map((row: any) => ({
        id: row[0],
        entity_id: row[0],
        name: row[1],
        type: row[2],
        score: row[3],
        hops: row[4],
        path_score: row[3],
        metadata: row[5],
        source: 'query_aware_traversal'
      }));

      console.log('[QueryAwareTraversal] Traversal completed:', {
        resultsCount: results.length,
        topScore: results[0]?.score || 0
      });

      return results;

    } catch (error) {
      console.error('[QueryAwareTraversal] Error during traversal:', error);
      throw error;
    }
  }

  /**
   * Performs query-aware traversal from multiple seed entities
   * 
   * This is useful for starting from vector search results and expanding
   * the graph in a query-aware manner.
   * 
   * @param seedEntityIds - Array of starting entity IDs
   * @param query - Query string for semantic alignment
   * @param options - Traversal options
   * @returns Array of query-aware results
   */
  async traverseFromSeeds(
    seedEntityIds: string[],
    query: string,
    options: QueryAwareTraversalOptions = {}
  ): Promise<QueryAwareResult[]> {
    const {
      maxHops = 3,
      dampingFactor = 0.85,
      minScore = 0.1,
      topK = 20,
      relationTypes,
      convergenceThreshold = 0.001
    } = options;

    console.log('[QueryAwareTraversal] Starting multi-seed traversal:', {
      seedCount: seedEntityIds.length,
      query,
      maxHops
    });

    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingService.embed(query);

      // Build relation type filter
      const relationFilter = relationTypes && relationTypes.length > 0
        ? `is_in(relation_type, [${relationTypes.map(t => `"${t}"`).join(', ')}])`
        : 'true';

      // Build seed list for Datalog
      const seedList = seedEntityIds.map(id => `"${id}"`).join(', ');

      const datalogQuery = `
        # Initialize: All seed entities start with equal score
        seeds[entity_id] := entity_id in [${seedList}]
        
        flow[entity_id, hop, score] := 
          seeds[entity_id],
          hop = 0,
          score = 1.0 / to_float(${seedEntityIds.length})

        # Compute query-aware edge weights
        edge_weight[from_id, to_id, weight, relation_type] := 
          *relationship{
            from_id,
            to_id,
            relation_type,
            @ "NOW"
          },
          ${relationFilter},
          *entity{
            id: to_id,
            embedding: to_emb,
            @ "NOW"
          },
          similarity = cos_dist(to_emb, vec($query_emb)),
          weight = 1.0 - similarity,
          weight > 0.0

        # Flow diffusion with query-aware weighting
        flow[to_id, hop_new, score_new] := 
          flow[from_id, hop, score],
          hop < $max_hops,
          edge_weight[from_id, to_id, weight, _],
          hop_new = hop + 1,
          score_new = $damping * score * weight,
          score_new >= $min_score

        # Join with entity data and aggregate scores
        ?[id, name, type, sum(flow_score), min(hop), metadata] := 
          flow[id, hop, flow_score],
          *entity{
            id,
            name,
            type,
            metadata,
            @ "NOW"
          }

        :order -sum(flow_score)
        :limit $top_k
      `;

      const result = await this.db.run(datalogQuery, {
        query_emb: queryEmbedding,
        max_hops: maxHops,
        damping: dampingFactor,
        min_score: minScore,
        top_k: topK
      });

      const results: QueryAwareResult[] = result.rows.map((row: any) => ({
        id: row[0],
        entity_id: row[0],
        name: row[1],
        type: row[2],
        score: row[3],
        hops: row[4],
        path_score: row[3],
        metadata: row[5],
        source: 'query_aware_multi_seed'
      }));

      console.log('[QueryAwareTraversal] Multi-seed traversal completed:', {
        resultsCount: results.length,
        topScore: results[0]?.score || 0
      });

      return results;

    } catch (error) {
      console.error('[QueryAwareTraversal] Error during multi-seed traversal:', error);
      throw error;
    }
  }

  /**
   * Hybrid approach: Vector search + Query-Aware Traversal
   * 
   * This combines the best of both worlds:
   * 1. Find semantically relevant seed entities via vector search
   * 2. Expand from seeds using query-aware graph traversal
   * 
   * @param query - Query string
   * @param options - Traversal options with additional vector search params
   * @returns Array of query-aware results
   */
  async hybridSearch(
    query: string,
    options: QueryAwareTraversalOptions & { seedTopK?: number } = {}
  ): Promise<QueryAwareResult[]> {
    const { seedTopK = 5, ...traversalOptions } = options;

    console.log('[QueryAwareTraversal] Starting hybrid search:', {
      query,
      seedTopK
    });

    try {
      // Step 1: Vector search to find seed entities
      const queryEmbedding = await this.embeddingService.embed(query);

      const seedQuery = `
        ?[id] := 
          ~entity:semantic{
            id | 
            query: vec($embedding), 
            k: $seed_k,
            ef: 100
          }
      `;

      const seedResult = await this.db.run(seedQuery, {
        embedding: queryEmbedding,
        seed_k: seedTopK
      });

      if (seedResult.rows.length === 0) {
        console.log('[QueryAwareTraversal] No seed entities found');
        return [];
      }

      const seedIds = seedResult.rows.map((row: any) => row[0]);

      console.log('[QueryAwareTraversal] Found seed entities:', seedIds.length);

      // Step 2: Query-aware traversal from seeds
      return await this.traverseFromSeeds(seedIds, query, traversalOptions);

    } catch (error) {
      console.error('[QueryAwareTraversal] Error during hybrid search:', error);
      throw error;
    }
  }
}
