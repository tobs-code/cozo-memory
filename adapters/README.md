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

### [@cozo-memory/crewai](./packages/crewai/) ⏸️
CrewAI integration (postponed - awaiting TypeScript support).

**Status:** Postponed  
**Reason:** CrewAI is currently Python-only. Will implement when official TypeScript SDK becomes available.  
**Alternative:** Use HTTP API bridge (`npm run bridge` in main package) for Python CrewAI integration.

## Installation

```bash
# Install from npm (once published)
npm install @cozo-memory/langchain @cozo-memory/adapters-core
npm install @cozo-memory/llamaindex @cozo-memory/adapters-core

# Or install from local workspace
cd adapters
npm install
npm run build
```

**Prerequisites:**
- Node.js 20+
- Cozo Memory MCP Server (from main package)
- TypeScript 5.9+ (for development)

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

# Test LlamaIndex adapter
cd adapters
npx ts-node test-llamaindex-adapter.ts

# Run example projects
cd examples/langchain
npx ts-node chatbot.ts

cd examples/llamaindex
npx ts-node basic-rag.ts
```

### Test Results

Both adapters have been comprehensively tested:

**LangChain Adapter:**
- ✅ Chat history persistence
- ✅ Session management
- ✅ Message retrieval
- ✅ Hybrid search retriever
- ✅ Graph-RAG retriever

**LlamaIndex Adapter:**
- ✅ Vector store basics (add, query, delete)
- ✅ Graph-RAG mode
- ✅ Persistence across sessions
- ✅ Edge cases (empty queries, auto-IDs, non-existent deletes)
- ✅ Client reuse
- ✅ Complex metadata handling

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
