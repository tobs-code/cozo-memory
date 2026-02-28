/**
 * Shared CLI command logic for both pure CLI and TUI
 * Calls MemoryServer public methods directly
 */

import { MemoryServer } from './index.js';

export class CLICommands {
  public server: MemoryServer;
  private initialized: boolean = false;

  constructor() {
    this.server = new MemoryServer();
  }

  async init(): Promise<void> {
    if (!this.initialized) {
      await this.server.initPromise;
      this.initialized = true;
    }
  }

  async close(): Promise<void> {
    // CozoDB handles cleanup automatically
  }

  // Entity operations - use db directly
  async createEntity(name: string, type: string, metadata?: Record<string, any>): Promise<any> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    
    const content = name + " " + type;
    const embedding = await this.server.embeddingService.embed(content);
    const nameEmbedding = await this.server.embeddingService.embed(name);
    
    const now = Date.now() * 1000; // microseconds
    const nowIso = new Date().toISOString();
    
    await this.server.db.run(
      `
        ?[id, created_at, name, type, embedding, name_embedding, metadata] <- [
          [$id, "ASSERT", $name, $type, [${embedding.join(",")}], [${nameEmbedding.join(",")}], $metadata]
        ] :put entity {id, created_at => name, type, embedding, name_embedding, metadata}
      `,
      { id, name, type, metadata: metadata || {} }
    );
    
