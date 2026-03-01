# Cozo Memory Framework Adapters

Official framework adapters for [Cozo Memory](https://github.com/tobs-code/cozo-memory) - enabling seamless integration with popular AI frameworks.

## 📦 Packages

### [@cozo-memory/langchain](./packages/langchain)
LangChain adapter for persistent chat history and semantic retrieval.

```bash
npm install @cozo-memory/langchain
```

**Features:**
- `BaseChatMessageHistory` implementation for persistent conversations
- `BaseRetriever` with hybrid search and Graph-RAG
- Session and task management
- Time-travel queries

### [@cozo-memory/llamaindex](./packages/llamaindex) *(Coming Soon)*
LlamaIndex adapter for vector storage and document management.

### [@cozo-memory/crewai](./packages/crewai) *(Coming Soon)*
CrewAI adapter for multi-agent memory systems.

## 🚀 Quick Start

### LangChain

```typescript
import { CozoMemoryChatHistory } from '@cozo-memory/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';

const chatHistory = new CozoMemoryChatHistory({
  sessionName: 'my-chat'
});

const chain = new ConversationChain({
  llm: new ChatOpenAI(),
  memory: new BufferMemory({ chatHistory })
});

await chain.call({ input: 'Hello!' });
```

## 🎯 Why Cozo Memory?

| Feature | Cozo Memory | Pinecone | Chroma | Weaviate |
|---------|-------------|----------|--------|----------|
| **Local-First** | ✅ | ❌ | ✅ | ❌ |
| **Graph-RAG** | ✅ | ❌ | ❌ | ⚠️ |
| **Time-Travel** | ✅ | ❌ | ❌ | ❌ |
| **Hybrid Search** | ✅ | ⚠️ | ⚠️ | ✅ |
| **Cost** | Free | $$ | Free | $$ |

## 📚 Examples

See the [examples directory](./examples/) for complete working examples:

- **LangChain:**
  - [Chatbot](./examples/langchain/chatbot.ts) - Persistent chat history
  - [RAG](./examples/langchain/rag.ts) - Semantic search
  - [Graph-RAG](./examples/langchain/graph-rag.ts) - Relational reasoning

## 🛠️ Development

This is a monorepo managed with npm workspaces.

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm run test

# Clean build artifacts
npm run clean
```

## 📖 Documentation

- [Cozo Memory Documentation](https://github.com/tobs-code/cozo-memory)
- [LangChain Adapter Docs](./packages/langchain/README.md)
- [API Reference](./docs/api/)

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

Apache-2.0 - see [LICENSE](../LICENSE) for details.

## 🔗 Links

- [Cozo Memory](https://github.com/tobs-code/cozo-memory)
- [LangChain](https://js.langchain.com/)
- [LlamaIndex](https://www.llamaindex.ai/)
- [CrewAI](https://www.crewai.com/)
