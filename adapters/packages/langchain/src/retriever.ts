import { BaseRetriever, type BaseRetrieverInput } from '@langchain/core/retrievers';
import { Document } from '@langchain/core/documents';
import { CozoMemoryClient, type SearchOptions } from '@cozo-memory/adapters-core';

export interface CozoMemoryRetrieverOptions extends BaseRetrieverInput {
  /**
   * Cozo Memory client instance
   */
  client?: CozoMemoryClient;
  
  /**
   * Options for creating a new client (if client not provided)
   */
  clientOptions?: {
    serverPath?: string;
    serverArgs?: string[];
    env?: Record<string, string>;
  };
  
  /**
   * Search options
   */
  searchOptions?: SearchOptions;
  
  /**
   * Use Graph-RAG instead of hybrid search
   */
  useGraphRAG?: boolean;
  
  /**
   * Graph-RAG max depth (only used if useGraphRAG is true)
   */
  graphRAGDepth?: number;
}

/**
 * LangChain retriever implementation using Cozo Memory
 * 
 * Enables semantic search and Graph-RAG retrieval for RAG applications.
 * 
 * @example
 * ```typescript
 * import { CozoMemoryRetriever } from '@cozo-memory/langchain';
 * import { ChatOpenAI } from '@langchain/openai';
 * import { RetrievalQAChain } from 'langchain/chains';
 * 
 * const retriever = new CozoMemoryRetriever({
 *   searchOptions: { limit: 5 },
 *   useGraphRAG: true
 * });
 * 
 * const chain = RetrievalQAChain.fromLLM(
 *   new ChatOpenAI(),
 *   retriever
 * );
 * 
 * const result = await chain.call({
 *   query: 'What is the capital of France?'
 * });
 * ```
 */
export class CozoMemoryRetriever extends BaseRetriever {
  lc_namespace = ['cozo-memory', 'retrievers'];
  
  private client: CozoMemoryClient;
  private searchOptions: SearchOptions;
  private useGraphRAG: boolean;
  private graphRAGDepth: number;

  constructor(options: CozoMemoryRetrieverOptions = {}) {
    super(options);
    
    this.client = options.client || new CozoMemoryClient(options.clientOptions);
    this.searchOptions = options.searchOptions || { limit: 10 };
    this.useGraphRAG = options.useGraphRAG || false;
    this.graphRAGDepth = options.graphRAGDepth || 2;
  }

  /**
   * Get relevant documents for a query
   */
  async _getRelevantDocuments(query: string): Promise<Document[]> {
    await this.client.connect();

    let result;
    
    if (this.useGraphRAG) {
      // Use Graph-RAG for deeper relational reasoning
      result = await this.client.graphRAG(query, {
        max_depth: this.graphRAGDepth,
        limit: this.searchOptions.limit
      });
    } else {
      // Use hybrid search (vector + FTS + graph signals)
      result = await this.client.search(query, this.searchOptions);
    }

    const documents: Document[] = [];

    // Convert observations to documents
    if (result.observations) {
      for (const obs of result.observations) {
        documents.push(new Document({
          pageContent: obs.text,
          metadata: {
            id: obs.id,
            entity_id: obs.entity_id,
            created_at: obs.created_at,
            session_id: obs.session_id,
            task_id: obs.task_id,
            ...obs.metadata
          }
        }));
      }
    }

    // Convert entities to documents (if included)
    if (result.entities) {
      for (const entity of result.entities) {
        documents.push(new Document({
          pageContent: `Entity: ${entity.name} (${entity.type})`,
          metadata: {
            id: entity.id,
            name: entity.name,
            type: entity.type,
            created_at: entity.created_at,
            ...entity.metadata
          }
        }));
      }
    }

    return documents;
  }

  /**
   * Close the connection to Cozo Memory
   */
  async close(): Promise<void> {
    await this.client.disconnect();
  }
}
