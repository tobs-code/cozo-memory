# @cozo-memory/langchain

LangChain adapter for Cozo Memory - persistent chat history and semantic retrieval with Graph-RAG capabilities.

## Features

- **Persistent Chat History**: Store conversation history in Cozo Memory with full time-travel support
- **Semantic Search**: Retrieve relevant context using hybrid search (vector + FTS + graph signals)
- **Graph-RAG**: Deep relational reasoning over your knowledge graph
- **Session Management**: Organize conversations by sessions and tasks
- **Local-First**: No cloud dependencies, all data stored locally

## Installation

```bash
npm install @cozo-memory/langchain @cozo-memory/adapters-core
```

## Prerequisites

You need to have `cozo-memory` MCP server installed:

```bash
npm install -g cozo-memory
```

## Usage

### Chat History

```typescript
import { CozoMemoryChatHistory } from '@cozo-memory/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';

// Create chat history
const chatHistory = new CozoMemoryChatHistory({
  sessionName: 'user-123-chat'
});

// Use with ConversationChain
const chain = new ConversationChain({
  llm: new ChatOpenAI(),
  memory: new BufferMemory({
    chatHistory
  })
});

// Chat
const response1 = await chain.call({ 
  input: 'My name is Alice' 
});

const response2 = await chain.call({ 
  input: 'What is my name?' 
});
// Response: "Your name is Alice"

// Close when done
await chatHistory.close();
```

### Retriever for RAG

```typescript
import { CozoMemoryRetriever } from '@cozo-memory/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { RetrievalQAChain } from 'langchain/chains';

// Create retriever with hybrid search
const retriever = new CozoMemoryRetriever({
  searchOptions: { 
    limit: 5,
    rerank: true 
  }
});

// Use with RetrievalQAChain
const chain = RetrievalQAChain.fromLLM(
  new ChatOpenAI(),
  retriever
);

const result = await chain.call({
  query: 'What are the key features of the product?'
});

console.log(result.text);
```

### Graph-RAG Retriever

```typescript
import { CozoMemoryRetriever } from '@cozo-memory/langchain';

// Use Graph-RAG for deeper relational reasoning
const retriever = new CozoMemoryRetriever({
  useGraphRAG: true,
  graphRAGDepth: 2,
  searchOptions: { limit: 10 }
});

// Graph-RAG will traverse relationships to find connected knowledge
const docs = await retriever.getRelevantDocuments(
  'What projects is Alice working on?'
);
```

### Custom Client Configuration

```typescript
import { CozoMemoryChatHistory } from '@cozo-memory/langchain';

const chatHistory = new CozoMemoryChatHistory({
  sessionName: 'my-session',
  clientOptions: {
    serverPath: '/path/to/cozo-memory',
    env: {
      EMBEDDING_MODEL: 'Xenova/all-MiniLM-L6-v2'
    }
  }
});
```

## API Reference

### CozoMemoryChatHistory

Implements `BaseChatMessageHistory` from LangChain.

**Constructor Options:**
- `sessionId?: string` - Existing session ID
- `sessionName?: string` - Name for new session
- `entityId?: string` - Existing entity ID to store messages
- `entityName?: string` - Name for new entity
- `client?: CozoMemoryClient` - Existing client instance
- `clientOptions?` - Options for creating new client

**Methods:**
- `getMessages(): Promise<BaseMessage[]>` - Get all messages
- `addMessages(messages: BaseMessage[]): Promise<void>` - Add messages
- `clear(): Promise<void>` - Clear all messages
- `close(): Promise<void>` - Close connection

### CozoMemoryRetriever

Implements `BaseRetriever` from LangChain.

**Constructor Options:**
- `client?: CozoMemoryClient` - Existing client instance
- `clientOptions?` - Options for creating new client
- `searchOptions?: SearchOptions` - Search configuration
- `useGraphRAG?: boolean` - Use Graph-RAG instead of hybrid search
- `graphRAGDepth?: number` - Max depth for Graph-RAG traversal

**Methods:**
- `getRelevantDocuments(query: string): Promise<Document[]>` - Retrieve documents
- `close(): Promise<void>` - Close connection

## Examples

See the [examples directory](../../examples/langchain/) for complete working examples:

- `chatbot.ts` - Simple chatbot with persistent memory
- `rag.ts` - RAG application with semantic search
- `graph-rag.ts` - Graph-RAG for relational reasoning
- `multi-session.ts` - Managing multiple conversation sessions

## Comparison with Other Solutions

| Feature | Cozo Memory | Pinecone | Chroma | Weaviate |
|---------|-------------|----------|--------|----------|
| **Local-First** | ✅ | ❌ | ✅ | ❌ |
| **Graph-RAG** | ✅ | ❌ | ❌ | ⚠️ |
| **Time-Travel** | ✅ | ❌ | ❌ | ❌ |
| **Hybrid Search** | ✅ | ⚠️ | ⚠️ | ✅ |
| **Cost** | Free | $$ | Free | $$ |

## License

Apache-2.0
