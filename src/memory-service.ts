import { DatabaseService } from './db-service.js';
import { EmbeddingService } from './embedding-service.js';
import { Entity, Observation, Relationship, SearchResult } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as fs from 'fs';

export class MemoryService {
  private db: DatabaseService;
  private embeddings: EmbeddingService;

  constructor(db: DatabaseService, embeddings: EmbeddingService) {
    this.db = db;
    this.embeddings = embeddings;
  }

  async createEntity(name: string, type: string, metadata: Record<string, any> = {}): Promise<Entity> {
    const id = uuidv4();
    const nameEmbedding = await this.embeddings.embed(name);
    const contentText = metadata.description ? name + '. ' + metadata.description : name;
    const contentEmbedding = await this.embeddings.embed(contentText);

    const entity: Entity = {
      id: id,
      name: name,
      type: type,
      embedding: contentEmbedding,
      name_embedding: nameEmbedding,
      metadata: metadata,
      created_at: Date.now(),
    };

    await this.db.createEntity(entity);
    return entity;
  }

  async getEntity(id: string, asOf?: string): Promise<Entity | null> {
    return this.db.getEntity(id, asOf);
  }

  async updateEntity(id: string, updates: Partial<Entity>): Promise<void> {
    await this.db.updateEntity(id, updates);
  }

  async deleteEntity(id: string): Promise<void> {
    await this.db.deleteEntity(id);
  }

  async addObservation(
    entityId: string,
    text: string,
    metadata: Record<string, any> = {}
  ): Promise<Observation> {
    const id = uuidv4();
    const embedding = await this.embeddings.embed(text);

    const observation: Observation = {
      id: id,
      entity_id: entityId,
      text: text,
      embedding: embedding,
      metadata: metadata,
      created_at: Date.now(),
    };

    await this.db.addObservation(observation);
    return observation;
  }

  async getObservations(entityId: string): Promise<Observation[]> {
    return this.db.getObservationsForEntity(entityId);
  }

  async createRelation(
    fromId: string,
    toId: string,
    relationType: string,
    strength: number = 1.0,
    metadata: Record<string, any> = {}
  ): Promise<Relationship> {
    if (fromId === toId) {
      throw new Error('Self-references are not allowed');
    }

    const relation: Relationship = {
      from_id: fromId,
      to_id: toId,
      relation_type: relationType,
      strength: strength,
      metadata: metadata,
      created_at: Date.now(),
    };

    await this.db.createRelation(relation);
    return relation;
  }

  async getRelations(fromId?: string, toId?: string): Promise<Relationship[]> {
    return this.db.getRelations(fromId, toId);
  }

  async search(
    query: string,
    limit: number = 10,
    entityTypes?: string[]
  ): Promise<SearchResult[]> {
    const queryEmbedding = await this.embeddings.embed(query);
    
    const vectorResults = await this.db.vectorSearchEntity(queryEmbedding, limit * 2);
    const keywordResults = await this.db.fullTextSearchEntity(query, limit * 2);
    
    const combined = this.reciprocalRankFusion(vectorResults, keywordResults, limit);
    
    if (entityTypes && entityTypes.length > 0) {
      return combined.filter(r => entityTypes.includes(r.entity.type));
    }
    
    return combined;
  }

