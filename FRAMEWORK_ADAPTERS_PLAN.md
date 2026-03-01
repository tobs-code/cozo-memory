# Framework Adapters Implementation Plan

## Research Summary (March 2026)

### LangChain Integration
**Key Interfaces:**
- `BaseChatMessageHistory` - Core interface for chat history storage
  - Methods: `add_messages()`, `aget_messages()`, `clear()`, `aclear()`
  - Async variants available for all methods
  - Bulk operations preferred over single-message methods
- `BaseMemory` - Higher-level memory abstraction
  - Uses `BaseChatMessageHistory` internally
  - Provides `save_context()` and `load_memory_variables()`

**Implementation Pattern:**
```python
from langchain.schema import BaseChatMessageHistory, BaseMessage
from typing import List

class CozoMemoryChatHistory(BaseChatMessageHistory):
    def __init__(self, session_id: str, mcp_client):
        self.session_id = session_id
        self.client = mcp_client
    
    def add_messages(self, messages: List[BaseMessage]) -> None:
        # Convert to observations and store via MCP
        pass
    
    async def aget_messages(self) -> List[BaseMessage]:
        # Query via MCP and convert back
        pass
    
    def clear(self) -> None:
        # Clear session via MCP
        pass
```

**Package Structure:**
```
cozo-memory-langchain/
├── src/
│   ├── __init__.py
│   ├── chat_history.py      # BaseChatMessageHistory implementation
│   ├── memory.py             # BaseMemory implementation  
│   ├── retriever.py          # VectorStoreRetriever integration
│   └── client.py             # MCP client wrapper
├── tests/
├── examples/
└── README.md
```

---

### CrewAI Integration
**Key Interfaces:**
- `Memory` class with `remember()`, `recall()`, `forget()` methods
- `StorageBackend` protocol for custom backends
- Embedder configuration via crew or memory instance
- Automatic fact extraction from task outputs

**Implementation Pattern:**
```python
from crewai.memory.storage.backend import StorageBackend

class CozoStorageBackend(StorageBackend):
    def __init__(self, mcp_client):
        self.client = mcp_client
    
    def save(self, scope: str, content: str, metadata: dict):
        # Store via MCP with scope as entity
        pass
    
    def search(self, query: str, scope: str = None) -> List[dict]:
        # Use hybrid search via MCP
        pass
    
    def delete(self, scope: str):
        # Delete entity via MCP
        pass
```

**Package Structure:**
```
cozo-memory-crewai/
├── src/
│   ├── __init__.py
│   ├── storage_backend.py   # StorageBackend implementation
│   ├── memory.py             # Memory wrapper
│   └── client.py             # MCP client wrapper
├── tests/
├── examples/
└── README.md
```

**Integration Points:**
- Crew-level: `Crew(memory=Memory(storage=CozoStorageBackend()))`
- Agent-level: Scoped memory per agent
- Automatic embedder passthrough from crew config

---

### LlamaIndex Integration
**Key Interfaces:**
- `BasePydanticVectorStore` - Core vector store interface
  - Methods: `add()`, `delete()`, `query()`, `get()`
- `SimpleDocumentStore` - Document storage
- `SimpleIndexStore` - Index metadata storage
- `StorageContext` - Container for all storage components

**Implementation Pattern:**
```python
from llama_index.core.vector_stores import BasePydanticVectorStore
from llama_index.core.vector_stores import VectorStoreQuery, VectorStoreQueryResult

class CozoVectorStore(BasePydanticVectorStore):
    stores_text: bool = True
    
    def __init__(self, mcp_client):
        self.client = mcp_client
    
    def add(self, nodes: List[BaseNode]) -> List[str]:
        # Convert nodes to entities/observations via MCP
        pass
    
    def query(self, query: VectorStoreQuery) -> VectorStoreQueryResult:
        # Use hybrid search via MCP
        pass
    
    def delete(self, ref_doc_id: str) -> None:
        # Delete entity via MCP
        pass
```

**Package Structure:**
```
cozo-memory-llamaindex/
├── src/
│   ├── __init__.py
│   ├── vector_store.py       # BasePydanticVectorStore implementation
│   ├── doc_store.py          # Document store implementation
│   ├── index_store.py        # Index store implementation
│   └── client.py             # MCP client wrapper
├── tests/
├── examples/
└── README.md
```

---

## Implementation Priority

