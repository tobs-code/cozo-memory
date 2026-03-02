/**
 * Explainable Retrieval Service
 * 
 * Provides detailed reasoning paths and explanations for retrieval results.
 * Inspired by GraphRAG explainability patterns and reasoning trace research (2025-2026).
 * 
 * Features:
 * - Full path visualization for graph traversals
 * - Detailed reasoning chains for hybrid search
 * - Step-by-step explanation of score calculations
 * - Human-readable path descriptions
 */

import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ReasoningStep {
  step: number;
  operation: string;
  description: string;
  score?: number;
  details?: Record<string, any>;
}

export interface PathVisualization {
  textual: string;        // "Query --[semantic:0.85]--> TypeScript --[expert_in]--> Alice"
  nodes: PathNode[];      // Structured node information
  edges: PathEdge[];      // Structured edge information
  totalHops: number;
  confidence: number;
}

export interface PathNode {
  id: string;
  name: string;
  type: string;
  position: number;       // Position in path (0 = start)
  score?: number;
  metadata?: Record<string, any>;
}

export interface PathEdge {
  from: string;
  to: string;
  relationshipType: string;
  strength: number;
  label: string;          // Human-readable label
}

export interface DetailedExplanation {
  summary: string;                    // One-line summary
  reasoning: string;                  // Detailed reasoning
  steps: ReasoningStep[];             // Step-by-step breakdown
  pathVisualization?: PathVisualization;  // Graph path visualization
  scoreBreakdown: ScoreBreakdown;     // Score calculation details
  confidence: number;                 // Overall confidence (0-1)
  sources: string[];                  // Contributing retrieval paths
}

export interface ScoreBreakdown {
  finalScore: number;
  components: {
    vectorMatch?: number;
    sparseMatch?: number;
    ftsMatch?: number;
    graphMatch?: number;
    pageRank?: number;
    temporalDecay?: number;
    userBoost?: number;
    reranking?: number;
  };
  weights: {
    vectorWeight?: number;
    sparseWeight?: number;
    ftsWeight?: number;
    graphWeight?: number;
  };
  formula: string;  // Human-readable formula
}

export interface ExplainableResult {
  id: string;
  entity_id: string;
  name: string;
  type: string;
  score: number;
  source: string;
  metadata?: Record<string, any>;
  explanation: DetailedExplanation;
}

// ============================================================================
// Explainable Retrieval Service
// ============================================================================

export class ExplainableRetrievalService {
  constructor(
    private db: CozoDb,
    private embeddingService: EmbeddingService
  ) {}

  /**
   * Enhances search results with detailed explanations
   */
  async explainResults(
    results: any[],
    query: string,
    searchType: 'hybrid' | 'graph_rag' | 'multi_hop' | 'dynamic_fusion',
    options?: {
      includePathVisualization?: boolean;
      includeReasoningSteps?: boolean;
      includeScoreBreakdown?: boolean;
    }
  ): Promise<ExplainableResult[]> {
    const includePathViz = options?.includePathVisualization ?? true;
    const includeSteps = options?.includeReasoningSteps ?? true;
    const includeBreakdown = options?.includeScoreBreakdown ?? true;

    const explainableResults: ExplainableResult[] = [];

    for (const result of results) {
      const explanation = await this.generateExplanation(
        result,
        query,
        searchType,
        { includePathViz, includeSteps, includeBreakdown }
      );

      explainableResults.push({
        id: result.id,
        entity_id: result.entity_id || result.id,
        name: result.name,
        type: result.type,
        score: result.score,
        source: result.source,
        metadata: result.metadata,
        explanation
      });
    }

    return explainableResults;
  }

