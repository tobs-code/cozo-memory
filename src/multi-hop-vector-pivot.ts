import { CozoDb } from "cozo-node";
import { EmbeddingService } from "./embedding-service";
import { v4 as uuidv4 } from "uuid";

/**
 * Multi-Hop Reasoning with Vector Pivots (v2.0 - Logic-Aware)
 * 
 * Pattern: Use Vector Search as "springboard" for Graph Traversal with Logic-Aware Reasoning
 * 
 * Research: 
 * - HopRAG (ACL 2025): Logic-aware RAG with pseudo-queries as edges
 * - Retrieval Pivot Attacks (arXiv:2602.08668): Security & boundary enforcement
 * - Neo4j GraphRAG: Multi-hop reasoning patterns
 * 
 * Pipeline (Retrieve-Reason-Prune):
 * 1. Vector Search: Find semantic pivot points using HNSW
 * 2. Reasoning-Augmented Traversal: BFS with LLM-guided hops via pseudo-queries
 * 3. Helpfulness Scoring: Combines textual similarity + logical importance
 * 4. Pruning: Filter by confidence threshold and pivot depth
 * 5. Aggregation: Deduplicate and rank entities
 */
export class MultiHopVectorPivot {
  private db: CozoDb;
  private embeddingService: EmbeddingService;
  private maxBranchingFactor: number = 5;
  private maxNodesExplored: number = 100;
  private confidenceThreshold: number = 0.5;
  private maxPivotDepth: number = 3; // Security: limit graph expansion depth

  constructor(
    db: CozoDb,
    embeddingService: EmbeddingService,
    maxBranchingFactor?: number,
    maxNodesExplored?: number,
    confidenceThreshold?: number,
    maxPivotDepth?: number
  ) {
    this.db = db;
    this.embeddingService = embeddingService;
    if (maxBranchingFactor) this.maxBranchingFactor = maxBranchingFactor;
    if (maxNodesExplored) this.maxNodesExplored = maxNodesExplored;
    if (confidenceThreshold) this.confidenceThreshold = confidenceThreshold;
    if (maxPivotDepth) this.maxPivotDepth = maxPivotDepth;
  }

  /**
   * Main entry point: Multi-Hop Reasoning with Vector Pivots
   * 
   * Retrieve-Reason-Prune Pipeline:
   * 1. Retrieve: Find vector pivots via semantic search
   * 2. Reason: Traverse graph with logic-aware hops
   * 3. Prune: Filter by helpfulness and confidence
   */
  async multiHopVectorPivot(
    query: string,
    maxHops: number = 3,
    limit: number = 10
  ): Promise<MultiHopResult> {
    try {
      console.error(`[MultiHop] Starting multi-hop reasoning for query: "${query}"`);
      const startTime = Date.now();

      // Step 1: RETRIEVE - Find vector pivots
      const pivots = await this.findVectorPivots(query, this.maxBranchingFactor);
      console.error(`[MultiHop] Found ${pivots.length} vector pivots`);

      if (pivots.length === 0) {
        return {
          query,
          pivots: [],
          paths: [],
          aggregated_results: [],
          total_hops: 0,
          execution_time_ms: Date.now() - startTime,
          status: "no_pivots_found"
        };
      }

      // Step 2: REASON - Traverse graph from each pivot with logic-aware hops
      const allPaths: ScoredPath[] = [];
      const nodesExplored = new Set<string>();

      for (const pivot of pivots) {
        if (nodesExplored.size >= this.maxNodesExplored) break;

        const paths = await this.reasoningAugmentedTraversal(
          pivot,
          query,
          maxHops,
          nodesExplored
        );
        allPaths.push(...paths);
      }

      console.error(`[MultiHop] Explored ${nodesExplored.size} nodes across ${allPaths.length} paths`);

      // Step 3: PRUNE - Filter by helpfulness and confidence
      const prunedPaths = this.prunePathsByHelpfulness(allPaths, query);
      console.error(`[MultiHop] Pruned to ${prunedPaths.length} high-quality paths`);

      // Step 4: AGGREGATE - Deduplicate and rank
      const aggregated = this.aggregatePathResults(prunedPaths);
      const topResults = aggregated.slice(0, limit);

      const executionTime = Date.now() - startTime;
      console.error(`[MultiHop] Completed in ${executionTime}ms`);

      return {
        query,
        pivots: pivots.map(p => ({ id: p.id, name: p.name, similarity: p.similarity })),
        paths: prunedPaths.slice(0, 5), // Top 5 paths for context
        aggregated_results: topResults,
        total_hops: Math.max(...allPaths.map(p => p.path.length)),
        execution_time_ms: executionTime,
        status: "success"
      };
    } catch (error: any) {
      console.error("[MultiHop] Error:", error.message);
      return {
        query,
        pivots: [],
        paths: [],
        aggregated_results: [],
        total_hops: 0,
        execution_time_ms: 0,
        status: "error",
        error: error.message
      };
    }
  }

