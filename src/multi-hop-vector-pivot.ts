import { EmbeddingService } from './embedding-service';

/**
 * Multi-Hop Reasoning with Vector Pivots
 * 
 * Combines vector search with graph traversal for intelligent multi-hop reasoning:
 * 1. Vector Search finds semantic "pivot points" (starting entities)
 * 2. Graph Traversal explores multi-hop neighborhoods from each pivot
 * 3. Path Quality Scoring ranks paths by relevance and structure
 * 4. Adaptive Hop Depth limits traversal based on confidence
 * 
 * Based on research:
 * - HopRAG: Multi-Hop Reasoning for Logic-Aware RAG (ACL 2025)
 * - Neo4j GraphRAG: Knowledge Graphs + LLMs (2025)
 * - Retrieval Pivot Attacks in Hybrid RAG (arXiv:2602.08668)
 * - HybridDeepSearcher: Scalable Parallel/Sequential Search (ICLR 2026)
 */
export class MultiHopVectorPivot {
  private embeddingService: EmbeddingService;
  private dbQuery: (query: string, params?: any) => Promise<any>;
  private readonly DEFAULT_MAX_HOPS = 4;
  private readonly DEFAULT_BRANCHING_FACTOR = 10;
  private readonly DEFAULT_MAX_NODES = 100;
  private readonly CONFIDENCE_THRESHOLD = 0.5;

  constructor(
    embeddingService: EmbeddingService,
    dbQuery: (query: string, params?: any) => Promise<any>
  ) {
    this.embeddingService = embeddingService;
    this.dbQuery = dbQuery;
  }

  /**
   * Multi-hop reasoning with vector pivots
   * 
   * Pipeline:
   * 1. Vector Search: Find semantic pivot points
   * 2. Graph Traversal: BFS from each pivot with adaptive depth
   * 3. Path Scoring: Rank by relevance + structure quality
   * 4. Result Aggregation: Combine and deduplicate paths
   */
  async multiHopVectorPivot(
    query: string,
    options?: {
      maxHops?: number;
      branchingFactor?: number;
      maxNodes?: number;
      adaptiveDepth?: boolean;
    }
  ): Promise<MultiHopResult> {
    const maxHops = options?.maxHops ?? this.DEFAULT_MAX_HOPS;
    const branchingFactor = options?.branchingFactor ?? this.DEFAULT_BRANCHING_FACTOR;
    const maxNodes = options?.maxNodes ?? this.DEFAULT_MAX_NODES;
    const adaptiveDepth = options?.adaptiveDepth ?? true;

    console.error(`[MultiHopVectorPivot] Starting multi-hop reasoning for: "${query}"`);
    console.error(`  - Max hops: ${maxHops}, Branching: ${branchingFactor}, Max nodes: ${maxNodes}`);

    try {
      // Step 1: Vector Search for pivot points
      console.error(`[MultiHopVectorPivot] Step 1: Finding vector pivot points...`);
      const pivots = await this.findVectorPivots(query, branchingFactor);
      console.error(`  ✓ Found ${pivots.length} pivot points`);

      if (pivots.length === 0) {
        return {
          query,
          pivots: [],
          paths: [],
          aggregatedResults: [],
          statistics: {
            totalPivots: 0,
            totalPaths: 0,
            totalNodes: 0,
            avgPathLength: 0,
            avgPathScore: 0,
          },
        };
      }

      // Step 2: Graph traversal from each pivot
      console.error(`[MultiHopVectorPivot] Step 2: Traversing graph from pivots...`);
      const allPaths: GraphPath[] = [];
      
      for (const pivot of pivots) {
        const paths = await this.graphTraversalFromPivot(
          pivot,
          query,
          maxHops,
          branchingFactor,
          maxNodes,
          adaptiveDepth
        );
        allPaths.push(...paths);
      }

      console.error(`  ✓ Found ${allPaths.length} total paths`);

      // Step 3: Score and rank paths
      console.error(`[MultiHopVectorPivot] Step 3: Scoring and ranking paths...`);
      const scoredPaths = allPaths.map(path => ({
        ...path,
        score: this.calculatePathQuality(path, query),
      }));

      scoredPaths.sort((a, b) => b.score - a.score);
      console.error(`  ✓ Ranked ${scoredPaths.length} paths`);

      // Step 4: Aggregate results
      console.error(`[MultiHopVectorPivot] Step 4: Aggregating results...`);
      const aggregatedResults = this.aggregatePathResults(scoredPaths);
      console.error(`  ✓ Aggregated into ${aggregatedResults.length} unique entities`);

      // Calculate statistics
      const statistics = {
        totalPivots: pivots.length,
        totalPaths: allPaths.length,
        totalNodes: new Set(allPaths.flatMap(p => p.nodes.map(n => n.id))).size,
        avgPathLength: allPaths.length > 0 
          ? allPaths.reduce((sum, p) => sum + p.nodes.length, 0) / allPaths.length 
          : 0,
        avgPathScore: scoredPaths.length > 0
          ? scoredPaths.reduce((sum, p) => sum + p.score, 0) / scoredPaths.length
          : 0,
      };

      return {
        query,
        pivots,
        paths: scoredPaths,
        aggregatedResults,
        statistics,
      };

    } catch (error) {
      console.error(`[MultiHopVectorPivot] Error during multi-hop reasoning:`, error);
      throw error;
    }
  }