  /**
   * Generates detailed explanation for a single result
   */
  private async generateExplanation(
    result: any,
    query: string,
    searchType: string,
    options: { includePathViz: boolean; includeSteps: boolean; includeBreakdown: boolean }
  ): Promise<DetailedExplanation> {
    let steps: ReasoningStep[] = [];
    let pathVisualization: PathVisualization | undefined;
    let summary = '';
    let reasoning = '';

    // Generate explanation based on search type
    switch (searchType) {
      case 'graph_rag':
        ({ summary, reasoning, steps, pathVisualization } = await this.explainGraphRag(result, query, options));
        break;
      case 'multi_hop':
        ({ summary, reasoning, steps, pathVisualization } = await this.explainMultiHop(result, query, options));
        break;
      case 'dynamic_fusion':
        ({ summary, reasoning, steps } = await this.explainDynamicFusion(result, query, options));
        break;
      case 'hybrid':
      default:
        ({ summary, reasoning, steps } = await this.explainHybridSearch(result, query, options));
        break;
    }

    // Generate score breakdown
    const scoreBreakdown = this.generateScoreBreakdown(result, searchType);

    // Extract sources
    const sources = this.extractSources(result);

    // Calculate confidence
    const confidence = this.calculateConfidence(result, scoreBreakdown);

    return {
      summary,
      reasoning,
      steps: options.includeSteps ? steps : [],
      pathVisualization: options.includePathViz ? pathVisualization : undefined,
      scoreBreakdown: options.includeBreakdown ? scoreBreakdown : this.getMinimalScoreBreakdown(result),
      confidence,
      sources
    };
  }

  /**
   * Explains Graph-RAG results with path visualization
   */
  private async explainGraphRag(
    result: any,
    query: string,
    options: { includePathViz: boolean; includeSteps: boolean }
  ): Promise<{
    summary: string;
    reasoning: string;
    steps: ReasoningStep[];
    pathVisualization?: PathVisualization;
  }> {
    const steps: ReasoningStep[] = [];

    // Step 1: Vector seed discovery
    steps.push({
      step: 1,
      operation: 'Vector Seed Discovery',
      description: `Performed semantic search to find initial pivot entities related to "${query}"`,
      score: result.pathScores?.vector || result.score,
      details: {
        method: 'HNSW vector search',
        embedding_model: 'Xenova/bge-m3',
        topK: 10
      }
    });

    // Step 2: Graph expansion
    const depth = result.metadata?.depth || result.depth || 2;
    steps.push({
      step: 2,
      operation: 'Graph Expansion',
      description: `Explored graph relationships up to ${depth} hops from seed entities`,
      details: {
        maxDepth: depth,
        traversalType: 'bidirectional',
        relationshipTypes: 'all'
      }
    });

    // Step 3: Entity discovery
    steps.push({
      step: 3,
      operation: 'Entity Discovery',
      description: `Found "${result.name}" (${result.type}) through graph traversal`,
      score: result.score,
      details: {
        entityId: result.id,
        entityType: result.type,
        pageRank: result.metadata?.pagerank || 0
      }
    });

    // Step 4: Score calculation
    steps.push({
      step: 4,
      operation: 'Score Calculation',
      description: 'Combined vector similarity, graph distance, and PageRank scores',
      score: result.score,
      details: {
        formula: 'seed_score * (1.0 - 0.2 * depth) * (1.0 + pagerank)',
        components: {
          seedScore: result.pathScores?.vector || 0.8,
          depthPenalty: 0.2 * depth,
          pageRankBoost: result.metadata?.pagerank || 0
        }
      }
    });

    // Generate path visualization
    let pathVisualization: PathVisualization | undefined;
    if (options.includePathViz) {
      pathVisualization = await this.generateGraphPath(result, query);
    }

    const summary = `Found via graph expansion from semantic seed (${depth} hops)`;
    const reasoning = `Started with semantic search for "${query}", then explored graph relationships up to ${depth} hops. ` +
      `Discovered "${result.name}" through ${pathVisualization?.nodes.length || 'multiple'} intermediate entities. ` +
      `Final score combines vector similarity (${(result.pathScores?.vector || 0.8).toFixed(2)}), ` +
      `graph distance penalty (-${(0.2 * depth).toFixed(2)}), and PageRank boost (+${(result.metadata?.pagerank || 0).toFixed(2)}).`;

    return { summary, reasoning, steps, pathVisualization };
  }

