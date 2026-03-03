import { CozoDb } from 'cozo-node';

/**
 * Emotional Salience Weighting Service
 * 
 * Inspired by LUFY and Memory Bear research (2025-2026), this service implements
 * emotional salience weighting for memory retention. Emotionally charged observations
 * receive a salience boost that slows down Ebbinghaus forgetting curve decay.
 * 
 * Biological Foundation:
 * - Amygdala enhancement of emotionally significant memories
 * - Dopamine release during emotional events strengthens memory formation
 * - Emotionally charged events are remembered better than neutral ones
 * 
 * Implementation:
 * - Keyword-based detection (no LLM required)
 * - Salience score (0-1) based on emotional intensity
 * - Integration with ACT-R Memory Activation for decay modulation
 */

export interface EmotionalSalienceConfig {
  enableSalience: boolean;           // Enable emotional salience weighting
  salienceBoostFactor: number;       // Multiplier for memory strength (default: 2.0)
  decaySlowdownFactor: number;       // Reduces decay rate (default: 0.5)
  minSalienceThreshold: number;      // Minimum score to apply boost (default: 0.3)
  updateExistingObservations: boolean; // Retroactively update existing observations
}

export interface SalienceScore {
  observationId: string;
  text: string;
  salienceScore: number;             // 0-1 scale
  detectedKeywords: string[];        // Keywords that triggered salience
  category: 'high' | 'medium' | 'low' | 'neutral';
  boost: {
    strengthMultiplier: number;      // Applied to memory strength
    decayReduction: number;          // Reduces decay rate
  };
  reason: string;                    // Explanation for salience score
}

export interface SalienceStats {
  totalObservations: number;
  withSalience: number;
  distribution: {
    high: number;      // >= 0.7
    medium: number;    // 0.4 - 0.7
    low: number;       // 0.3 - 0.4
    neutral: number;   // < 0.3
  };
  averageSalience: number;
  topKeywords: Array<{ keyword: string; count: number }>;
}

/**
 * Emotional Salience Keywords
 * 
 * Organized by intensity and category based on psychological research
 * and biological memory enhancement patterns.
 */
const SALIENCE_KEYWORDS = {
  // High Intensity (0.8-1.0) - Critical, urgent, never forget
  critical: {
    weight: 1.0,
    keywords: [
      'critical', 'crucial', 'vital', 'essential', 'must', 'never forget',
      'always remember', 'extremely important', 'life-changing', 'breakthrough',
      'emergency', 'urgent', 'immediate', 'asap', 'priority one'
    ]
  },
  
  // High Importance (0.6-0.8) - Important, significant
  important: {
    weight: 0.8,
    keywords: [
      'important', 'significant', 'key', 'major', 'primary', 'fundamental',
      'noteworthy', 'remarkable', 'substantial', 'considerable', 'priority',
      'high priority', 'top priority', 'remember this', 'don\'t forget'
    ]
  },
  
  // Emotional Arousal (0.5-0.7) - Surprise, excitement, concern
  emotional: {
    weight: 0.7,
    keywords: [
      'surprising', 'unexpected', 'shocking', 'amazing', 'incredible',
      'exciting', 'thrilling', 'alarming', 'concerning', 'worrying',
      'breakthrough', 'discovery', 'revelation', 'game-changer'
    ]
  },
  
  // Temporal Urgency (0.5-0.7) - Time-sensitive
  temporal: {
    weight: 0.6,
    keywords: [
      'deadline', 'due', 'expires', 'time-sensitive', 'limited time',
      'soon', 'quickly', 'immediately', 'now', 'today', 'this week',
      'before', 'until', 'by'
    ]
  },
  
  // Negative Salience (0.4-0.6) - Problems, risks, warnings
  negative: {
    weight: 0.5,
    keywords: [
      'problem', 'issue', 'bug', 'error', 'failure', 'risk', 'danger',
      'warning', 'alert', 'caution', 'concern', 'threat', 'vulnerability',
      'critical bug', 'security issue', 'data loss'
    ]
  },
  
  // Positive Salience (0.4-0.6) - Success, achievement
  positive: {
    weight: 0.5,
    keywords: [
      'success', 'achievement', 'milestone', 'completed', 'solved',
      'accomplished', 'victory', 'win', 'breakthrough', 'innovation',
      'excellent', 'outstanding', 'exceptional'
    ]
  },
  
  // Moderate Importance (0.3-0.5) - Notable, relevant
  moderate: {
    weight: 0.4,
    keywords: [
      'notable', 'relevant', 'useful', 'helpful', 'valuable', 'worth noting',
      'interesting', 'attention', 'note', 'reminder', 'tip', 'advice'
    ]
  }
};