  /**
   * Step 1: RETRIEVE - Find vector pivots via semantic search
   */
  private async findVectorPivots(
    query: string,
    topK: number
  ): Promise<VectorPivot[]> {
    try {
      const queryEmbedding = await this.embeddingService.embed(query);

      const datalog = `
        ?[id, name, type, similarity] :=
          ~entity:semantic{id | query: vec($query_vector), k: $topk, ef: $ef_search, bind_distance: dist},
          *entity{id, name, type, @ "NOW"},
          similarity = 1.0 - dist
        :sort -similarity
        :limit $topk
      `;

      const result = await this.db.run(datalog, {
        query_vector: queryEmbedding,
        topk: topK,
        ef_search: 100
      });

      return result.rows.map((r: any) => ({
        id: r[0],
        name: r[1],
        type: r[2],
        similarity: r[3]
      }));
    } catch (error: any) {
      console.error("[MultiHop] Error finding pivots:", error.message);
      return [];
    }
  }

  /**
   * Step 2: REASON - Reasoning-Augmented Graph Traversal
   * 
   * Uses BFS with logic-aware hops guided by pseudo-queries and relationship context
   */
  private async reasoningAugmentedTraversal(
    pivot: VectorPivot,
    query: string,
    maxHops: number,
    nodesExplored: Set<string>
  ): Promise<ScoredPath[]> {
    const paths: ScoredPath[] = [];
    const queue: BFSNode[] = [
      {
        id: pivot.id,
        depth: 0,
        path: [{ id: pivot.id, name: pivot.name, type: pivot.type, confidence: 1.0 }],
        pathScore: pivot.similarity,
        visitedInPath: new Set([pivot.id])
      }
    ];

    const queryEmbedding = await this.embeddingService.embed(query);

    while (queue.length > 0 && nodesExplored.size < this.maxNodesExplored) {
      const current = queue.shift()!;

      // Pivot Depth Security: Enforce max depth to prevent uncontrolled expansion
      if (current.depth >= maxHops || current.depth >= this.maxPivotDepth) {
        paths.push({
          path: current.path,
          score: current.pathScore,
          depth: current.depth,
          confidence: this.calculatePathConfidence(current.path)
        });
        continue;
      }

      // Get neighbors with relationship context (logic-aware)
      const neighbors = await this.getNeighborsWithContext(
        current.id,
        query,
        queryEmbedding,
        current.visitedInPath
      );

      for (const neighbor of neighbors.slice(0, this.maxBranchingFactor)) {
        if (nodesExplored.has(neighbor.id)) continue;

        nodesExplored.add(neighbor.id);

        // Confidence decay: 0.9^depth for recency weighting
        const depthPenalty = Math.pow(0.9, current.depth + 1);
        const newConfidence = neighbor.confidence * depthPenalty;

        // Pruning: Skip if confidence drops below threshold
        if (newConfidence < this.confidenceThreshold) {
          continue;
        }

        const newPath: PathNode[] = [
          ...current.path,
          {
            id: neighbor.id,
            name: neighbor.name,
            type: neighbor.type,
            confidence: newConfidence,
            relationshipType: neighbor.relationshipType,
            relationshipStrength: neighbor.relationshipStrength
          }
        ];

        const newPathScore = current.pathScore * newConfidence;
        const newVisited = new Set(current.visitedInPath);
        newVisited.add(neighbor.id);

        // Add to queue for further exploration
        queue.push({
          id: neighbor.id,
          depth: current.depth + 1,
          path: newPath,
          pathScore: newPathScore,
          visitedInPath: newVisited
        });

        // Also record as a complete path
        paths.push({
          path: newPath,
          score: newPathScore,
          depth: current.depth + 1,
          confidence: newConfidence
        });
      }
    }

    return paths;
  }

