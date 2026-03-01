import { BaseVectorStore, type VectorStoreQuery, type VectorStoreQueryResult } from 'llamaindex';
import { CozoMemoryClient } from '@cozo-memory/adapters-core';

export interface CozoVectorStoreOptions {
  client?: CozoMemoryClient;
  clientOptions?: {
    serverPath?: string;
    serverArgs?: string[];
    env?: Record<string, string>;
  };
  entityType?: string;
  useGraphRAG?: boolean;
  graphRAGDepth?: number;
}

export class CozoVectorStore extends BaseVectorStore {
  storesText = true;
  isEmbeddingQuery = true;
  
  private mcp_client: CozoMemoryClient;
  private entityType: string;
  private useGraphRAG: boolean;
  private graphRAGDepth: number;
  private nodeIdToEntityId: Map<string, string> = new Map();

  // @ts-ignore - Override BaseVectorStore's client property
  get client(): any {
    return this.mcp_client;
  }

  constructor(options: CozoVectorStoreOptions = {}) {
    super();
    this.mcp_client = options.client || new CozoMemoryClient(options.clientOptions);
    this.entityType = options.entityType || 'Document';
    this.useGraphRAG = options.useGraphRAG || false;
    this.graphRAGDepth = options.graphRAGDepth || 2;
  }

  async connect(): Promise<void> {
    await this.mcp_client.connect();
  }

  async add(nodes: any[]): Promise<string[]> {
    await this.connect();
    
    const ids: string[] = [];
    
    for (const node of nodes) {
      const entity = await this.mcp_client.createEntity(
        node.id_ || `doc-${Date.now()}`,
        this.entityType,
        {
          source: 'llamaindex',
          node_type: node.type,
          ...node.metadata
        }
      );
      
      this.nodeIdToEntityId.set(node.id_, entity.id);
      
      const text = node.getContent ? node.getContent() : node.text;
      if (text) {
        await this.mcp_client.addObservation(
          entity.id,
          text,
          {
            node_id: node.id_,
            embedding: node.embedding,
            ...node.metadata
          }
        );
      }
      
      ids.push(entity.id);
    }
    
    return ids;
  }

  async delete(refDocId: string): Promise<void> {
    await this.connect();
    
    const entityId = this.nodeIdToEntityId.get(refDocId);
    if (entityId) {
      await this.mcp_client.deleteEntity(entityId);
      this.nodeIdToEntityId.delete(refDocId);
    }
  }

  async query(query: VectorStoreQuery): Promise<VectorStoreQueryResult> {
    await this.connect();
    
    let result;
    
    if (this.useGraphRAG) {
      result = await this.mcp_client.graphRAG(query.queryStr || '', {
        max_depth: this.graphRAGDepth,
        limit: query.similarityTopK || 10
      });
    } else {
      result = await this.mcp_client.search(query.queryStr || '', {
        limit: query.similarityTopK || 10,
        include_observations: true,
        include_entities: true
      });
    }

    const nodes: any[] = [];
    const ids: string[] = [];
    const similarities: number[] = [];

    if (result.observations) {
      for (const obs of result.observations) {
        nodes.push({
          id_: obs.metadata?.node_id || obs.id,
          text: obs.text,
          metadata: obs.metadata || {},
          embedding: obs.metadata?.embedding
        });
        ids.push(obs.id);
        similarities.push(1.0);
      }
    }

    return {
      nodes,
      ids,
      similarities
    };
  }

  async close(): Promise<void> {
    await this.mcp_client.disconnect();
  }
}
