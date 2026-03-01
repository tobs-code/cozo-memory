# LlamaIndex + Cozo Memory Examples

Complete working examples demonstrating Cozo Memory integration with LlamaIndex.

## Prerequisites

1. **Install dependencies:**
   ```bash
   cd adapters
   npm install
   ```

2. **Build packages:**
   ```bash
   cd packages/core && npm run build
   cd ../llamaindex && npm run build
   ```

3. **Set up OpenAI API key:**
   ```bash
   export OPENAI_API_KEY=your_api_key_here
   # or create a .env file with OPENAI_API_KEY=your_api_key_here
   ```

4. **Start Cozo Memory MCP server:**
   The examples expect the server at `../../../dist/index.js`

## Examples

### 1. Basic RAG (`basic-rag.ts`)

Simple RAG application with semantic search over documents.

**Features:**
- Document indexing
- Semantic search
- Question answering

**Run:**
```bash
npm run basic-rag
```

**What it does:**
- Creates documents about European capitals
- Indexes them in Cozo Memory
- Answers questions using hybrid search

### 2. Graph-RAG (`graph-rag.ts`)

Advanced RAG with graph-based reasoning for relational queries.

**Features:**
- Graph traversal during retrieval
- Multi-hop reasoning
- Relationship discovery

**Run:**
```bash
npm run graph-rag
```

**What it does:**
- Creates interconnected documents (countries, cities, landmarks)
- Uses Graph-RAG to find relationships
- Answers complex relational questions

### 3. Persistent Index (`persistent-index.ts`)

Demonstrates persistent storage across sessions.

**Features:**
- Index persistence
- Incremental updates
- Session recovery

**Run:**
```bash
npm run persistent-index
```

**What it does:**
- Builds initial index
- Simulates restart and loads existing data
- Adds more documents incrementally

## Key Concepts

### Vector Store Configuration

```typescript
const vectorStore = new CozoVectorStore({
  entityType: 'Document',        // Entity type for documents
  useGraphRAG: false,             // Enable Graph-RAG
  graphRAGDepth: 2,               // Graph traversal depth
  clientOptions: {
    serverPath: 'node',
    serverArgs: ['path/to/server']
  }
});
```

### Hybrid Search vs Graph-RAG

**Hybrid Search** (default):
- Combines vector similarity + full-text search + graph signals
- Fast and efficient for most queries
- Best for: Simple semantic search, keyword matching

**Graph-RAG** (optional):
- Adds graph traversal to find related entities
- Deeper reasoning about relationships
- Best for: Complex relational queries, multi-hop reasoning

### Index Persistence

Cozo Memory automatically persists all data. To reuse an index:

```typescript
// Session 1: Create index
const index1 = await VectorStoreIndex.fromDocuments(docs, { vectorStore });

// Session 2: Load existing index
const vectorStore2 = new CozoVectorStore({ entityType: 'Document' });
const index2 = await VectorStoreIndex.fromVectorStore(vectorStore2);
```

## Troubleshooting

**Error: Cannot connect to MCP server**
- Ensure Cozo Memory server is running
- Check `serverPath` and `serverArgs` in clientOptions

**Error: OpenAI API key not found**
- Set `OPENAI_API_KEY` environment variable
- Or create `.env` file with the key

**Slow first run**
- First run downloads embedding model (~500MB)
- Subsequent runs are much faster

## Next Steps

- Explore the [LlamaIndex documentation](https://docs.llamaindex.ai/)
- Check out [Cozo Memory features](../../../README.md)
- Build your own RAG application!

## License

Apache-2.0
