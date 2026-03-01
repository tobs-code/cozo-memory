# @cozo-memory/llamaindex

LlamaIndex adapter for Cozo Memory - persistent vector store with hybrid search and Graph-RAG capabilities.

## Features

- **Vector Store Integration**: Full `VectorStore` implementation for LlamaIndex
- **Hybrid Search**: Combines vector similarity, full-text search, and graph signals
- **Graph-RAG**: Optional graph-based reasoning for deeper relational queries
- **Local-First**: No cloud dependencies, runs entirely on your machine
- **Time-Travel**: Query historical states via CozoDB Validity
- **Persistent Storage**: All data stored in local CozoDB database

## Installation

```bash
npm install @cozo-memory/llamaindex @cozo-memory/adapters-core llamaindex
```

## Quick Start

### Basic RAG Application

```typescript
import { CozoVectorStore } from '@cozo-memory/llamaindex';
import { VectorStoreIndex, Document } from 'llamaindex';

// Create vector store
const vectorStore = new CozoVectorStore({
  entityType: 'Document'
});

// Create documents
const documents = [
  new Document({ text: 'Paris is the capital of France', id_: 'doc1' }),
  new Document({ text: 'London is the capital of the UK', id_: 'doc2' })
];

// Build index
const index = await VectorStoreIndex.fromDocuments(
  documents,
  { vectorStore }
);

// Query
const queryEngine = index.asQueryEngine();
const response = await queryEngine.query('What is the capital of France?');
console.log(response.toString());

// Cleanup
await vectorStore.close();
```

### Graph-RAG Mode

Enable Graph-RAG for deeper relational reasoning:

```typescript
const vectorStore = new CozoVectorStore({
  entityType: 'Document',
  useGraphRAG: true,
  graphRAGDepth: 3  // Traverse up to 3 hops in the knowledge graph
});

const index = await VectorStoreIndex.fromDocuments(documents, { vectorStore });
const queryEngine = index.asQueryEngine();

// Graph-RAG will find related entities through graph traversal
const response = await queryEngine.query(
  'Tell me about European capitals and their relationships'
);
```

### Custom MCP Server Path

```typescript
const vectorStore = new CozoVectorStore({
  clientOptions: {
    serverPath: 'node',
    serverArgs: ['path/to/cozo-memory/dist/index.js']
  }
});
```

## API Reference

### CozoVectorStore

#### Constructor Options

```typescript
interface CozoVectorStoreOptions {
  client?: CozoMemoryClient;           // Existing client instance
  clientOptions?: {                     // Options for new client
    serverPath?: string;
    serverArgs?: string[];
    env?: Record<string, string>;
  };
  entityType?: string;                  // Entity type for documents (default: 'Document')
  useGraphRAG?: boolean;                // Enable Graph-RAG (default: false)
  graphRAGDepth?: number;               // Graph traversal depth (default: 2)
}
```

#### Methods

- `add(nodes: any[]): Promise<string[]>` - Add documents to the vector store
- `delete(refDocId: string): Promise<void>` - Delete a document
- `query(query: VectorStoreQuery): Promise<VectorStoreQueryResult>` - Query the vector store
- `connect(): Promise<void>` - Connect to MCP server
- `close(): Promise<void>` - Close connection

## Comparison with Other Vector Stores

| Feature | Cozo Memory | Pinecone | Chroma | Weaviate |
|---------|-------------|----------|--------|----------|
| Local-First | ✅ | ❌ | ✅ | ✅ |
| Hybrid Search | ✅ | ❌ | ❌ | ✅ |
| Graph-RAG | ✅ | ❌ | ❌ | ❌ |
| Time-Travel | ✅ | ❌ | ❌ | ❌ |
| Cost | Free | $$ | Free | $$ |
| Setup | Zero config | API key | Docker | Docker |

## Examples

See the [examples directory](../../examples/llamaindex/) for complete working examples:

- `basic-rag.ts` - Simple RAG application
- `graph-rag.ts` - Graph-RAG with relational reasoning
- `persistent-index.ts` - Persistent index across sessions

## Requirements

- Node.js 20+
- Cozo Memory MCP server running
- LlamaIndex 0.7+

## License

Apache-2.0