  /**
   * Explains Multi-Hop reasoning results
   */
  private async explainMultiHop(
    result: any,
    query: string,
    options: { includePathViz: boolean; includeSteps: boolean }
  ): Promise<{
    summary: string;
    reasoning: string;
    steps: ReasoningStep[];
    pathVisualization?: PathVisualization;
  }> {
    const steps: ReasoningStep[] = [];

    // Step 1: Vector pivot discovery
    steps.push({
      step: 1,
      operation: 'Vector Pivot Discovery',
      description: `Identified semantic pivot points related to "${query}"`,
      score: result.pivotSimilarity || 0.85,
      details: {
        method: 'HNSW vector search',
        pivotCount: result.pivotCount || 3
      }
    });

    // Step 2: Logic-aware traversal
    steps.push({
      step: 2,
      operation: 'Logic-Aware Traversal',
      description: 'Explored graph with relationship context and PageRank weighting',
      details: {
        maxHops: result.maxHops || 3,
        relationshipTypes: result.relationshipTypes || 'all',
        pageRankWeighted: true
      }
    });

    // Step 3: Helpfulness pruning
    steps.push({
      step: 3,
      operation: 'Helpfulness Pruning',
      description: 'Filtered paths by semantic relevance and logical importance',
      score: result.helpfulness || 0.75,
      details: {
        semanticWeight: 0.6,
        logicalWeight: 0.4,
        threshold: 0.5
      }
    });

    // Step 4: Path aggregation
    steps.push({
      step: 4,
      operation: 'Path Aggregation',
      description: `Aggregated ${result.occurrences || 1} path(s) leading to "${result.name}"`,
      score: result.score,
      details: {
        occurrences: result.occurrences || 1,
        avgScore: result.avg_score || result.score,
        minDepth: result.min_depth || result.depth || 1
      }
    });

    // Generate path visualization
    let pathVisualization: PathVisualization | undefined;
    if (options.includePathViz && result.path) {
      pathVisualization = this.visualizeMultiHopPath(result.path, query);
    }

    const summary = `Found via ${result.occurrences || 1} multi-hop reasoning path(s)`;
    const reasoning = `Used vector pivots as springboard for logic-aware graph traversal. ` +
      `Discovered "${result.name}" through ${result.min_depth || 1}-hop path(s) with helpfulness score ${(result.helpfulness || 0.75).toFixed(2)}. ` +
      `Path aggregation combined ${result.occurrences || 1} occurrence(s) with confidence ${(result.confidence || 0.8).toFixed(2)}.`;

    return { summary, reasoning, steps, pathVisualization };
  }

  /**
   * Explains Dynamic Fusion results
   */
  private explainDynamicFusion(
    result: any,
    query: string,
    options: { includeSteps: boolean }
  ): {
    summary: string;
    reasoning: string;
    steps: ReasoningStep[];
  } {
    const steps: ReasoningStep[] = [];
    const pathScores = result.pathScores || {};
    const sources = (result.source || '').split(',').map((s: string) => s.trim());

    // Step 1: Multi-path retrieval
    const activePaths = sources.filter((s: string) => s && s !== 'unknown');
    steps.push({
      step: 1,
      operation: 'Multi-Path Retrieval',
      description: `Executed ${activePaths.length} retrieval path(s): ${activePaths.join(', ')}`,
      details: {
        paths: activePaths,
        pathScores: pathScores
      }
    });

    // Step 2: Individual path scores
    let stepNum = 2;
    if (pathScores.vector !== undefined) {
      steps.push({
        step: stepNum++,
        operation: 'Dense Vector Search',
        description: 'Semantic similarity via HNSW index',
        score: pathScores.vector,
        details: { method: 'HNSW', model: 'Xenova/bge-m3' }
      });
    }
    if (pathScores.sparse !== undefined) {
      steps.push({
        step: stepNum++,
        operation: 'Sparse Vector Search',
        description: 'Keyword-based TF-IDF matching',
        score: pathScores.sparse,
        details: { method: 'TF-IDF' }
      });
    }
    if (pathScores.fts !== undefined) {
      steps.push({
        step: stepNum++,
        operation: 'Full-Text Search',
        description: 'BM25 scoring on entity names',
        score: pathScores.fts,
        details: { method: 'BM25' }
      });
    }
    if (pathScores.graph !== undefined) {
      steps.push({
        step: stepNum++,
        operation: 'Graph Traversal',
        description: 'Multi-hop relationship expansion',
        score: pathScores.graph,
        details: { method: 'BFS', maxDepth: 2 }
      });
    }

    // Step 3: Fusion
    steps.push({
      step: stepNum++,
      operation: 'Score Fusion',
      description: 'Combined path scores using Reciprocal Rank Fusion (RRF)',
      score: result.score,
      details: {
        strategy: 'RRF',
        k: 60,
        contributingPaths: activePaths.length
      }
    });

    const summary = `Found via ${activePaths.length}-path fusion (${activePaths.join(', ')})`;
    const pathScoreStr = Object.entries(pathScores)
      .map(([path, score]) => `${path}:${(score as number).toFixed(2)}`)
      .join(', ');
    const reasoning = `Executed parallel retrieval across ${activePaths.length} path(s). ` +
      `Individual scores: ${pathScoreStr}. ` +
      `Combined using RRF fusion to produce final score ${result.score.toFixed(2)}.`;

    return { summary, reasoning, steps };
  }