  /**
   * Find vector pivot points using semantic search
   * These are the starting entities for graph traversal
   */
  private async findVectorPivots(
    query: string,
    limit: number
  ): Promise<VectorPivot[]> {
    try {
      const embedding = await this.embeddingService.embed(query);

      // Simulate vector search (in real implementation, use HNSW index)
      const result = await this.dbQuery(
        `?[id, name, type, score] := 
          ~entity:semantic{id | query: vec($embedding), k: $limit, ef: 100, bind_distance: dist},
          *entity{id, name, type, @ "NOW"},
          score = 1.0 - dist
        | order by -score
        | limit $limit`,
        {
          embedding,
          limit,
        }
      );

      if (!result.rows || result.rows.length === 0) {
        return [];
      }

      return result.rows.map((row: any) => ({
        id: row[0],
        name: row[1],
        type: row[2],
        similarity: row[3],
      }));
    } catch (error) {
      console.error(`[MultiHopVectorPivot] Error finding vector pivots:`, error);
      return [];
    }
  }

  /**
   * Graph traversal from a single pivot using BFS with adaptive depth
   * 
   * Adaptive depth: Reduce max hops if confidence drops below threshold
   */
  private async graphTraversalFromPivot(
    pivot: VectorPivot,
    query: string,
    maxHops: number,
    branchingFactor: number,
    maxNodes: number,
    adaptiveDepth: boolean
  ): Promise<GraphPath[]> {
    const paths: GraphPath[] = [];
    const visited = new Set<string>();
    const queue: BFSNode[] = [
      {
        entityId: pivot.id,
        depth: 0,
        path: [{ id: pivot.id, name: pivot.name, type: pivot.type }],
        confidence: pivot.similarity,
      },
    ];

    let nodesExplored = 0;

    while (queue.length > 0 && nodesExplored < maxNodes) {
      const current = queue.shift();
      if (!current) break;

      // Adaptive depth: stop if confidence drops too low
      if (adaptiveDepth && current.confidence < this.CONFIDENCE_THRESHOLD) {
        continue;
      }

      // Stop if max hops reached
      if (current.depth >= maxHops) {
        paths.push({
          nodes: current.path,
          depth: current.depth,
          confidence: current.confidence,
        });
        continue;
      }

      // Get neighbors
      const neighbors = await this.getNeighbors(
        current.entityId,
        branchingFactor
      );

      for (const neighbor of neighbors) {
        if (visited.has(neighbor.id)) continue;
        visited.add(neighbor.id);
        nodesExplored++;

        // Calculate new confidence (decay with depth)
        const depthDecay = Math.pow(0.9, current.depth + 1);
        const newConfidence = current.confidence * neighbor.strength * depthDecay;

        const newPath: BFSNode = {
          entityId: neighbor.id,
          depth: current.depth + 1,
          path: [
            ...current.path,
            { id: neighbor.id, name: neighbor.name, type: neighbor.type },
          ],
          confidence: newConfidence,
        };

        queue.push(newPath);

        // Record path
        paths.push({
          nodes: newPath.path,
          depth: newPath.depth,
          confidence: newConfidence,
        });
      }
    }

    return paths;
  }

