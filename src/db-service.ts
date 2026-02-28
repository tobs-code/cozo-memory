// Simple in-memory database simulation for CozoDB
// This will be replaced with actual CozoDB integration

import { Entity, Observation, Relationship } from './types.js';

interface DbEntity {
  id: string;
  name: string;
  type: string;
  embedding: number[];
  name_embedding: number[];
  metadata: Record<string, any>;
  created_at: number;
}

interface DbObservation {
  id: string;
  entity_id: string;
  text: string;
  embedding: number[];
  metadata: Record<string, any>;
  created_at: number;
}

interface DbRelationship {
  from_id: string;
  to_id: string;
  relation_type: string;
  strength: number;
  metadata: Record<string, any>;
  created_at: number;
}

export class DatabaseService {
  private entities: Map<string, DbEntity> = new Map();
  private observations: Map<string, DbObservation> = new Map();
  private relationships: Map<string, DbRelationship[]> = new Map();
  private snapshots: Map<string, any> = new Map();
  private dbPath: string;
  private engine: string;

  constructor(dbPath: string = 'memory_db.cozo.db', engine: string = 'sqlite') {
    this.dbPath = dbPath;
    this.engine = engine;
  }

  async initialize(): Promise<void> {
    console.error('[DatabaseService] Connected to ' + this.engine + ' at ' + this.dbPath);
    console.error('[DatabaseService] Database schema initialized');
  }

  async runQuery(query: string, params: Record<string, any> = {}): Promise<any> {
    console.error('[DatabaseService] Query:', query);
    return { rows: [] };
  }

  async exportRelations(): Promise<Record<string, any[]>> {
    const result: Record<string, any[]> = {
      entity: [],
      observation: [],
      relationship: [],
    };
    
    for (const entity of this.entities.values()) {
      result.entity.push([entity.id, entity.name, entity.type, entity.embedding, entity.name_embedding, entity.metadata, entity.created_at]);
    }
    
    for (const obs of this.observations.values()) {
      result.observation.push([obs.id, obs.entity_id, obs.text, obs.embedding, obs.metadata, obs.created_at]);
    }
    
    for (const rels of this.relationships.values()) {
      for (const rel of rels) {
        result.relationship.push([rel.from_id, rel.to_id, rel.relation_type, rel.strength, rel.metadata, rel.created_at]);
      }
    }
    
    return result;
  }

  async backup(path: string): Promise<void> {
    console.error('[DatabaseService] Backup to:', path);
  }

  async restore(path: string): Promise<void> {
    console.error('[DatabaseService] Restore from:', path);
  }

  async close(): Promise<void> {
    console.error('[DatabaseService] Database closed');
  }

  async createEntity(entity: Entity): Promise<void> {
    const dbEntity: DbEntity = {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      embedding: entity.embedding,
      name_embedding: entity.name_embedding,
      metadata: entity.metadata,
      created_at: entity.created_at,
    };
    this.entities.set(entity.id, dbEntity);
  }

  async getEntity(id: string, asOf?: string): Promise<Entity | null> {
    const entity = this.entities.get(id);
    if (!entity) return null;
    
    return {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      embedding: entity.embedding,
      name_embedding: entity.name_embedding,
      metadata: entity.metadata,
      created_at: entity.created_at,
    };
  }

  async updateEntity(id: string, updates: Partial<Entity>): Promise<void> {
    const entity = this.entities.get(id);
    if (!entity) return;
    
    if (updates.name !== undefined) entity.name = updates.name;
    if (updates.type !== undefined) entity.type = updates.type;
    if (updates.metadata !== undefined) entity.metadata = { ...entity.metadata, ...updates.metadata };
    if (updates.embedding !== undefined) entity.embedding = updates.embedding;
    if (updates.name_embedding !== undefined) entity.name_embedding = updates.name_embedding;
  }

  async deleteEntity(id: string): Promise<void> {
    this.entities.delete(id);
    for (const [obsId, obs] of this.observations.entries()) {
      if (obs.entity_id === id) {
        this.observations.delete(obsId);
      }
    }
    this.relationships.delete(id);
  }