### Phase 1: LangChain Adapter ✅ (Week 1-2)
**Status:** Complete

**Deliverables:**
- ✅ `@cozo-memory/langchain` package
- ✅ `CozoMemoryChatHistory` implementation
- ✅ `CozoMemoryRetriever` implementation
- ✅ Session management integration
- ✅ Examples: chatbot, conversational RAG, graph-RAG
- ✅ Documentation

### Phase 2: LlamaIndex Adapter ✅ (Week 3-4)
**Status:** Complete

**Deliverables:**
- ✅ `@cozo-memory/llamaindex` package
- ✅ `CozoVectorStore` implementation
- ✅ Hybrid search and Graph-RAG support
- ✅ Persistent index storage
- ✅ Examples: basic-rag, graph-rag, persistent-index
- ✅ Documentation

### Phase 3: CrewAI Adapter ⏸️ (Postponed)
**Status:** Postponed - Awaiting TypeScript/Node.js support in CrewAI

**Reason:** CrewAI is currently Python-only. Will implement when official TypeScript SDK becomes available or community demand justifies a Python bridge package.

**Alternative:** Users can integrate via HTTP API bridge (`npm run bridge`) from Python CrewAI agents.

### Phase 3 (Alternative): Documentation & Publishing 📋 (Week 5-6)
**Status:** In Progress

**Deliverables:**
- ✅ Comprehensive README updates
- 📋 NPM package publishing setup
- 📋 GitHub releases and tags
- 📋 Example projects repository
- 📋 Integration guides and tutorials
- 📋 Performance benchmarks documentation

---

## Technical Architecture

### Shared MCP Client Layer
All adapters will use a common MCP client wrapper:

```python
# cozo-memory-adapters-core/
class CozoMemoryClient:
    """Shared MCP client for all framework adapters"""
    
    def __init__(self, server_path: str = None):
        # Connect to MCP server (stdio or HTTP bridge)
        pass
    
    async def create_entity(self, name, type, metadata):
        # MCP mutate_memory call
        pass
    
    async def add_observation(self, entity_id, text, metadata):
        # MCP mutate_memory call
        pass
    
    async def search(self, query, limit, filters):
        # MCP query_memory call
        pass
    
    async def hybrid_search(self, query, limit):
        # MCP query_memory with hybrid search
        pass
    
    async def graph_rag(self, query, max_depth):
        # MCP query_memory with graph_rag
        pass
```

### Conversion Utilities
Each adapter needs converters between framework types and cozo-memory types:

**LangChain:**
- `BaseMessage` ↔ Observation
- Session ID ↔ Entity

**LlamaIndex:**
- `BaseNode` ↔ Entity/Observation
- `VectorStoreQuery` ↔ MCP query params
- `VectorStoreQueryResult` ↔ MCP search results

**CrewAI:**
- Memory record ↔ Observation
- Scope ↔ Entity hierarchy
- Categories ↔ Metadata

---

## Success Metrics

### Adoption Metrics
- npm downloads per package
- GitHub stars/forks
- Community examples/tutorials

### Technical Metrics
- Test coverage > 80%
- Performance: < 100ms overhead vs native
- Compatibility: Support latest framework versions

### Documentation Metrics
- Complete API reference
- 3+ working examples per adapter
- Migration guides from native solutions

---


### Differentiation Points
- **Local-First:** No cloud dependencies
- **Graph-RAG:** Native graph traversal capabilities
- **Time-Travel:** Historical queries via Validity
- **Hybrid Search:** Vector + FTS + Graph in one query
- **Cost:** Free, no per-query pricing

---

## Next Steps

1. **Create mono-repo structure:**
   ```
   cozo-memory-adapters/
   ├── packages/
   │   ├── core/              # Shared MCP client
   │   ├── langchain/         # LangChain adapter
   │   ├── llamaindex/        # LlamaIndex adapter
   │   └── crewai/            # CrewAI adapter
   ├── examples/
   └── docs/
   ```

2. **Set up development environment:**
   - TypeScript/Python hybrid project
   - Shared testing infrastructure
   - CI/CD for all packages

3. **Start with LangChain adapter:**
   - Implement `BaseChatMessageHistory`
   - Add session management
   - Create 3 examples
   - Write documentation

4. **Iterate based on feedback:**
   - Monitor GitHub issues
   - Engage with early adopters
   - Refine based on real-world usage