export class EmotionalSalienceService {
  private db: CozoDb;
  private config: EmotionalSalienceConfig;

  constructor(
    db: CozoDb,
    config: Partial<EmotionalSalienceConfig> = {}
  ) {
    this.db = db;
    this.config = {
      enableSalience: true,
      salienceBoostFactor: 2.0,
      decaySlowdownFactor: 0.5,
      minSalienceThreshold: 0.3,
      updateExistingObservations: false,
      ...config
    };
  }

  /**
   * Calculate emotional salience score for a text
   */
  calculateSalienceScore(text: string): {
    score: number;
    keywords: string[];
    category: 'high' | 'medium' | 'low' | 'neutral';
    reason: string;
  } {
    const lowerText = text.toLowerCase();
    const detectedKeywords: Array<{ keyword: string; weight: number; category: string }> = [];

    // Scan for keywords in each category
    for (const [categoryName, categoryData] of Object.entries(SALIENCE_KEYWORDS)) {
      for (const keyword of categoryData.keywords) {
        // Use word boundaries for accurate matching
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(text)) {
          detectedKeywords.push({
            keyword,
            weight: categoryData.weight,
            category: categoryName
          });
        }
      }
    }

    // Calculate weighted score
    let totalScore = 0;
    let maxWeight = 0;

    for (const detected of detectedKeywords) {
      totalScore += detected.weight;
      maxWeight = Math.max(maxWeight, detected.weight);
    }

    // Normalize: Use max weight if multiple keywords, with diminishing returns
    const score = detectedKeywords.length === 0 
      ? 0 
      : Math.min(1.0, maxWeight + (totalScore - maxWeight) * 0.2);

    // Categorize
    let category: 'high' | 'medium' | 'low' | 'neutral';
    if (score >= 0.7) category = 'high';
    else if (score >= 0.4) category = 'medium';
    else if (score >= 0.3) category = 'low';
    else category = 'neutral';

    // Generate reason
    const uniqueKeywords = [...new Set(detectedKeywords.map(d => d.keyword))];
    const reason = detectedKeywords.length === 0
      ? 'No emotional salience keywords detected'
      : `Detected ${detectedKeywords.length} salience keyword(s): ${uniqueKeywords.slice(0, 3).join(', ')}${uniqueKeywords.length > 3 ? '...' : ''}`;

