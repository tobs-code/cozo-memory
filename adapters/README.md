# Cozo Memory Framework Adapters

Official framework adapters for Cozo Memory - enabling seamless integration with popular AI frameworks.

## Packages

### [@cozo-memory/adapters-core](./packages/core/) ✅
Shared MCP client library used by all framework adapters.

**Status:** Production ready

### [@cozo-memory/langchain](./packages/langchain/) ✅
LangChain integration with persistent chat history and retriever.

**Status:** Production ready  
**Features:**
- `CozoMemoryChatHistory` - BaseChatMessageHistory implementation
- `CozoMemoryRetriever` - BaseRetriever with hybrid search
- Session management
- Graph-RAG support

### [@cozo-memory/llamaindex](./packages/llamaindex/) ✅
LlamaIndex integration with vector store and document storage.

**Status:** Production ready  
**Features:**
- `CozoVectorStore` - BaseVectorStore implementation
- Hybrid search and Graph-RAG
- Persistent indexes
- Document management

### [@cozo-memory/crewai](./packages/crewai/) 📋
CrewAI integration with storage backend (planned).

**Status:** Planned  
**Features:**
- `CozoStorageBackend` - StorageBackend implementation
- Multi-agent memory
- Scoped storage

## Installation

```bash
# LangChain adapter
npm install @cozo-memory/langchain @cozo-memory/adapters-core

# LlamaIndex adapter
npm install @cozo-memory/llamaindex @cozo-memory/adapters-core

# CrewAI adapter (coming soon)
npm install @cozo-memory/crewai @cozo-memory/adapters-core
```

## Quick Start

### LangChain

```typescript
import { CozoMemoryChatHistory } from '@cozo-memory/langchain';
import { BufferMemory } from 'langchain/memory';
import { ConversationChain } from 'langchain/chains';
import { ChatOpenAI } from '@langchain/openai';

const chatHistory = new CozoMemoryChatHistory({
  sessionName: 'user-123'
});

const memory = new BufferMemory({ chatHistory });
const chain = new ConversationChain({
  llm: new ChatOpenAI(),
  memory
});

await chain.call({ input: 'Hello!' });
```

### LlamaIndex

```typescript
import { CozoVectorStore } from '@cozo-memory/llamaindex';
import { VectorStoreIndex, Document } from 'llamaindex';

const vectorStore = new CozoVectorStore({
  useGraphRAG: true
});

const index = await VectorStoreIndex.fromDocuments(
  documents,
  { vectorStore }
);

const queryEngine = index.asQueryEngine();
const response = await queryEngine.query('What is the capital of France?');
```

## Examples

Complete working examples are available in the [examples directory](./examples/):

- [LangChain Examples](./examples/langchain/) - Chatbot, RAG, Graph-RAG
- [LlamaIndex Examples](./examples/llamaindex/) - Basic RAG, Graph-RAG, Persistent Index

## Development

### Setup

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Build specific package
cd packages/langchain && npm run build
cd packages/llamaindex && npm run build
```

### Testing

```bash
# Test LangChain adapter
cd adapters
npx ts-node test-adapter.ts

# Test LlamaIndex adapter (coming soon)
cd examples/llamaindex
npm run basic-rag
```

## Architecture

All adapters share a common architecture:

```
┌─────────────────────────────────────┐
│   Framework (LangChain/LlamaIndex)  │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Framework Adapter Package      │
│  (chat_history, retriever, etc.)    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│    @cozo-memory/adapters-core       │
│      (Shared MCP Client)            │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│     Cozo Memory MCP Server          │
│   (stdio or HTTP transport)         │
└─────────────────────────────────────┘
```

## Why Cozo Memory?

| Feature | Cozo Memory | Pinecone | Chroma | Weaviate |
|---------|-------------|----------|--------|----------|
| Local-First | ✅ | ❌ | ✅ | ✅ |
| Hybrid Search | ✅ | ❌ | ❌ | ✅ |
| Graph-RAG | ✅ | ❌ | ❌ | ❌ |
| Time-Travel | ✅ | ❌ | ❌ | ❌ |
| Cost | Free | $$ | Free | $$ |
| Setup | Zero config | API key | Docker | Docker |

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## License

Apache-2.0
