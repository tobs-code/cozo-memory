# LangChain Examples

Examples demonstrating how to use `@cozo-memory/langchain` with various LangChain patterns.

## Prerequisites

1. Install Cozo Memory MCP server:
```bash
npm install -g cozo-memory
```

2. Install dependencies:
```bash
npm install
```

3. Set your OpenAI API key:
```bash
export OPENAI_API_KEY=your-api-key
```

## Examples

### 1. Chatbot (`chatbot.ts`)

Simple chatbot with persistent memory across conversations.

```bash
npm run chatbot
```

**What it demonstrates:**
- Creating a chat history with Cozo Memory
- Using `ConversationChain` with persistent memory
- Remembering user information across messages

### 2. RAG (`rag.ts`)

Retrieval Augmented Generation with semantic search.

```bash
npm run rag
```

**What it demonstrates:**
- Ingesting documents into Cozo Memory
- Using `CozoMemoryRetriever` for semantic search
- Building a QA system with `RetrievalQAChain`
- Hybrid search (vector + FTS + graph signals)

### 3. Graph-RAG (`graph-rag.ts`)

Deep relational reasoning using knowledge graphs.

```bash
npm run graph-rag
```

**What it demonstrates:**
- Building a knowledge graph with entities and relationships
- Using Graph-RAG for multi-hop reasoning
- Traversing relationships to find connected knowledge
- Answering questions that require understanding connections

## Key Concepts

### Chat History

`CozoMemoryChatHistory` stores conversation messages as observations in Cozo Memory:

- Each message is an observation linked to a chat entity
- Messages are organized by sessions
- Full time-travel support (query history at any point)
- Semantic search over conversation history

### Retriever

`CozoMemoryRetriever` provides two retrieval modes:

1. **Hybrid Search** (default):
   - Combines vector similarity, full-text search, and graph signals
   - Uses Reciprocal Rank Fusion (RRF) for result merging
   - Fast and accurate for most use cases

2. **Graph-RAG**:
   - Starts with semantic vector seeds
   - Traverses relationships to find connected knowledge
   - Ideal for questions requiring relational reasoning
   - Configurable depth (default: 2 hops)

## Customization

### Custom Server Path

```typescript
const chatHistory = new CozoMemoryChatHistory({
  clientOptions: {
    serverPath: '/custom/path/to/cozo-memory'
  }
});
```

### Custom Embedding Model

```typescript
const chatHistory = new CozoMemoryChatHistory({
  clientOptions: {
    env: {
      EMBEDDING_MODEL: 'Xenova/all-MiniLM-L6-v2'
    }
  }
});
```

### Search Options

```typescript
const retriever = new CozoMemoryRetriever({
  searchOptions: {
    limit: 5,
    rerank: true,
    entity_types: ['Document', 'Article']
  }
});
```

## Troubleshooting

### "cozo-memory: command not found"

Make sure cozo-memory is installed globally:
```bash
npm install -g cozo-memory
```

Or specify the full path:
```typescript
clientOptions: {
  serverPath: '/path/to/cozo-memory'
}
```

### Connection Issues

The adapter uses stdio transport to communicate with the MCP server. Make sure:
1. The server is accessible
2. No other process is using the same database file
3. You have write permissions for the database directory

### Performance

For large datasets:
- Use `rerank: true` for better precision
- Adjust `limit` based on your needs
- Consider using Graph-RAG for complex queries
- Use RocksDB backend for better performance (set `DB_ENGINE=rocksdb`)

## Next Steps

- Read the [API documentation](../../packages/langchain/README.md)
- Explore [Cozo Memory features](https://github.com/tobs-code/cozo-memory)
- Join the [community](https://github.com/tobs-code/cozo-memory/discussions)