    return { id, name, type, metadata, created_at: now, created_at_iso: nowIso, status: "Entity created" };
  }

  async getEntity(entityId: string): Promise<any> {
    const entityRes = await this.server.db.run(
      '?[id, name, type, metadata, ts] := *entity{id, name, type, metadata, created_at, @ "NOW"}, id = $id, ts = to_int(created_at)',
      { id: entityId }
    );
    
    if (entityRes.rows.length === 0) {
      throw new Error("Entity not found");
    }
    
    const obsRes = await this.server.db.run(
      '?[id, text, metadata, ts] := *observation{id, entity_id, text, metadata, created_at, @ "NOW"}, entity_id = $id, ts = to_int(created_at)',
      { id: entityId }
    );
    
    const relRes = await this.server.db.run(
      `
        ?[target_id, type, strength, metadata, direction] := *relationship{from_id, to_id, relation_type: type, strength, metadata, @ "NOW"}, from_id = $id, target_id = to_id, direction = 'outgoing'
        ?[target_id, type, strength, metadata, direction] := *relationship{from_id, to_id, relation_type: type, strength, metadata, @ "NOW"}, to_id = $id, target_id = from_id, direction = 'incoming'
      `,
      { id: entityId }
    );

    return {
      entity: {
        id: entityRes.rows[0][0],
        name: entityRes.rows[0][1],
        type: entityRes.rows[0][2],
        metadata: entityRes.rows[0][3],
        created_at: entityRes.rows[0][4]
      },
      observations: obsRes.rows.map((r: any) => ({ id: r[0], text: r[1], metadata: r[2], created_at: r[3] })),
      relations: relRes.rows.map((r: any) => ({ target_id: r[0], type: r[1], strength: r[2], metadata: r[3], direction: r[4] }))
    };
  }

  async deleteEntity(entityId: string): Promise<any> {
    await this.server.db.run(
      `
        { ?[id, created_at] := *observation{id, entity_id, created_at}, entity_id = $target_id :rm observation {id, created_at} }
        { ?[from_id, to_id, relation_type, created_at] := *relationship{from_id, to_id, relation_type, created_at}, from_id = $target_id :rm relationship {from_id, to_id, relation_type, created_at} }
        { ?[from_id, to_id, relation_type, created_at] := *relationship{from_id, to_id, relation_type, created_at}, to_id = $target_id :rm relationship {from_id, to_id, relation_type, created_at} }
        { ?[id, created_at] := *entity{id, created_at}, id = $target_id :rm entity {id, created_at} }
      `,
      { target_id: entityId }
    );
    
    return { status: "Entity and related data deleted" };
  }

  // Observation operations
  async addObservation(
    entityId: string, 
    text: string, 
    metadata?: Record<string, any>
  ): Promise<any> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    
    const embedding = await this.server.embeddingService.embed(text);
    const now = Date.now() * 1000;
    const nowIso = new Date().toISOString();
    
    await this.server.db.run(
      `
        ?[id, created_at, entity_id, text, embedding, metadata] <- [
          [$id, "ASSERT", $entity_id, $text, [${embedding.join(",")}], $metadata]
        ] :put observation {id, created_at => entity_id, text, embedding, metadata}
      `,
      { id, entity_id: entityId, text, metadata: metadata || {} }
    );
    
    return { id, entity_id: entityId, text, metadata, created_at: now, created_at_iso: nowIso, status: "Observation added" };
  }

  // Relation operations
  async createRelation(
    fromId: string,
    toId: string,
    relationType: string,
    strength?: number,
    metadata?: Record<string, any>
  ): Promise<any> {
    const str = strength !== undefined ? strength : 1.0;
    const now = Date.now() * 1000;
    const nowIso = new Date().toISOString();
    
    await this.server.db.run(
      `
        ?[from_id, to_id, relation_type, created_at, strength, metadata] <- [
          [$from_id, $to_id, $relation_type, "ASSERT", $strength, $metadata]
        ] :put relationship {from_id, to_id, relation_type, created_at => strength, metadata}
      `,
      { from_id: fromId, to_id: toId, relation_type: relationType, strength: str, metadata: metadata || {} }
    );
    
    return { from_id: fromId, to_id: toId, relation_type: relationType, strength: str, metadata, created_at: now, created_at_iso: nowIso, status: "Relation created" };
  }

  // Search operations - use the MCP tool directly
  async search(
    query: string,
    limit: number = 10,
    entityTypes?: string[],
    includeEntities: boolean = true,
    includeObservations: boolean = true
  ): Promise<any> {
    // Call the search method from the server's query_memory tool
    const result = await this.server.hybridSearch.search({
      query,
      limit,
      entityTypes,
      includeEntities,
      includeObservations
    });
    
    // If result is empty or has issues, return it as-is
    return result;
  }

  async advancedSearch(params: any): Promise<any> {
    return await this.server.advancedSearch(params);
  }

  async context(query: string, contextWindow?: number, timeRangeHours?: number): Promise<any> {
    // Use advancedSearch with appropriate parameters
    return await this.server.advancedSearch({
      query,
      limit: contextWindow || 10,
      timeRangeHours
    });
  }

  // Graph operations
  async explore(
    startEntity: string,
    endEntity?: string,
    maxHops?: number,
    relationTypes?: string[]
  ): Promise<any> {
    // Use graph_walking or advancedSearch
    if (endEntity) {
      // Path finding
      return await this.server.computeShortestPath({
        start_entity: startEntity,
        end_entity: endEntity
      });
    } else {
      // Graph exploration - use advancedSearch with graph constraints
      return await this.server.advancedSearch({
        query: '',
        graphConstraints: {
          maxDepth: maxHops || 3,
          requiredRelations: relationTypes,
          targetEntityIds: [startEntity]
        }
      });
    }
  }

  async pagerank(): Promise<any> {
    return await this.server.recomputePageRank();
  }

  async communities(): Promise<any> {
    return await this.server.recomputeCommunities();
  }

  // System operations
  async health(): Promise<any> {
    const entityCount = await this.server.db.run('?[count(id)] := *entity{id, @ "NOW"}');
    const obsCount = await this.server.db.run('?[count(id)] := *observation{id, @ "NOW"}');
    const relCount = await this.server.db.run('?[count(from_id)] := *relationship{from_id, @ "NOW"}');
    
    return {
      status: "healthy",
      entities: entityCount.rows[0][0],
      observations: obsCount.rows[0][0],
      relationships: relCount.rows[0][0]
    };
  }

  async metrics(): Promise<any> {
    // Access private metrics via type assertion
    return (this.server as any).metrics;
  }

  async exportMemory(format: 'json' | 'markdown' | 'obsidian', options?: any): Promise<any> {
    const { ExportImportService } = await import('./export-import-service.js');
    
    // Create a simple wrapper that implements DbService interface
    const dbService = {
      run: async (query: string, params?: any) => {
        return await this.server.db.run(query, params);
      }
    };
    
    const exportService = new ExportImportService(dbService);
    
    return await exportService.exportMemory({
      format,
      includeMetadata: options?.includeMetadata,
      includeRelationships: options?.includeRelationships,
      includeObservations: options?.includeObservations,
      entityTypes: options?.entityTypes,
      since: options?.since
    });
  }

  async importMemory(data: any, sourceFormat: string, options?: any): Promise<any> {
    const { ExportImportService } = await import('./export-import-service.js');
    
    // Create a simple wrapper that implements DbService interface
    const dbService = {
      run: async (query: string, params?: any) => {
        return await this.server.db.run(query, params);
      }
    };
    
    const exportService = new ExportImportService(dbService);
    
    return await exportService.importMemory(data, {
      sourceFormat: sourceFormat as any,
      mergeStrategy: options?.mergeStrategy || 'skip',
      defaultEntityType: options?.defaultEntityType
    });
  }

  async ingestFile(
    entityId: string,
    format: 'markdown' | 'json' | 'pdf',
    filePath?: string,
    content?: string,
    options?: any
  ): Promise<any> {
    // This would need to be implemented similar to the MCP tool
    // For now, return a placeholder
    return { status: "not_implemented", message: "Use MCP server for file ingestion" };
  }

  async editUserProfile(args: {
    name?: string;
    type?: string;
    metadata?: any;
    observations?: Array<{ text: string; metadata?: any }>;
    clear_observations?: boolean;
  }): Promise<any> {
    return await this.server.editUserProfile(args);
  }

  async getUserProfile(): Promise<any> {
    return await this.server.editUserProfile({});
  }
}