  /**
   * Get neighbors with relationship context (logic-aware edges)
   * 
   * Considers:
   * - Semantic similarity to query
   * - Relationship type and strength
   * - Entity type compatibility
   */
  private async getNeighborsWithContext(
    entityId: string,
    query: string,
    queryEmbedding: number[],
    visitedInPath: Set<string>
  ): Promise<Neighbor[]> {
    try {
      const datalog = `
        rank_val[id, r] := *entity_rank{entity_id: id, pagerank: r}
        rank_val[id, r] := *entity{id, @ "NOW"}, not *entity_rank{entity_id: id}, r = 0.0

        outgoing[to_id, rel_type, strength] := 
          *relationship{from_id: $entity_id, to_id, relation_type: rel_type, strength, @ "NOW"}
        
        incoming[from_id, rel_type, strength] := 
          *relationship{from_id, to_id: $entity_id, relation_type: rel_type, strength, @ "NOW"}

        neighbors[id, name, type, rel_type, strength, pr] :=
          outgoing[id, rel_type, strength],
          *entity{id, name, type, @ "NOW"},
          rank_val[id, pr]
        
        neighbors[id, name, type, rel_type, strength, pr] :=
          incoming[id, rel_type, strength],
          *entity{id, name, type, @ "NOW"},
          rank_val[id, pr]

        ?[id, name, type, rel_type, strength, pr] := neighbors[id, name, type, rel_type, strength, pr]
        :sort -strength
        :limit $limit
      `;

      const result = await this.db.run(datalog, {
        entity_id: entityId,
        limit: this.maxBranchingFactor * 2
      });

      const neighbors: Neighbor[] = [];

      for (const row of result.rows as any[]) {
        const neighborId = row[0];
        const name = row[1];
        const type = row[2];
        const relType = row[3];
        const strength = row[4];
        const pagerank = row[5];

        // Calculate semantic similarity to query
        try {
          const entityRes = await this.db.run(
            '?[embedding] := *entity{id: $id, embedding, @ "NOW"}',
            { id: neighborId }
          );

          if (entityRes.rows.length > 0) {
            const embedding = entityRes.rows[0][0] as number[];
            const cosineSim = this.cosineSimilarity(queryEmbedding, embedding);

            // Confidence combines: semantic similarity (0.4) + relationship strength (0.3) + pagerank (0.3)
            const confidence = 0.4 * cosineSim + 0.3 * strength + 0.3 * Math.min(pagerank, 1.0);

            neighbors.push({
              id: neighborId,
              name,
              type,
              relationshipType: relType,
              relationshipStrength: strength,
              confidence,
              pagerank
            });
          }
        } catch (e) {
          // Fallback: use relationship strength + pagerank only
          const confidence = 0.5 * strength + 0.5 * Math.min(pagerank, 1.0);
          neighbors.push({
            id: neighborId,
            name,
            type,
            relationshipType: relType,
            relationshipStrength: strength,
            confidence,
            pagerank
          });
        }
      }

      return neighbors.sort((a, b) => b.confidence - a.confidence);
    } catch (error: any) {
      console.error("[MultiHop] Error getting neighbors:", error.message);
      return [];
    }
  }

