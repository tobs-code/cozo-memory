import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { Readable } from 'stream';

interface DbService {
  run(query: string, params?: any): Promise<any>;
}

interface ExportOptions {
  format: 'json' | 'markdown' | 'obsidian';
  includeMetadata?: boolean;
  includeRelationships?: boolean;
  includeObservations?: boolean;
  entityTypes?: string[];
  since?: number; // timestamp
}

interface ImportOptions {
  sourceFormat: 'mem0' | 'memgpt' | 'markdown' | 'cozo';
  mergeStrategy?: 'skip' | 'overwrite' | 'merge';
  defaultEntityType?: string;
}

export class ExportImportService {
  constructor(private dbService: DbService) {}

  /**
   * Export memory to various formats
   */
  async exportMemory(options: ExportOptions): Promise<{
    format: string;
    data?: any;
    zipBuffer?: Buffer;
    stats: {
      entities: number;
      observations: number;
      relationships: number;
    };
  }> {
    console.error('[Export] Starting export with format:', options.format);

    // Fetch all data
    const entities = await this.fetchEntities(options);
    const observations = options.includeObservations !== false 
      ? await this.fetchObservations(options) 
      : [];
    const relationships = options.includeRelationships !== false 
      ? await this.fetchRelationships(options) 
      : [];

    const stats = {
      entities: entities.length,
      observations: observations.length,
      relationships: relationships.length,
    };

    console.error('[Export] Fetched data:', stats);

    switch (options.format) {
      case 'json':
        return {
          format: 'json',
          data: this.exportToJSON(entities, observations, relationships, options),
          stats,
        };

      case 'markdown':
        return {
          format: 'markdown',
          data: this.exportToMarkdown(entities, observations, relationships, options),
          stats,
        };

      case 'obsidian':
        const zipBuffer = await this.exportToObsidianZip(entities, observations, relationships, options);
        return {
          format: 'obsidian',
          zipBuffer,
          stats,
        };

      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  /**
   * Import memory from various formats
   */
  async importMemory(
    data: string | any,
    options: ImportOptions
  ): Promise<{
    imported: {
      entities: number;
      observations: number;
      relationships: number;
    };
    skipped: number;
    errors: string[];
  }> {
    console.error('[Import] Starting import from format:', options.sourceFormat);

    const result = {
      imported: { entities: 0, observations: 0, relationships: 0 },
      skipped: 0,
      errors: [] as string[],
    };

    try {
      switch (options.sourceFormat) {
        case 'mem0':
          return await this.importFromMem0(data, options, result);
        
        case 'memgpt':
          return await this.importFromMemGPT(data, options, result);
        
        case 'markdown':
          return await this.importFromMarkdown(data, options, result);
        
        case 'cozo':
          return await this.importFromCozoJSON(data, options, result);
        
        default:
          throw new Error(`Unsupported import format: ${options.sourceFormat}`);
      }
    } catch (error) {
      result.errors.push(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }
  }

  // ============================================================================
  // FETCH DATA
  // ============================================================================

  private async fetchEntities(options: ExportOptions): Promise<any[]> {
    let query = `?[id, name, type, metadata, created_at] := *entity{id, name, type, metadata, created_at @ "NOW"}`;
    
    if (options.entityTypes && options.entityTypes.length > 0) {
      const typeFilter = options.entityTypes.map(t => `"${t}"`).join(', ');
      query += `, type in [${typeFilter}]`;
    }
    
    if (options.since) {
      query += `, created_at >= ${options.since}`;
    }

    const result = await this.dbService.run(query);
    return result.rows || [];
  }

  private async fetchObservations(options: ExportOptions): Promise<any[]> {
    let query = `?[id, entity_id, text, metadata, created_at] := *observation{id, entity_id, text, metadata, created_at @ "NOW"}`;
    
    if (options.since) {
      query += `, created_at >= ${options.since}`;
    }

    const result = await this.dbService.run(query);
    return result.rows || [];
  }

  private async fetchRelationships(options: ExportOptions): Promise<any[]> {
    let query = `?[from_id, to_id, relation_type, strength, metadata, created_at] := *relationship{from_id, to_id, relation_type, strength, metadata, created_at @ "NOW"}`;
    
    if (options.since) {
      query += `, created_at >= ${options.since}`;
    }

    const result = await this.dbService.run(query);
    return result.rows || [];
  }

  // ============================================================================
  // EXPORT FORMATS
  // ============================================================================

  private exportToJSON(entities: any[], observations: any[], relationships: any[], options: ExportOptions): any {
    return {
      version: '1.0',
      exported_at: new Date().toISOString(),
      format: 'cozo-memory',
      data: {
        entities: entities.map(([id, name, type, metadata, created_at]) => ({
          id,
          name,
          type,
          metadata: options.includeMetadata !== false ? metadata : undefined,
          created_at,
        })),
        observations: observations.map(([id, entity_id, text, metadata, created_at]) => ({
          id,
          entity_id,
          text,
          metadata: options.includeMetadata !== false ? metadata : undefined,
          created_at,
        })),
        relationships: relationships.map(([from_id, to_id, relation_type, strength, metadata, created_at]) => ({
          from_id,
          to_id,
          relation_type,
          strength,
          metadata: options.includeMetadata !== false ? metadata : undefined,
          created_at,
        })),
      },
    };
  }

  private exportToMarkdown(entities: any[], observations: any[], relationships: any[], options: ExportOptions): string {
    let md = `# Memory Export\n\n`;
    md += `Exported: ${new Date().toISOString()}\n\n`;
    md += `## Statistics\n\n`;
    md += `- Entities: ${entities.length}\n`;
    md += `- Observations: ${observations.length}\n`;
    md += `- Relationships: ${relationships.length}\n\n`;

    md += `---\n\n`;

    for (const [id, name, type, metadata, created_at] of entities) {
      md += `## ${name}\n\n`;
      md += `**Type:** ${type}\n\n`;
      md += `**ID:** \`${id}\`\n\n`;
      
      if (options.includeMetadata !== false && metadata && Object.keys(metadata).length > 0) {
        md += `**Metadata:**\n\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\`\n\n`;
      }

      // Find observations for this entity
      const entityObs = observations.filter(([, entity_id]) => entity_id === id);
      if (entityObs.length > 0) {
        md += `### Observations\n\n`;
        for (const [obs_id, , text] of entityObs) {
          md += `- ${text}\n`;
        }
        md += `\n`;
      }

      // Find relationships
      const entityRels = relationships.filter(([from_id]) => from_id === id);
      if (entityRels.length > 0) {
        md += `### Relationships\n\n`;
        for (const [, to_id, relation_type] of entityRels) {
          const targetEntity = entities.find(([eid]) => eid === to_id);
          const targetName = targetEntity ? targetEntity[1] : to_id;
          md += `- **${relation_type}** → ${targetName}\n`;
        }
        md += `\n`;
      }

      md += `---\n\n`;
    }

    return md;
  }

  private async exportToObsidianZip(
    entities: any[],
    observations: any[],
    relationships: any[],
    options: ExportOptions
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const chunks: Buffer[] = [];

      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      // Create README
      archive.append(
        `# Memory Vault\n\nExported from CozoDB Memory on ${new Date().toISOString()}\n\n` +
        `## Statistics\n\n- Entities: ${entities.length}\n- Observations: ${observations.length}\n- Relationships: ${relationships.length}\n`,
        { name: 'README.md' }
      );

      // Create entity notes
      for (const [id, name, type, metadata, created_at] of entities) {
        const safeName = this.sanitizeFilename(name);
        let content = `---\n`;
        content += `id: ${id}\n`;
        content += `type: ${type}\n`;
        // CozoDB timestamps are in microseconds, convert to milliseconds for Date
        const timestamp = typeof created_at === 'number' ? created_at / 1000 : Date.now();
        content += `created: ${new Date(timestamp).toISOString()}\n`;
        
        if (options.includeMetadata !== false && metadata && Object.keys(metadata).length > 0) {
          for (const [key, value] of Object.entries(metadata)) {
            content += `${key}: ${JSON.stringify(value)}\n`;
          }
        }
        
        content += `---\n\n`;
        content += `# ${name}\n\n`;

        // Add observations
        const entityObs = observations.filter(([, entity_id]) => entity_id === id);
        if (entityObs.length > 0) {
          content += `## Notes\n\n`;
          for (const [, , text] of entityObs) {
            content += `- ${text}\n`;
          }
          content += `\n`;
        }

        // Add relationships with wiki-links
        const outgoing = relationships.filter(([from_id]) => from_id === id);
        const incoming = relationships.filter(([, to_id]) => to_id === id);

        if (outgoing.length > 0) {
          content += `## Connections\n\n`;
          for (const [, to_id, relation_type] of outgoing) {
            const targetEntity = entities.find(([eid]) => eid === to_id);
            if (targetEntity) {
              const targetName = this.sanitizeFilename(targetEntity[1]);
              content += `- **${relation_type}**: [[${targetName}]]\n`;
            }
          }
          content += `\n`;
        }

        if (incoming.length > 0) {
          content += `## Referenced By\n\n`;
          for (const [from_id, , relation_type] of incoming) {
            const sourceEntity = entities.find(([eid]) => eid === from_id);
            if (sourceEntity) {
              const sourceName = this.sanitizeFilename(sourceEntity[1]);
              content += `- [[${sourceName}]] (**${relation_type}**)\n`;
            }
          }
          content += `\n`;
        }

        archive.append(content, { name: `${safeName}.md` });
      }

      archive.finalize();
    });
  }

  // ============================================================================
  // IMPORT FORMATS
  // ============================================================================

  private async importFromMem0(data: any, options: ImportOptions, result: any): Promise<any> {
    const memories = typeof data === 'string' ? JSON.parse(data) : data;
    const memoryArray = Array.isArray(memories) ? memories : [memories];

    for (const mem of memoryArray) {
      try {
        // Mem0 format: { id, memory, user_id, metadata, created_at }
        const entityName = mem.user_id || 'Imported User';
        const entityType = options.defaultEntityType || 'Person';

        // Check if entity exists
        const existingEntity = await this.findEntityByName(entityName);
        let entityId: string;

        if (existingEntity) {
          entityId = existingEntity;
          if (options.mergeStrategy === 'skip') {
            result.skipped++;
            continue;
          }
        } else {
          // Create entity
          entityId = await this.createEntity(entityName, entityType, mem.metadata || {});
          result.imported.entities++;
        }

        // Add observation
        await this.createObservation(entityId, mem.memory, mem.metadata || {});
        result.imported.observations++;

      } catch (error) {
        result.errors.push(`Failed to import Mem0 entry: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return result;
  }

  private async importFromMemGPT(data: any, options: ImportOptions, result: any): Promise<any> {
    const memgptData = typeof data === 'string' ? JSON.parse(data) : data;

    // MemGPT has archival_memory and recall_memory
    const archival = memgptData.archival_memory || [];
    const recall = memgptData.recall_memory || [];

    // Create MemGPT agent entity
    const agentName = memgptData.agent_name || 'MemGPT Agent';
    const entityId = await this.createEntity(agentName, 'Agent', { source: 'memgpt' });
    result.imported.entities++;

    // Import archival memory
    for (const item of archival) {
      try {
        await this.createObservation(entityId, item.content || item.text || item, { 
          type: 'archival',
          timestamp: item.timestamp 
        });
        result.imported.observations++;
      } catch (error) {
        result.errors.push(`Failed to import MemGPT archival: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Import recall memory
    for (const item of recall) {
      try {
        await this.createObservation(entityId, item.content || item.text || item, { 
          type: 'recall',
          timestamp: item.timestamp 
        });
        result.imported.observations++;
      } catch (error) {
        result.errors.push(`Failed to import MemGPT recall: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return result;
  }

  private async importFromMarkdown(data: string, options: ImportOptions, result: any): Promise<any> {
    // Simple markdown parser: split by ## headers
    const sections = data.split(/^## /m).filter(s => s.trim());

    for (const section of sections) {
      try {
        const lines = section.split('\n');
        const name = lines[0].trim();
        
        if (!name || name === 'Statistics') continue;

        const entityType = options.defaultEntityType || 'Note';
        const entityId = await this.createEntity(name, entityType, { source: 'markdown' });
        result.imported.entities++;

        // Extract observations (lines starting with -)
        const observations = lines.filter(l => l.trim().startsWith('-')).map(l => l.trim().substring(1).trim());
        
        for (const obs of observations) {
          if (obs) {
            await this.createObservation(entityId, obs, {});
            result.imported.observations++;
          }
        }

      } catch (error) {
        result.errors.push(`Failed to import markdown section: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return result;
  }

  private async importFromCozoJSON(data: any, options: ImportOptions, result: any): Promise<any> {
    const cozoData = typeof data === 'string' ? JSON.parse(data) : data;
    
    if (!cozoData.data) {
      throw new Error('Invalid Cozo export format');
    }

    const { entities, observations, relationships } = cozoData.data;

    // Import entities
    for (const entity of entities || []) {
      try {
        if (options.mergeStrategy === 'skip') {
          const existing = await this.findEntityById(entity.id);
          if (existing) {
            result.skipped++;
            continue;
          }
        }

        await this.createEntityWithId(entity.id, entity.name, entity.type, entity.metadata || {});
        result.imported.entities++;
      } catch (error) {
        result.errors.push(`Failed to import entity ${entity.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Import observations
    for (const obs of observations || []) {
      try {
        await this.createObservationWithId(obs.id, obs.entity_id, obs.text, obs.metadata || {});
        result.imported.observations++;
      } catch (error) {
        result.errors.push(`Failed to import observation: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Import relationships
    for (const rel of relationships || []) {
      try {
        await this.createRelationship(rel.from_id, rel.to_id, rel.relation_type, rel.strength || 1.0, rel.metadata || {});
        result.imported.relationships++;
      } catch (error) {
        result.errors.push(`Failed to import relationship: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return result;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim();
  }

  private async findEntityByName(name: string): Promise<string | null> {
    const result = await this.dbService.run(
      `?[id] := *entity{id, name @ "NOW"}, name == "${name}"`
    );
    return result.rows && result.rows.length > 0 ? result.rows[0][0] : null;
  }

  private async findEntityById(id: string): Promise<boolean> {
    const result = await this.dbService.run(
      `?[id] := *entity{id @ "NOW"}, id == "${id}"`
    );
    return result.rows && result.rows.length > 0;
  }

  private async createEntity(name: string, type: string, metadata: any): Promise<string> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    await this.createEntityWithId(id, name, type, metadata);
    return id;
  }

  private async createEntityWithId(id: string, name: string, type: string, metadata: any): Promise<void> {
    const now = Date.now() * 1000;
    const zeroVec = new Array(1024).fill(0);
    
    // Escape strings properly for CozoDB
    const escapedName = name.replace(/"/g, '\\"');
    const escapedType = type.replace(/"/g, '\\"');
    
    await this.dbService.run(`
      ?[id, name, type, embedding, name_embedding, metadata, created_at] <- [[$id, $name, $type, $embedding, $name_embedding, $metadata, [${now}, true]]]
      :insert entity {id, name, type, embedding, name_embedding, metadata, created_at}
    `, {
      id,
      name: escapedName,
      type: escapedType,
      embedding: zeroVec,
      name_embedding: zeroVec,
      metadata: metadata || {}
    });
  }

  private async createObservation(entityId: string, text: string, metadata: any): Promise<string> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    await this.createObservationWithId(id, entityId, text, metadata);
    return id;
  }

  private async createObservationWithId(id: string, entityId: string, text: string, metadata: any): Promise<void> {
    const now = Date.now() * 1000;
    const zeroVec = new Array(1024).fill(0);
    const escapedText = text.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    
    await this.dbService.run(`
      ?[id, entity_id, text, embedding, metadata, created_at] <- [[$id, $entity_id, $text, $embedding, $metadata, [${now}, true]]]
      :insert observation {id, entity_id, text, embedding, metadata, created_at}
    `, {
      id,
      entity_id: entityId,
      text: escapedText,
      embedding: zeroVec,
      metadata: metadata || {}
    });
  }

  private async createRelationship(fromId: string, toId: string, relationType: string, strength: number, metadata: any): Promise<void> {
    const now = Date.now() * 1000;
    
    await this.dbService.run(`
      ?[from_id, to_id, relation_type, strength, metadata, created_at] <- [[$from_id, $to_id, $relation_type, $strength, $metadata, [${now}, true]]]
      :insert relationship {from_id, to_id, relation_type, strength, metadata, created_at}
    `, {
      from_id: fromId,
      to_id: toId,
      relation_type: relationType,
      strength,
      metadata: metadata || {}
    });
  }
}
