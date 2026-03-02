/**
 * Adaptive Query Fusion with Dynamic Weights
 * 
 * Based on 2026 SOTA Research:
 * - Meilisearch Adaptive RAG (2025)
 * - FEEG Framework: Finder, Evaluator, Explainer, Generator (Samuel et al., 2026)
 * - ORCAS-I Intent Classifier (Alexander et al., 2022)
 * - Query Intent Classification Research (2025)
 * 
 * Combines:
 * 1. Heuristic keyword-based classification (fast, reliable)
 * 2. LLM-based classification (accurate, semantic understanding)
 * 3. Adaptive weight selection based on query type
 * 4. Fallback mechanisms for robustness
 */

import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';

// Query Intent Types (FEEG Framework)
export enum QueryIntent {
  FINDER = 'finder',           // Seek factual information (F)
  EVALUATOR = 'evaluator',     // Evaluate/compare content (Ev)
  EXPLAINER = 'explainer',     // Explain concepts (Ex)
  GENERATOR = 'generator'      // Generate new content (G)
}

// Query Complexity Levels
export enum QueryComplexity {
  SIMPLE = 'simple',           // Single fact, direct answer
  MODERATE = 'moderate',       // 2-3 concepts, some reasoning
  COMPLEX = 'complex',         // Multi-concept, deep reasoning
  EXPLORATORY = 'exploratory'  // Open-ended, broad search
}

// Search Path Weights
export interface SearchWeights {
  vector: number;              // Dense semantic search
  sparse: number;              // Keyword/TF-IDF search
  fts: number;                 // Full-text search
  graph: number;               // Graph traversal
}

// Query Classification Result
export interface QueryClassification {
  intent: QueryIntent;
  complexity: QueryComplexity;
  confidence: number;          // 0.0 - 1.0
  method: 'heuristic' | 'llm' | 'hybrid';
  keywords: string[];
  reasoning: string;
}

// Adaptive Fusion Configuration
export interface AdaptiveFusionConfig {
  enableLLM: boolean;          // Use LLM for classification
  llmModel?: string;           // Ollama model name
  heuristicThreshold: number;  // Confidence threshold for heuristics
  cacheClassifications: boolean;
  maxCacheSize: number;
}

/**
 * Adaptive Query Fusion Engine
 * 
 * Classifies queries and selects optimal search weights dynamically
 */
export class AdaptiveQueryFusion {
  private db: CozoDb;
  private embeddingService: EmbeddingService;
  private config: AdaptiveFusionConfig;
  private classificationCache: Map<string, QueryClassification>;

  // Keyword patterns for heuristic classification
  private readonly FINDER_KEYWORDS = [
    'what', 'when', 'where', 'who', 'how many', 'specific',
    'find', 'search', 'look for', 'get', 'retrieve',
    'latest', 'recent', 'current', 'today', 'news'
  ];

  private readonly EVALUATOR_KEYWORDS = [
    'compare', 'difference', 'versus', 'vs', 'better',
    'evaluate', 'assess', 'analyze', 'review', 'rate',
    'pros', 'cons', 'advantages', 'disadvantages'
  ];

  private readonly EXPLAINER_KEYWORDS = [
    'why', 'how', 'explain', 'understand', 'about',
    'describe', 'tell me', 'what is', 'concept',
    'meaning', 'definition', 'work', 'process'
  ];

  private readonly GENERATOR_KEYWORDS = [
    'create', 'generate', 'write', 'make', 'build',
    'suggest', 'recommend', 'example', 'template',
    'code', 'script', 'plan', 'strategy'
  ];