  /**
   * Get neighbors of an entity via relationships
   */
  private async getNeighbors(
    entityId: string,
    limit: number
  ): Promise<Neighbor[]> {
    try {
      const result = await this.dbQuery(
        `?[toId, name, type, strength] := 
          *relationship{from_id: $entityId, to_id: toId, strength, @ "NOW"},
          *entity{id: toId, name, type, @ "NOW"}
        | order by -strength
        | limit $limit`,
        {
          entityId,
          limit,
        }
      );

      if (!result.rows || result.rows.length === 0) {
        return [];
      }

      return result.rows.map((row: any) => ({
        id: row[0],
        name: row[1],
        type: row[2],
        strength: row[3] || 0.5,
      }));
    } catch (error) {
      console.error(`[MultiHopVectorPivot] Error getting neighbors:`, error);
      return [];
    }
  }

  /**
   * Calculate path quality score
   * 
   * Factors:
   * - Semantic relevance (query similarity)
   * - Path length (shorter is better)
   * - Relationship strength (stronger edges = higher quality)
   * - Confidence decay (recent hops matter more)
   */
  private calculatePathQuality(path: GraphPath, query: string): number {
    let score = 0;

    // Factor 1: Path length penalty (prefer shorter paths)
    const lengthPenalty = 1 / (1 + path.depth * 0.1);
    score += lengthPenalty * 0.3;

    // Factor 2: Confidence score (from traversal)
    score += path.confidence * 0.4;

    // Factor 3: Path diversity (prefer paths with varied entity types)
    const uniqueTypes = new Set(path.nodes.map(n => n.type)).size;
    const diversityBoost = uniqueTypes / Math.max(path.nodes.length, 1);
    score += diversityBoost * 0.3;

    return Math.min(score, 1.0);
  }

  /**
   * Aggregate path results into unique entities with relevance scores
   */
  private aggregatePathResults(paths: ScoredPath[]): AggregatedEntity[] {
    const entityMap = new Map<string, AggregatedEntity>();

    for (const path of paths) {
      for (const node of path.nodes) {
        if (!entityMap.has(node.id)) {
          entityMap.set(node.id, {
            id: node.id,
            name: node.name,
            type: node.type,
            relevanceScore: 0,
            pathCount: 0,
            minDepth: Infinity,
          });
        }

        const entity = entityMap.get(node.id)!;
        entity.relevanceScore += path.score;
        entity.pathCount += 1;
        entity.minDepth = Math.min(entity.minDepth, path.depth);
      }
    }

    // Normalize scores
    const results = Array.from(entityMap.values());
    const maxScore = Math.max(...results.map(e => e.relevanceScore), 1);
    
    for (const entity of results) {
      entity.relevanceScore /= maxScore;
    }

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
}

/**
 * Vector pivot point (starting entity for graph traversal)
 */
export interface VectorPivot {
  id: string;
  name: string;
  type: string;
  similarity: number;
}

/**
 * Graph path from pivot to destination
 */
export interface GraphPath {
  nodes: PathNode[];
  depth: number;
  confidence: number;
}

/**
 * Scored path with quality metric
 */
export interface ScoredPath extends GraphPath {
  score: number;
}

/**
 * Node in a path
 */
export interface PathNode {
  id: string;
  name: string;
  type: string;
}

/**
 * Neighbor entity via relationship
 */
export interface Neighbor {
  id: string;
  name: string;
  type: string;
  strength: number;
}

/**
 * BFS queue node for traversal
 */
interface BFSNode {
  entityId: string;
  depth: number;
  path: PathNode[];
  confidence: number;
}

/**
 * Aggregated entity result
 */
export interface AggregatedEntity {
  id: string;
  name: string;
  type: string;
  relevanceScore: number;
  pathCount: number;
  minDepth: number;
}

/**
 * Complete multi-hop reasoning result
 */
export interface MultiHopResult {
  query: string;
  pivots: VectorPivot[];
  paths: ScoredPath[];
  aggregatedResults: AggregatedEntity[];
  statistics: {
    totalPivots: number;
    totalPaths: number;
    totalNodes: number;
    avgPathLength: number;
    avgPathScore: number;
  };
}