  private reciprocalRankFusion(
    vectorResults: any[],
    keywordResults: any[],
    limit: number,
    k: number = 60
  ): SearchResult[] {
    const scores = new Map<string, { entity: any; score: number; sources: Set<string> }>();

    vectorResults.forEach((row: any[], index: number) => {
      const id = row[0];
      const rank = index + 1;
      const rrfScore = 1 / (k + rank);
      
      if (!scores.has(id)) {
        scores.set(id, {
          entity: {
            id: row[0],
            name: row[1],
            type: row[2],
            metadata: row[3],
          },
          score: 0,
          sources: new Set(),
        });
      }
      const entry = scores.get(id);
      if (entry) {
        entry.score += rrfScore;
        entry.sources.add('vector');
      }
    });

    keywordResults.forEach((row: any[], index: number) => {
      const id = row[0];
      const rank = index + 1;
      const rrfScore = 1 / (k + rank);
      
      if (!scores.has(id)) {
        scores.set(id, {
          entity: {
            id: row[0],
            name: row[1],
            type: row[2],
            metadata: row[3],
          },
          score: 0,
          sources: new Set(),
        });
      }
      const entry = scores.get(id);
      if (entry) {
        entry.score += rrfScore;
        entry.sources.add('keyword');
      }
    });

    const results: SearchResult[] = Array.from(scores.entries()).map(([id, data]) => ({
      entity: data.entity,
      score: data.score,
      source: data.sources.has('vector') && data.sources.has('keyword') 
        ? 'vector' 
        : (data.sources.has('vector') ? 'vector' : 'keyword'),
    }));

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  async getContext(query: string, contextWindow: number = 20): Promise<any> {
    const searchResults = await this.search(query, contextWindow);
    
    const entitiesWithObservations = await Promise.all(
      searchResults.map(async (result) => {
        const observations = await this.getObservations(result.entity.id);
        const relations = await this.getRelations(result.entity.id);
        
        return {
          ...result,
          observations: observations.slice(0, 5),
          relations: relations.slice(0, 5),
        };
      })
    );

    return {
      query: query,
      entities: entitiesWithObservations,
      total_entities: searchResults.length,
    };
  }

  async health(): Promise<any> {
    const stats = await this.db.getStats();
    const cacheStats = this.embeddings.getCacheStats();
    
    return {
      status: 'healthy',
      database: stats,
      cache: cacheStats,
      timestamp: new Date().toISOString(),
    };
  }

  async createSnapshot(metadata: Record<string, any> = {}): Promise<string> {
    const snapshotId = uuidv4();
    const stats = await this.db.getStats();
    
    console.error('[MemoryService] Snapshot created:', snapshotId, stats);
    
    return snapshotId;
  }

  async ingestFile(
    content: string,
    format: 'markdown' | 'json' | 'pdf',
    entityName: string,
    entityType: string = 'Document',
    chunking: 'none' | 'paragraphs' = 'paragraphs',
    filePath?: string
  ): Promise<any> {
    const searchResults = await this.search(entityName, 1);
    let entity: Entity;
    
    if (searchResults.length > 0 && searchResults[0].entity.name.toLowerCase() === entityName.toLowerCase()) {
      entity = searchResults[0].entity as Entity;
    } else {
      entity = await this.createEntity(entityName, entityType, { format: format });
    }

    let chunks: string[] = [];
    
    if (format === 'pdf') {
      try {
        let data: Uint8Array;
        
        // If filePath is provided, read from file
        if (filePath) {
          data = new Uint8Array(fs.readFileSync(filePath));
        } else {
          // Otherwise, assume content is base64
          const buffer = Buffer.from(content, 'base64');
          data = new Uint8Array(buffer);
        }
        
        const loadingTask = getDocument({ data });
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;
        
        const pageTextPromises = Array.from({ length: numPages }, async (_, i) => {
          const page = await pdf.getPage(i + 1);
          const textContent = await page.getTextContent();
          return textContent.items.map((item: any) => item.str).join(' ');
        });
        
        const pageTexts = await Promise.all(pageTextPromises);
        const text = pageTexts.join('\n');
        
        if (chunking === 'paragraphs') {
          chunks = text.split(/\n\s*\n/).filter((c: string) => c.trim().length > 0);
        } else {
          chunks = [text];
        }
      } catch (e) {
        console.error('[MemoryService] PDF parsing error:', e);
        throw new Error(`Failed to parse PDF: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (format === 'markdown') {
      // For markdown, also support file path
      let textContent = content;
      if (filePath) {
        textContent = fs.readFileSync(filePath, 'utf-8');
      }
      
      if (chunking === 'paragraphs') {
        chunks = textContent.split(/\n\s*\n/).filter((c: string) => c.trim().length > 0);
      } else {
        chunks = [textContent];
      }
    } else if (format === 'json') {
      let textContent = content;
      if (filePath) {
        textContent = fs.readFileSync(filePath, 'utf-8');
      }
      
      try {
        const data = JSON.parse(textContent);
        chunks = [JSON.stringify(data, null, 2)];
      } catch (e) {
        chunks = [textContent];
      }
    } else {
      chunks = [content];
    }

    const observations: Observation[] = [];
    const maxChunks = Math.min(chunks.length, 50);
    for (let i = 0; i < maxChunks; i++) {
      const chunk = chunks[i];
      const obs = await this.addObservation(entity.id, chunk, { 
        chunk_index: i,
        total_chunks: chunks.length,
      });
      observations.push(obs);
    }

    return {
      entity_id: entity.id,
      entity_name: entity.name,
      chunks_processed: observations.length,
      total_chunks: chunks.length,
    };
  }
}
