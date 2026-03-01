import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  Entity,
  Observation,
  Relationship,
  SearchResult,
  SearchOptions,
  GraphRAGOptions,
  SessionInfo,
  TaskInfo
} from './types';

export interface CozoMemoryClientOptions {
  /**
   * Path to the cozo-memory MCP server executable
   * Default: 'cozo-memory' (assumes it's in PATH)
   */
  serverPath?: string;
  
  /**
   * Additional arguments to pass to the server
   */
  serverArgs?: string[];
  
  /**
   * Environment variables for the server process
   */
  env?: Record<string, string>;
}

/**
 * Shared MCP client for Cozo Memory framework adapters
 * 
 * Provides a high-level interface to interact with the Cozo Memory MCP server
 * via stdio transport.
 */
export class CozoMemoryClient {
  private client: Client;
  private transport: StdioClientTransport;
  private connected: boolean = false;

  constructor(options: CozoMemoryClientOptions = {}) {
    const {
      serverPath = 'cozo-memory',
      serverArgs = [],
      env = {}
    } = options;

    // Filter out undefined values from process.env
    const cleanEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries({ ...process.env, ...env })) {
      if (value !== undefined) {
        cleanEnv[key] = value;
      }
    }
    
    this.transport = new StdioClientTransport({
      command: serverPath,
      args: serverArgs,
      env: cleanEnv
    });

    this.client = new Client({
      name: 'cozo-memory-adapter',
      version: '0.1.0'
    }, {
      capabilities: {}
    });
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.connected) return;
    
    await this.client.connect(this.transport);
    this.connected = true;
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;
    
    await this.client.close();
    this.connected = false;
  }

  /**
   * Ensure the client is connected
   */
  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
  }

  /**
   * Parse MCP tool result
   */
  private parseResult(result: any): any {
    const content = result.content as any[];
    return JSON.parse(content[0].text);
  }

  /**
   * Create a new entity
   */
  async createEntity(
    name: string,
    type: string,
    metadata?: Record<string, any>
  ): Promise<Entity> {
    await this.ensureConnected();
    
    const result = await this.client.callTool({
      name: 'mutate_memory',
      arguments: {
        action: 'create_entity',
        name,
        type,
        metadata
      }
    });

    return this.parseResult(result);
  }

  /**
   * Add an observation to an entity
   */
  async addObservation(
    entityId: string,
    text: string,
    metadata?: Record<string, any>,
    sessionId?: string,
    taskId?: string
  ): Promise<Observation> {
    await this.ensureConnected();
    
    const result = await this.client.callTool({
      name: 'mutate_memory',
      arguments: {
        action: 'add_observation',
        entity_id: entityId,
        text,
        metadata,
        session_id: sessionId,
        task_id: taskId
      }
    });

    return this.parseResult(result);
  }

  /**
   * Create a relationship between entities
   */
  async createRelationship(
    fromId: string,
    toId: string,
    relationType: string,
    strength?: number,
    metadata?: Record<string, any>
  ): Promise<Relationship> {
    await this.ensureConnected();
    
    const result = await this.client.callTool({
      name: 'mutate_memory',
      arguments: {
        action: 'create_relation',
        from_id: fromId,
        to_id: toId,
        relation_type: relationType,
        strength,
        metadata
      }
    });

    return this.parseResult(result);
  }

  /**
   * Delete an entity
   */
  async deleteEntity(entityId: string): Promise<void> {
    await this.ensureConnected();
    
    await this.client.callTool({
      name: 'mutate_memory',
      arguments: {
        action: 'delete_entity',
        entity_id: entityId
      }
    });
  }

  /**
   * Search for entities and observations
   */
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    await this.ensureConnected();
    
    const result = await this.client.callTool({
      name: 'query_memory',
      arguments: {
        action: 'search',
        query,
        ...options
      }
    });

    return this.parseResult(result);
  }

  /**
   * Perform hybrid search with RRF fusion
   */
  async hybridSearch(
    query: string,
    limit: number = 10
  ): Promise<SearchResult> {
    return this.search(query, { limit, include_observations: true });
  }

  /**
   * Perform Graph-RAG search
   */
  async graphRAG(
    query: string,
    options: GraphRAGOptions = {}
  ): Promise<SearchResult> {
    await this.ensureConnected();
    
    const result = await this.client.callTool({
      name: 'query_memory',
      arguments: {
        action: 'graph_rag',
        query,
        ...options
      }
    });

    return this.parseResult(result);
  }

  /**
   * Get entity details
   */
  async getEntity(entityId: string): Promise<Entity> {
    await this.ensureConnected();
    
    const result = await this.client.callTool({
      name: 'query_memory',
      arguments: {
        action: 'entity_details',
        entity_id: entityId
      }
    });

    return this.parseResult(result);
  }

  /**
   * Start a new session
   */
  async startSession(name?: string, metadata?: Record<string, any>): Promise<SessionInfo> {
    await this.ensureConnected();
    
    const result = await this.client.callTool({
      name: 'mutate_memory',
      arguments: {
        action: 'start_session',
        name,
        metadata
      }
    });

    return this.parseResult(result);
  }

  /**
   * Stop a session
   */
  async stopSession(sessionId: string): Promise<void> {
    await this.ensureConnected();
    
    await this.client.callTool({
      name: 'mutate_memory',
      arguments: {
        action: 'stop_session',
        id: sessionId
      }
    });
  }

  /**
   * Start a new task
   */
  async startTask(
    name: string,
    sessionId?: string,
    metadata?: Record<string, any>
  ): Promise<TaskInfo> {
    await this.ensureConnected();
    
    const result = await this.client.callTool({
      name: 'mutate_memory',
      arguments: {
        action: 'start_task',
        name,
        session_id: sessionId,
        metadata
      }
    });

    return this.parseResult(result);
  }

  /**
   * Stop a task
   */
  async stopTask(taskId: string): Promise<void> {
    await this.ensureConnected();
    
    await this.client.callTool({
      name: 'mutate_memory',
      arguments: {
        action: 'stop_task',
        id: taskId
      }
    });
  }

  /**
   * Get system health
   */
  async health(): Promise<any> {
    await this.ensureConnected();
    
    const result = await this.client.callTool({
      name: 'manage_system',
      arguments: {
        action: 'health'
      }
    });

    return this.parseResult(result);
  }
}
