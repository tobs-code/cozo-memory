import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';

/**
 * Zettelkasten Memory Evolution Service
 * 
 * Inspired by A-MEM (2025) and Zettelkasten method, this service implements
 * retroactive memory refinement where new observations don't just accumulate,
 * but actively enrich and evolve existing memories through semantic connections.
 */

export interface ZettelkastenConfig {
  enableEvolution: boolean;
  similarityThreshold: number;
  maxRelatedNotes: number;
  minKeywordFrequency: number;
  autoExtractKeywords: boolean;
  autoBidirectionalLinks: boolean;
  enrichmentDepth: 'shallow' | 'deep';
}

export interface RelatedNote {
  observationId: string;
  entityId: string;
  text: string;
  similarity: number;
  sharedKeywords: string[];
  connectionType: 'semantic' | 'keyword' | 'entity' | 'temporal';
  reason: string;
}

export interface EnrichmentResult {
  observationId: string;
  relatedNotes: RelatedNote[];
  extractedKeywords: string[];
  addedTags: string[];
  createdLinks: number;
  updatedMetadata: Record<string, any>;
  evolutionSummary: string;
}

export interface EvolutionStats {
  totalObservations: number;
  enrichedObservations: number;
  totalLinks: number;
  averageLinksPerNote: number;
  topKeywords: Array<{ keyword: string; frequency: number }>;
  topTags: Array<{ tag: string; count: number }>;
  connectionTypes: {
    semantic: number;
    keyword: number;
    entity: number;
    temporal: number;
  };
}

export class ZettelkastenEvolutionService {
  private db: CozoDb;
  private embeddings: EmbeddingService;
  private config: ZettelkastenConfig;

  constructor(
    db: CozoDb,
    embeddings: EmbeddingService,
    config: Partial<ZettelkastenConfig> = {}
  ) {
    this.db = db;
    this.embeddings = embeddings;
    this.config = {
      enableEvolution: true,
      similarityThreshold: 0.7,
      maxRelatedNotes: 5,
      minKeywordFrequency: 2,
      autoExtractKeywords: true,
      autoBidirectionalLinks: true,
      enrichmentDepth: 'shallow',
      ...config
    };
  }

  private extractKeywords(text: string, minLength: number = 4): string[] {
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but',
      'in', 'with', 'to', 'for', 'of', 'as', 'by', 'this', 'that', 'it',
      'from', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can',
      'may', 'might', 'must', 'shall'
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => 
        word.length >= minLength && 
        !stopWords.has(word) &&
        !/^\d+$/.test(word)
      );

    const frequencies = new Map<string, number>();
    for (const word of words) {
      frequencies.set(word, (frequencies.get(word) || 0) + 1);
    }