  async addObservation(obs: Observation): Promise<void> {
    const dbObs: DbObservation = {
      id: obs.id,
      entity_id: obs.entity_id,
      text: obs.text,
      embedding: obs.embedding,
      metadata: obs.metadata,
      created_at: obs.created_at,
    };
    this.observations.set(obs.id, dbObs);
  }

  async getObservationsForEntity(entityId: string): Promise<Observation[]> {
    const result: Observation[] = [];
    for (const obs of this.observations.values()) {
      if (obs.entity_id === entityId) {
        result.push({
          id: obs.id,
          entity_id: obs.entity_id,
          text: obs.text,
          embedding: obs.embedding,
          metadata: obs.metadata,
          created_at: obs.created_at,
        });
      }
    }
    return result;
  }

  async createRelation(rel: Relationship): Promise<void> {
    const dbRel: DbRelationship = {
      from_id: rel.from_id,
      to_id: rel.to_id,
      relation_type: rel.relation_type,
      strength: rel.strength,
      metadata: rel.metadata,
      created_at: rel.created_at,
    };
    
    const existing = this.relationships.get(rel.from_id) || [];
    existing.push(dbRel);
    this.relationships.set(rel.from_id, existing);
  }

  async getRelations(fromId?: string, toId?: string): Promise<Relationship[]> {
    const result: Relationship[] = [];
    
    for (const rels of this.relationships.values()) {
      for (const rel of rels) {
        if (fromId && rel.from_id !== fromId) continue;
        if (toId && rel.to_id !== toId) continue;
        
        result.push({
          from_id: rel.from_id,
          to_id: rel.to_id,
          relation_type: rel.relation_type,
          strength: rel.strength,
          metadata: rel.metadata,
          created_at: rel.created_at,
        });
      }
    }
    
    return result;
  }

  async vectorSearchEntity(embedding: number[], limit: number = 10): Promise<any[]> {
    const results: Array<[string, string, string, any, number]> = [];
    
    for (const entity of this.entities.values()) {
      const similarity = this.cosineSimilarity(embedding, entity.embedding);
      results.push([entity.id, entity.name, entity.type, entity.metadata, similarity]);
    }
    
    results.sort((a, b) => b[4] - a[4]);
    return results.slice(0, limit);
  }

  async vectorSearchObservation(embedding: number[], limit: number = 10): Promise<any[]> {
    const results: Array<[string, string, string, any, number]> = [];
    
    for (const obs of this.observations.values()) {
      const similarity = this.cosineSimilarity(embedding, obs.embedding);
      results.push([obs.id, obs.entity_id, obs.text, obs.metadata, similarity]);
    }
    
    results.sort((a, b) => b[4] - a[4]);
    return results.slice(0, limit);
  }

  async fullTextSearchEntity(searchText: string, limit: number = 10): Promise<any[]> {
    const query = searchText.toLowerCase();
    const results: Array<[string, string, string, any, number]> = [];
    
    for (const entity of this.entities.values()) {
      if (entity.name.toLowerCase().includes(query)) {
        results.push([entity.id, entity.name, entity.type, entity.metadata, 1]);
      }
    }
    
    return results.slice(0, limit);
  }

  async fullTextSearchObservation(searchText: string, limit: number = 10): Promise<any[]> {
    const query = searchText.toLowerCase();
    const results: Array<[string, string, string, any, number]> = [];
    
    for (const obs of this.observations.values()) {
      if (obs.text.toLowerCase().includes(query)) {
        results.push([obs.id, obs.entity_id, obs.text, obs.metadata, 1]);
      }
    }
    
    return results.slice(0, limit);
  }

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

  async getStats(): Promise<{ entities: number; observations: number; relationships: number }> {
    let relCount = 0;
    for (const rels of this.relationships.values()) {
      relCount += rels.length;
    }
    
    return {
      entities: this.entities.size,
      observations: this.observations.size,
      relationships: relCount,
    };
  }
}