  // Predefined weight configurations for each intent
  private readonly WEIGHT_CONFIGS: Record<QueryIntent, Record<QueryComplexity, SearchWeights>> = {
    [QueryIntent.FINDER]: {
      [QueryComplexity.SIMPLE]: {
        vector: 0.4,
        sparse: 0.5,    // High keyword matching for factual queries
        fts: 0.1,
        graph: 0.0
      },
      [QueryComplexity.MODERATE]: {
        vector: 0.45,
        sparse: 0.35,
        fts: 0.15,
        graph: 0.05
      },
      [QueryComplexity.COMPLEX]: {
        vector: 0.5,
        sparse: 0.25,
        fts: 0.15,
        graph: 0.1
      },
      [QueryComplexity.EXPLORATORY]: {
        vector: 0.4,
        sparse: 0.2,
        fts: 0.2,
        graph: 0.2
      }
    },
    [QueryIntent.EVALUATOR]: {
      [QueryComplexity.SIMPLE]: {
        vector: 0.5,
        sparse: 0.3,
        fts: 0.1,
        graph: 0.1
      },
      [QueryComplexity.MODERATE]: {
        vector: 0.5,
        sparse: 0.2,
        fts: 0.1,
        graph: 0.2
      },
      [QueryComplexity.COMPLEX]: {
        vector: 0.45,
        sparse: 0.15,
        fts: 0.1,
        graph: 0.3
      },
      [QueryComplexity.EXPLORATORY]: {
        vector: 0.4,
        sparse: 0.1,
        fts: 0.1,
        graph: 0.4
      }
    },
    [QueryIntent.EXPLAINER]: {
      [QueryComplexity.SIMPLE]: {
        vector: 0.6,
        sparse: 0.2,
        fts: 0.1,
        graph: 0.1
      },
      [QueryComplexity.MODERATE]: {
        vector: 0.55,
        sparse: 0.15,
        fts: 0.1,
        graph: 0.2
      },
      [QueryComplexity.COMPLEX]: {
        vector: 0.5,
        sparse: 0.1,
        fts: 0.1,
        graph: 0.3
      },
      [QueryComplexity.EXPLORATORY]: {
        vector: 0.45,
        sparse: 0.1,
        fts: 0.1,
        graph: 0.35
      }
    },
    [QueryIntent.GENERATOR]: {
      [QueryComplexity.SIMPLE]: {
        vector: 0.5,
        sparse: 0.3,
        fts: 0.1,
        graph: 0.1
      },
      [QueryComplexity.MODERATE]: {
        vector: 0.45,
        sparse: 0.25,
        fts: 0.15,
        graph: 0.15
      },
      [QueryComplexity.COMPLEX]: {
        vector: 0.4,
        sparse: 0.2,
        fts: 0.2,
        graph: 0.2
      },
      [QueryComplexity.EXPLORATORY]: {
        vector: 0.35,
        sparse: 0.15,
        fts: 0.2,
        graph: 0.3
      }
    }
  };

  constructor(
    db: CozoDb,
    embeddingService: EmbeddingService,
    config?: Partial<AdaptiveFusionConfig>
  ) {
    this.db = db;
    this.embeddingService = embeddingService;
    this.classificationCache = new Map();

    this.config = {
      enableLLM: true,
      llmModel: 'demyagent-4b-i1:Q6_K',
      heuristicThreshold: 0.7,
      cacheClassifications: true,
      maxCacheSize: 1000,
      ...config
    };
  }

  /**
   * Classify query using hybrid approach (heuristic + LLM)
   */
  async classifyQuery(query: string): Promise<QueryClassification> {
    // Check cache first
    if (this.config.cacheClassifications) {
      const cached = this.classificationCache.get(query);
      if (cached) {
        console.error(`[AdaptiveQueryFusion] Cache hit for query: "${query}"`);
        return cached;
      }
    }

    // Step 1: Heuristic classification (fast)
    const heuristicResult = this.classifyHeuristic(query);
    console.error(`[AdaptiveQueryFusion] Heuristic result: ${heuristicResult.intent} (confidence: ${heuristicResult.confidence.toFixed(2)})`);

    // Step 2: If heuristic confidence is high enough, use it
    if (heuristicResult.confidence >= this.config.heuristicThreshold) {
      const result = {
        ...heuristicResult,
        method: 'heuristic' as const
      };
      this.cacheClassification(query, result);
      return result;
    }

    // Step 3: Try LLM classification if enabled and heuristic confidence is low
    if (this.config.enableLLM) {
      try {
        const llmResult = await this.classifyLLM(query);
        console.error(`[AdaptiveQueryFusion] LLM result: ${llmResult.intent} (confidence: ${llmResult.confidence.toFixed(2)})`);
        
        const result = {
          ...llmResult,
          method: 'llm' as const
        };
        this.cacheClassification(query, result);
        return result;
      } catch (error) {
        console.error(`[AdaptiveQueryFusion] LLM classification failed, falling back to heuristic:`, error);
      }
    }

    // Step 4: Fallback to heuristic
    const result = {
      ...heuristicResult,
      method: 'hybrid' as const
    };
    this.cacheClassification(query, result);
    return result;
  }