    return Array.from(frequencies.entries())
      .filter(([_, count]) => count >= this.config.minKeywordFrequency)
      .sort((a, b) => b[1] - a[1])
      .map(([word, _]) => word)
      .slice(0, 10);
  }

  private extractTags(text: string): string[] {
    const tags: string[] = [];

    const hashtagMatches = text.match(/#\w+/g);
    if (hashtagMatches) {
      tags.push(...hashtagMatches.map(tag => tag.substring(1).toLowerCase()));
    }

    const patternMatches = text.match(/(?:category|type|topic|subject):\s*(\w+)/gi);
    if (patternMatches) {
      tags.push(...patternMatches.map(match => {
        const parts = match.split(':');
        return parts[1].trim().toLowerCase();
      }));
    }

    return [...new Set(tags)];
  }

  async findRelatedNotes(
    observationId: string,
    observationText: string,
    observationEmbedding: number[]
  ): Promise<RelatedNote[]> {
    try {
      const result = await this.db.run(`
        ?[id, entity_id, text, similarity] := 
          ~observation:semantic{id | 
            query: vec($embedding), 
            k: $k, 
            ef: 100,
            bind_distance: dist
          },
          *observation{id, entity_id, text, @ "NOW"},
          id != $exclude_id,
          similarity = 1.0 - dist
      `, {
        embedding: observationEmbedding,
        k: this.config.maxRelatedNotes + 5,
        exclude_id: observationId
      });

      const relatedNotes: RelatedNote[] = [];
      const observationKeywords = this.extractKeywords(observationText);

      for (const [id, entity_id, text, similarity] of result.rows) {
        const sim = similarity as number;
        
        if (sim < this.config.similarityThreshold) {
          continue;
        }

        const noteKeywords = this.extractKeywords(text as string);
        const sharedKeywords = observationKeywords.filter(k => noteKeywords.includes(k));

        let connectionType: 'semantic' | 'keyword' | 'entity' | 'temporal' = 'semantic';
        let reason = `High semantic similarity (${sim.toFixed(3)})`;

        if (sharedKeywords.length >= 2) {
          connectionType = 'keyword';
          reason = `Shared keywords: ${sharedKeywords.slice(0, 3).join(', ')}`;
        }

        relatedNotes.push({
          observationId: id as string,
          entityId: entity_id as string,
          text: text as string,
          similarity: sim,
          sharedKeywords,
          connectionType,
          reason
        });

        if (relatedNotes.length >= this.config.maxRelatedNotes) {
          break;
        }
      }

      return relatedNotes;
    } catch (error) {
      console.error('[ZettelkastenEvolution] Error finding related notes:', error);
      return [];
    }
  }

  async enrichObservation(
    observationId: string,
    observationText: string,
    observationEmbedding: number[],
    entityId: string
  ): Promise<EnrichmentResult> {
    if (!this.config.enableEvolution) {
      return {
        observationId,
        relatedNotes: [],
        extractedKeywords: [],
        addedTags: [],
        createdLinks: 0,
        updatedMetadata: {},
        evolutionSummary: 'Evolution disabled'
      };
    }

    try {
      const extractedKeywords = this.config.autoExtractKeywords 
        ? this.extractKeywords(observationText)
        : [];
      const addedTags = this.extractTags(observationText);

      const relatedNotes = await this.findRelatedNotes(
        observationId,
        observationText,
        observationEmbedding
      );

      let createdLinks = 0;
      if (this.config.autoBidirectionalLinks) {
        const now = Date.now() * 1000; // CozoDB Validity uses microseconds
        for (const related of relatedNotes) {
          try {
            await this.db.run(`
              ?[from_id, to_id, relation_type, created_at, strength, metadata] <- [[
                $from_id,
                $to_id,
                'zettelkasten_link',
                [${now}, true],
                $strength,
                {
                  "connection_type": $connection_type,
                  "shared_keywords": $shared_keywords,
                  "reason": $reason,
                  "auto_generated": true
                }
              ]]
              :put relationship {from_id, to_id, relation_type, created_at => strength, metadata}
            `, {
              from_id: observationId,
              to_id: related.observationId,
              strength: related.similarity,
              connection_type: related.connectionType,
              shared_keywords: JSON.stringify(related.sharedKeywords),
              reason: related.reason
            });

            await this.db.run(`
              ?[from_id, to_id, relation_type, created_at, strength, metadata] <- [[
                $from_id,
                $to_id,
                'zettelkasten_link',
                [${now}, true],
                $strength,
                {
                  "connection_type": $connection_type,
                  "shared_keywords": $shared_keywords,
                  "reason": $reason,
                  "auto_generated": true,
                  "bidirectional": true
                }
              ]]
              :put relationship {from_id, to_id, relation_type, created_at => strength, metadata}
            `, {
              from_id: related.observationId,
              to_id: observationId,
              strength: related.similarity,
              connection_type: related.connectionType,
              shared_keywords: JSON.stringify(related.sharedKeywords),
              reason: related.reason
            });

            createdLinks += 2;
          } catch (error) {
            console.error(`[ZettelkastenEvolution] Error creating link:`, error);
          }
        }
      }

      // Update metadata of related observations
      for (const related of relatedNotes) {
        try {
          const metaResult = await this.db.run(`
            ?[id, metadata] := *observation{id, metadata, @ "NOW"}, id = $id
          `, { id: related.observationId });

          if (metaResult.rows.length > 0) {
            const currentMetadata = (metaResult.rows[0][1] as Record<string, any>) || {};
            
            const existingKeywords = currentMetadata.zettelkasten_keywords || [];
            const enrichedKeywords = [...new Set([...existingKeywords, ...extractedKeywords])];

            const existingTags = currentMetadata.zettelkasten_tags || [];
            const enrichedTags = [...new Set([...existingTags, ...addedTags])];

            const existingRelated = currentMetadata.zettelkasten_related || [];
            const enrichedRelated = [...new Set([...existingRelated, observationId])];

            const mergedMetadata = {
              ...currentMetadata,
              zettelkasten_keywords: enrichedKeywords,
              zettelkasten_tags: enrichedTags,
              zettelkasten_related: enrichedRelated,
              zettelkasten_last_enriched: Date.now()
            };

            await this.db.run(`
              ?[id, created_at, entity_id, session_id, task_id, text, embedding, metadata] := 
                *observation{id, created_at, entity_id, session_id, task_id, text, embedding, @ "NOW"},
                id = $id,
                metadata = $new_metadata
              
              :put observation {id, created_at => entity_id, session_id, task_id, text, embedding, metadata}
            `, {
              id: related.observationId,
              new_metadata: mergedMetadata
            });
          }
        } catch (error) {
          console.error(`[ZettelkastenEvolution] Error enriching related note:`, error);
        }
      }

      const updatedMetadata = {
        zettelkasten_keywords: extractedKeywords,
        zettelkasten_tags: addedTags,
        zettelkasten_related: relatedNotes.map(n => n.observationId),
        zettelkasten_enriched: true,
        zettelkasten_timestamp: Date.now()
      };

      // Fetch current metadata and merge with new metadata
      const currentMetaResult = await this.db.run(`
        ?[metadata] := *observation{id, metadata, @ "NOW"}, id = $id
      `, { id: observationId });
      
      const existingMetadata = (currentMetaResult.rows[0]?.[0] as Record<string, any>) || {};
      const mergedMetadata = {
        ...existingMetadata,
        zettelkasten_keywords: extractedKeywords,
        zettelkasten_tags: addedTags,
        zettelkasten_related: relatedNotes.map(n => n.observationId),
        zettelkasten_enriched: true,
        zettelkasten_timestamp: Date.now()
      };

      await this.db.run(`
        ?[id, created_at, entity_id, session_id, task_id, text, embedding, metadata] := 
          *observation{id, created_at, entity_id, session_id, task_id, text, embedding, @ "NOW"},
          id = $id,
          metadata = $new_metadata
        
        :put observation {id, created_at => entity_id, session_id, task_id, text, embedding, metadata}
      `, {
        id: observationId,
        new_metadata: mergedMetadata
      });

      const evolutionSummary = `Enriched with ${extractedKeywords.length} keywords, ${addedTags.length} tags, ` +
        `${relatedNotes.length} related notes, ${createdLinks} bidirectional links`;

      return {
        observationId,
        relatedNotes,
        extractedKeywords,
        addedTags,
        createdLinks,
        updatedMetadata,
        evolutionSummary
      };
    } catch (error) {
      console.error('[ZettelkastenEvolution] Error enriching observation:', error);
      return {
        observationId,
        relatedNotes: [],
        extractedKeywords: [],
        addedTags: [],
        createdLinks: 0,
        updatedMetadata: {},
        evolutionSummary: 'Enrichment failed'
      };
    }
  }

  async getEvolutionStats(): Promise<EvolutionStats> {
    try {
      const totalResult = await this.db.run(`
        ?[count(id)] := *observation{id, @ "NOW"}
      `);
      const totalObservations = (totalResult.rows[0]?.[0] as number) || 0;

      const enrichedResult = await this.db.run(`
        ?[count(id)] := 
          *observation{id, metadata, @ "NOW"},
          metadata != null,
          metadata->'zettelkasten_enriched' == true
      `);
      const enrichedObservations = (enrichedResult.rows[0]?.[0] as number) || 0;

      const linksResult = await this.db.run(`
        ?[count(from_id)] := 
          *relationship{from_id, to_id, relation_type, @ "NOW"},
          relation_type == 'zettelkasten_link'
      `);
      const totalLinks = (linksResult.rows[0]?.[0] as number) || 0;

      const averageLinksPerNote = enrichedObservations > 0 
        ? totalLinks / enrichedObservations 
        : 0;

      return {
        totalObservations,
        enrichedObservations,
        totalLinks,
        averageLinksPerNote,
        topKeywords: [],
        topTags: [],
        connectionTypes: {
          semantic: 0,
          keyword: 0,
          entity: 0,
          temporal: 0
        }
      };
    } catch (error) {
      console.error('[ZettelkastenEvolution] Error getting stats:', error);
      return {
        totalObservations: 0,
        enrichedObservations: 0,
        totalLinks: 0,
        averageLinksPerNote: 0,
        topKeywords: [],
        topTags: [],
        connectionTypes: {
          semantic: 0,
          keyword: 0,
          entity: 0,
          temporal: 0
        }
      };
    }
  }
}