    return {
      score,
      keywords: uniqueKeywords,
      category,
      reason
    };
  }

  /**
   * Calculate salience boost for memory activation
   */
  calculateBoost(salienceScore: number): {
    strengthMultiplier: number;
    decayReduction: number;
  } {
    if (salienceScore < this.config.minSalienceThreshold) {
      return { strengthMultiplier: 1.0, decayReduction: 0.0 };
    }

    // Strength multiplier: 1.0 to salienceBoostFactor (default: 2.0)
    const strengthMultiplier = 1.0 + (salienceScore * (this.config.salienceBoostFactor - 1.0));

    // Decay reduction: 0.0 to decaySlowdownFactor (default: 0.5)
    // Higher salience = slower decay
    const decayReduction = salienceScore * this.config.decaySlowdownFactor;

    return { strengthMultiplier, decayReduction };
  }

  /**
   * Score all observations for emotional salience
   */
  async scoreAllObservations(): Promise<SalienceScore[]> {
    if (!this.config.enableSalience) {
      return [];
    }

    try {
      // Fetch all observations (without time travel if not supported)
      const result = await this.db.run(`
        ?[id, text, entity_id] := *observation{id, text, entity_id}
      `);

      const scores: SalienceScore[] = [];

      for (const row of result.rows) {
        const [id, text, entityId] = row;
        const { score, keywords, category, reason } = this.calculateSalienceScore(text as string);
        const boost = this.calculateBoost(score);

        scores.push({
          observationId: id as string,
          text: text as string,
          salienceScore: score,
          detectedKeywords: keywords,
          category,
          boost,
          reason
        });
      }

      return scores.sort((a, b) => b.salienceScore - a.salienceScore);
    } catch (error) {
      console.error('[EmotionalSalience] Error scoring observations:', error);
      return [];
    }
  }

  /**
   * Apply salience metadata to observations
   */
  async applySalienceMetadata(dryRun: boolean = false): Promise<{
    updated: number;
    scores: SalienceScore[];
    dryRun: boolean;
  }> {
    const scores = await this.scoreAllObservations();
    const toUpdate = scores.filter(s => s.salienceScore >= this.config.minSalienceThreshold);

    if (dryRun) {
      return { updated: 0, scores: toUpdate, dryRun: true };
    }

    let updated = 0;

    for (const score of toUpdate) {
      try {
        // Update observation metadata with salience information
        await this.db.run(`
          ?[id, entity_id, text, metadata] := 
            *observation{id, entity_id, text, metadata},
            id = $id,
            new_metadata = {
              "emotional_salience": $salience_score,
              "salience_category": $category,
              "salience_keywords": $keywords,
              "salience_boost_strength": $strength_multiplier,
              "salience_boost_decay": $decay_reduction
            },
            metadata = if(is_null(metadata), new_metadata, concat(metadata, new_metadata))
          
          :put observation {id, entity_id, text, metadata}
        `, {
          id: score.observationId,
          salience_score: score.salienceScore,
          category: score.category,
          keywords: JSON.stringify(score.detectedKeywords),
          strength_multiplier: score.boost.strengthMultiplier,
          decay_reduction: score.boost.decayReduction
        });

        updated++;
      } catch (error) {
        console.error(`[EmotionalSalience] Error updating observation ${score.observationId}:`, error);
      }
    }

    return { updated, scores: toUpdate, dryRun: false };
  }

  /**
   * Get salience statistics
   */
  async getSalienceStats(): Promise<SalienceStats> {
    const scores = await this.scoreAllObservations();

    const distribution = {
      high: scores.filter(s => s.category === 'high').length,
      medium: scores.filter(s => s.category === 'medium').length,
      low: scores.filter(s => s.category === 'low').length,
      neutral: scores.filter(s => s.category === 'neutral').length
    };

    const averageSalience = scores.length > 0
      ? scores.reduce((sum, s) => sum + s.salienceScore, 0) / scores.length
      : 0;

    // Count keyword frequencies
    const keywordCounts = new Map<string, number>();
    for (const score of scores) {
      for (const keyword of score.detectedKeywords) {
        keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
      }
    }

    const topKeywords = Array.from(keywordCounts.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalObservations: scores.length,
      withSalience: scores.filter(s => s.salienceScore >= this.config.minSalienceThreshold).length,
      distribution,
      averageSalience,
      topKeywords
    };
  }

  /**
   * Get salience score for a specific observation
   */
  async getObservationSalience(observationId: string): Promise<SalienceScore | null> {
    try {
      const result = await this.db.run(`
        ?[id, text] := *observation{id, text}, id = $id
      `, { id: observationId });

      if (result.rows.length === 0) {
        return null;
      }

      const [id, text] = result.rows[0];
      const { score, keywords, category, reason } = this.calculateSalienceScore(text as string);
      const boost = this.calculateBoost(score);

      return {
        observationId: id as string,
        text: text as string,
        salienceScore: score,
        detectedKeywords: keywords,
        category,
        boost,
        reason
      };
    } catch (error) {
      console.error('[EmotionalSalience] Error getting observation salience:', error);
      return null;
    }
  }
}