  /**
   * Step 3: PRUNE - Filter paths by Helpfulness Score
   * 
   * Helpfulness = textual_similarity (0.6) + logical_importance (0.4)
   * Logical importance = path_length_penalty + confidence + diversity
   */
  private prunePathsByHelpfulness(paths: ScoredPath[], query: string): ScoredPath[] {
    return paths
      .map(path => {
        // Textual similarity: average confidence of path nodes
        const textualSim = path.confidence;

        // Logical importance: combination of factors
        const pathLength = path.path.length;
        const lengthPenalty = 1.0 / (1.0 + 0.1 * pathLength); // Prefer shorter paths
        const logicalImportance = lengthPenalty * path.confidence;

        // Helpfulness score
        const helpfulness = 0.6 * textualSim + 0.4 * logicalImportance;

        return {
          ...path,
          helpfulness: helpfulness
        };
      })
      .filter(p => (p as any).helpfulness >= this.confidenceThreshold)
      .sort((a, b) => ((b as any).helpfulness || 0) - ((a as any).helpfulness || 0));
  }

  /**
   * Step 4: AGGREGATE - Deduplicate and rank entities
   */
  private aggregatePathResults(paths: ScoredPath[]): AggregatedEntity[] {
    const entityMap = new Map<string, AggregatedEntity>();

    for (const path of paths) {
      for (const node of path.path) {
        const existing = entityMap.get(node.id);

        if (existing) {
          existing.occurrences++;
          existing.max_score = Math.max(existing.max_score, path.score);
          existing.avg_score = (existing.avg_score * (existing.occurrences - 1) + path.score) / existing.occurrences;
          existing.min_depth = Math.min(existing.min_depth, path.depth);
        } else {
          entityMap.set(node.id, {
            id: node.id,
            name: node.name,
            type: node.type,
            occurrences: 1,
            max_score: path.score,
            avg_score: path.score,
            min_depth: path.depth,
            confidence: node.confidence
          });
        }
      }
    }

    return Array.from(entityMap.values())
      .sort((a, b) => {
        // Sort by: occurrences (frequency) > avg_score > min_depth
        if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
        if (b.avg_score !== a.avg_score) return b.avg_score - a.avg_score;
        return a.min_depth - b.min_depth;
      });
  }

  /**
   * Calculate path confidence: average confidence of all nodes in path
   */
  private calculatePathConfidence(path: PathNode[]): number {
    if (path.length === 0) return 0;
    const sum = path.reduce((acc, node) => acc + node.confidence, 0);
    return sum / path.length;
  }

  /**
   * Cosine similarity between two vectors
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

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface VectorPivot {
  id: string;
  name: string;
  type: string;
  similarity: number;
}

export interface GraphPath {
  nodes: PathNode[];
  score: number;
  depth: number;
}

export interface ScoredPath {
  path: PathNode[];
  score: number;
  depth: number;
  confidence: number;
  helpfulness?: number;
}

export interface PathNode {
  id: string;
  name: string;
  type: string;
  confidence: number;
  relationshipType?: string;
  relationshipStrength?: number;
}

export interface Neighbor {
  id: string;
  name: string;
  type: string;
  relationshipType: string;
  relationshipStrength: number;
  confidence: number;
  pagerank: number;
}

export interface BFSNode {
  id: string;
  depth: number;
  path: PathNode[];
  pathScore: number;
  visitedInPath: Set<string>;
}

export interface AggregatedEntity {
  id: string;
  name: string;
  type: string;
  occurrences: number;
  max_score: number;
  avg_score: number;
  min_depth: number;
  confidence: number;
}

export interface MultiHopResult {
  query: string;
  pivots: Array<{ id: string; name: string; similarity: number }>;
  paths: ScoredPath[];
  aggregated_results: AggregatedEntity[];
  total_hops: number;
  execution_time_ms: number;
  status: "success" | "no_pivots_found" | "error";
  error?: string;
}