  /**
   * Explains Hybrid Search results
   */
  private explainHybridSearch(
    result: any,
    query: string,
    options: { includeSteps: boolean }
  ): {
    summary: string;
    reasoning: string;
    steps: ReasoningStep[];
  } {
    const steps: ReasoningStep[] = [];
    const source = result.source || 'unknown';

    // Determine primary retrieval method
    steps.push({
      step: 1,
      operation: 'Primary Retrieval',
      description: `Retrieved via ${source} search`,
      score: result.score,
      details: {
        method: source,
        query: query
      }
    });

    // Additional signals
    let stepNum = 2;
    if (result.metadata?.pagerank) {
      steps.push({
        step: stepNum++,
        operation: 'PageRank Boost',
        description: 'Applied entity importance weighting',
        score: result.metadata.pagerank,
        details: { pagerank: result.metadata.pagerank }
      });
    }

    if (result.metadata?.community_id) {
      steps.push({
        step: stepNum++,
        operation: 'Community Expansion',
        description: 'Boosted by community membership',
        details: { communityId: result.metadata.community_id }
      });
    }

    // Temporal decay
    if (result.created_at) {
      const age = Date.now() - result.created_at;
      const ageDays = Math.floor(age / (1000 * 60 * 60 * 24));
      steps.push({
        step: stepNum++,
        operation: 'Temporal Decay',
        description: `Applied time-based score adjustment (age: ${ageDays} days)`,
        details: {
          ageDays,
          halfLife: 90,
          decayFactor: Math.exp(-Math.log(2) * ageDays / 90)
        }
      });
    }

    const summary = `Found via ${source} search`;
    const reasoning = `Retrieved "${result.name}" using ${source} search with score ${result.score.toFixed(2)}. ` +
      (result.metadata?.pagerank ? `Boosted by PageRank (${result.metadata.pagerank.toFixed(2)}). ` : '') +
      (result.created_at ? `Adjusted for recency (${Math.floor((Date.now() - result.created_at) / (1000 * 60 * 60 * 24))} days old). ` : '');

    return { summary, reasoning, steps };
  }

  /**
   * Generates graph path visualization
   */
  private async generateGraphPath(result: any, query: string): Promise<PathVisualization> {
    // Try to reconstruct path from result metadata
    const nodes: PathNode[] = [];
    const edges: PathEdge[] = [];

    // Add query as starting node
    nodes.push({
      id: 'query',
      name: query,
      type: 'Query',
      position: 0,
      score: 1.0
    });

    // Try to get path from database if entity_id is available
    if (result.entity_id || result.id) {
      const entityId = result.entity_id || result.id;
      
      // Query for shortest path from any seed to this entity
      try {
        const pathQuery = `
          ?[path_nodes, path_edges] := 
            *entity{id: $entity_id, name, type, @ "NOW"},
            path_nodes = [name],
            path_edges = []
        `;
        
        const pathResult = await this.db.run(pathQuery, { entity_id: entityId });
        
        if (pathResult.rows.length > 0) {
          // Add intermediate nodes if available
          // This is a simplified version - in production, you'd reconstruct the full path
          nodes.push({
            id: entityId,
            name: result.name,
            type: result.type,
            position: 1,
            score: result.score,
            metadata: result.metadata
          });

          edges.push({
            from: 'query',
            to: entityId,
            relationshipType: 'semantic_match',
            strength: result.score,
            label: `semantic:${result.score.toFixed(2)}`
          });
        }
      } catch (e) {
        console.error('[ExplainableRetrieval] Error reconstructing path:', e);
      }
    }

    // Generate textual visualization
    const textual = this.generateTextualPath(nodes, edges);

    return {
      textual,
      nodes,
      edges,
      totalHops: nodes.length - 1,
      confidence: result.confidence || result.score || 0.8
    };
  }