  /**
   * Heuristic-based query classification using keywords
   */
  private classifyHeuristic(query: string): Omit<QueryClassification, 'method'> {
    const queryLower = query.toLowerCase();
    const words = queryLower.split(/\s+/);

    // Count keyword matches for each intent
    const intentScores = {
      [QueryIntent.FINDER]: this.countMatches(queryLower, this.FINDER_KEYWORDS),
      [QueryIntent.EVALUATOR]: this.countMatches(queryLower, this.EVALUATOR_KEYWORDS),
      [QueryIntent.EXPLAINER]: this.countMatches(queryLower, this.EXPLAINER_KEYWORDS),
      [QueryIntent.GENERATOR]: this.countMatches(queryLower, this.GENERATOR_KEYWORDS)
    };

    // Find dominant intent
    let dominantIntent = QueryIntent.FINDER;
    let maxScore = 0;
    for (const [intent, score] of Object.entries(intentScores)) {
      if (score > maxScore) {
        maxScore = score;
        dominantIntent = intent as QueryIntent;
      }
    }

    // Calculate confidence (0.0 - 1.0)
    const totalScore = Object.values(intentScores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? maxScore / totalScore : 0.5;

    // Classify complexity
    const complexity = this.classifyComplexity(query, words);

    // Extract keywords
    const keywords = words.filter(w => w.length > 3);

    return {
      intent: dominantIntent,
      complexity,
      confidence,
      keywords,
      reasoning: `Heuristic classification: ${dominantIntent} (${(confidence * 100).toFixed(0)}% confidence)`
    };
  }

  /**
   * LLM-based query classification using Ollama
   */
  private async classifyLLM(query: string): Promise<Omit<QueryClassification, 'method'>> {
    try {
      // Dynamic import to avoid hard dependency
      const ollamaModule: any = await import('ollama');
      const ollama: any = ollamaModule?.default ?? ollamaModule;

      const systemPrompt = `You are a query classification expert. Classify the user's query into one of these categories:
- "finder": Seeking factual information (what, when, where, who, how many)
- "evaluator": Comparing or evaluating content (compare, difference, better)
- "explainer": Understanding concepts (why, how, explain)
- "generator": Creating or generating content (create, write, suggest)

Also classify complexity as: "simple", "moderate", "complex", or "exploratory"

Respond with JSON: {"intent": "...", "complexity": "...", "confidence": 0.0-1.0, "reasoning": "..."}`;

      const response = await ollama.chat({
        model: this.config.llmModel!,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        format: 'json'
      });

      let responseText = (response as any)?.message?.content?.trim?.() ?? '';

      // Clean markdown formatting if present
      if (responseText.startsWith('```json')) {
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      } else if (responseText.startsWith('```')) {
        responseText = responseText.replace(/```/g, '').trim();
      }

      const parsed = JSON.parse(responseText);

      return {
        intent: (parsed.intent || QueryIntent.FINDER) as QueryIntent,
        complexity: (parsed.complexity || QueryComplexity.MODERATE) as QueryComplexity,
        confidence: Math.min(1.0, Math.max(0.0, parsed.confidence || 0.8)),
        keywords: query.split(/\s+/).filter(w => w.length > 3),
        reasoning: parsed.reasoning || 'LLM classification'
      };
    } catch (error) {
      console.error('[AdaptiveQueryFusion] LLM classification error:', error);
      throw error;
    }
  }

  /**
   * Classify query complexity based on heuristics
   */
  private classifyComplexity(query: string, words: string[]): QueryComplexity {
    const queryLower = query.toLowerCase();

    // Simple: Short, direct questions
    if (words.length <= 4 && /^(what|when|where|who|how many)\s/.test(queryLower)) {
      return QueryComplexity.SIMPLE;
    }

    // Exploratory: Open-ended, broad
    if (/^(all|everything|explore|overview|general|summary|list)\b/.test(queryLower)) {
      return QueryComplexity.EXPLORATORY;
    }

    // Complex: Multiple concepts, reasoning required
    const complexIndicators = ['and', 'or', 'but', 'however', 'relationship', 'connection', 'impact'];
    const complexCount = complexIndicators.filter(ind => queryLower.includes(ind)).length;
    if (complexCount >= 2 || words.length > 15) {
      return QueryComplexity.COMPLEX;
    }

    // Moderate: Default
    return QueryComplexity.MODERATE;
  }

  /**
   * Count keyword matches in query
   */
  private countMatches(query: string, keywords: string[]): number {
    return keywords.filter(keyword => query.includes(keyword)).length;
  }

  /**
   * Cache classification result
   */
  private cacheClassification(query: string, classification: QueryClassification): void {
    if (!this.config.cacheClassifications) return;

    // Simple LRU: remove oldest if cache is full
    if (this.classificationCache.size >= this.config.maxCacheSize) {
      const firstKey = this.classificationCache.keys().next().value;
      if (firstKey !== undefined) {
        this.classificationCache.delete(firstKey);
      }
    }

    this.classificationCache.set(query, classification);
  }

  /**
   * Get adaptive search weights for a query
   */
  async getAdaptiveWeights(query: string): Promise<SearchWeights> {
    const classification = await this.classifyQuery(query);
    
    const weights = this.WEIGHT_CONFIGS[classification.intent][classification.complexity];
    
    console.error(`[AdaptiveQueryFusion] Weights for "${query}":`, {
      intent: classification.intent,
      complexity: classification.complexity,
      weights
    });

    return weights;
  }

  /**
   * Get classification details for debugging
   */
  async getClassificationDetails(query: string): Promise<QueryClassification> {
    return this.classifyQuery(query);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.classificationCache.clear();
    console.error('[AdaptiveQueryFusion] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.classificationCache.size,
      maxSize: this.config.maxCacheSize
    };
  }
}