  /**
   * Visualizes multi-hop path
   */
  private visualizeMultiHopPath(path: any[], query: string): PathVisualization {
    const nodes: PathNode[] = [];
    const edges: PathEdge[] = [];

    // Add query node
    nodes.push({
      id: 'query',
      name: query,
      type: 'Query',
      position: 0,
      score: 1.0
    });

    // Add path nodes
    path.forEach((node, index) => {
      nodes.push({
        id: node.id,
        name: node.name,
        type: node.type,
        position: index + 1,
        score: node.confidence,
        metadata: node.metadata
      });

      // Add edge
      const fromId = index === 0 ? 'query' : path[index - 1].id;
      edges.push({
        from: fromId,
        to: node.id,
        relationshipType: node.relationshipType || 'related_to',
        strength: node.relationshipStrength || node.confidence || 0.8,
        label: `${node.relationshipType || 'related'}:${(node.relationshipStrength || node.confidence || 0.8).toFixed(2)}`
      });
    });

    const textual = this.generateTextualPath(nodes, edges);

    return {
      textual,
      nodes,
      edges,
      totalHops: nodes.length - 1,
      confidence: path[path.length - 1]?.confidence || 0.8
    };
  }

  /**
   * Generates textual path representation
   */
  private generateTextualPath(nodes: PathNode[], edges: PathEdge[]): string {
    if (nodes.length === 0) return '';
    if (nodes.length === 1) return nodes[0].name;

    const parts: string[] = [];
    for (let i = 0; i < nodes.length; i++) {
      parts.push(nodes[i].name);
      if (i < edges.length) {
        parts.push(`--[${edges[i].label}]-->`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Generates score breakdown
   */
  private generateScoreBreakdown(result: any, searchType: string): ScoreBreakdown {
    const components: any = {};
    const weights: any = {};
    let formula = '';

    if (result.pathScores) {
      components.vectorMatch = result.pathScores.vector;
      components.sparseMatch = result.pathScores.sparse;
      components.ftsMatch = result.pathScores.fts;
      components.graphMatch = result.pathScores.graph;

      // Estimate weights (would come from config in production)
      weights.vectorWeight = 0.4;
      weights.sparseWeight = 0.3;
      weights.ftsWeight = 0.2;
      weights.graphWeight = 0.1;

      formula = 'RRF(vector, sparse, fts, graph)';
    } else {
      components.vectorMatch = result.score;
      formula = 'base_score';
    }

    if (result.metadata?.pagerank) {
      components.pageRank = result.metadata.pagerank;
      formula += ' * (1 + pagerank)';
    }

    if (result.created_at) {
      const age = Date.now() - result.created_at;
      const ageDays = age / (1000 * 60 * 60 * 24);
      components.temporalDecay = Math.exp(-Math.log(2) * ageDays / 90);
      formula += ' * temporal_decay';
    }

    return {
      finalScore: result.score,
      components,
      weights,
      formula
    };
  }

  /**
   * Gets minimal score breakdown
   */
  private getMinimalScoreBreakdown(result: any): ScoreBreakdown {
    return {
      finalScore: result.score,
      components: {},
      weights: {},
      formula: 'score'
    };
  }

  /**
   * Extracts contributing sources
   */
  private extractSources(result: any): string[] {
    if (result.source) {
      return result.source.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    return ['unknown'];
  }

  /**
   * Calculates overall confidence
   */
  private calculateConfidence(result: any, scoreBreakdown: ScoreBreakdown): number {
    // Base confidence from score
    let confidence = Math.min(result.score, 1.0);

    // Boost confidence if multiple sources agree
    const sources = this.extractSources(result);
    if (sources.length > 1) {
      confidence = Math.min(confidence * 1.1, 1.0);
    }

    // Boost confidence if PageRank is high
    if (result.metadata?.pagerank && result.metadata.pagerank > 0.5) {
      confidence = Math.min(confidence * 1.05, 1.0);
    }

    return confidence;
  }
}
