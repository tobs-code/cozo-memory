# Changelog

All notable changes to the Cozo Memory framework adapters will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- CrewAI adapter (awaiting TypeScript support)
- Performance benchmarks
- Additional examples
- Integration tests

## [0.1.0] - 2026-03-01

### Added - @cozo-memory/adapters-core
- Initial release of shared MCP client
- `CozoMemoryClient` class with full MCP API support
- Entity and observation management
- Search operations (hybrid, graph-rag, advanced)
- Session and task management
- System health monitoring
- TypeScript type definitions

### Added - @cozo-memory/langchain
- Initial release of LangChain adapter
- `CozoMemoryChatHistory` - BaseChatMessageHistory implementation
- `CozoMemoryRetriever` - BaseRetriever implementation
- Session management with automatic entity creation
- Hybrid search support
- Graph-RAG mode for retriever
- Examples: chatbot, RAG, graph-RAG
- Comprehensive test suite

### Added - @cozo-memory/llamaindex
- Initial release of LlamaIndex adapter
- `CozoVectorStore` - BaseVectorStore implementation
- Hybrid search and Graph-RAG support
- Persistent index storage
- Node-to-entity mapping
- Observation-based content storage
- Examples: basic-rag, graph-rag, persistent-index
- Comprehensive test suite with 6 test scenarios

### Fixed - @cozo-memory/llamaindex
- Query method now correctly retrieves observations from entities
- Proper handling of search result structure
- Entity details fetching for complete node information
- Fallback to entity names when observations are missing

### Documentation
- Complete README for each package
- API documentation
- Usage examples
- Architecture diagrams
- Publishing guide
- Development setup instructions

## Release Notes

### v0.1.0 - Initial Release

This is the first public release of the Cozo Memory framework adapters. The adapters provide seamless integration between Cozo Memory and popular AI frameworks.

**Highlights:**
- ✅ Production-ready LangChain adapter
- ✅ Production-ready LlamaIndex adapter
- ✅ Shared MCP client for all adapters
- ✅ Comprehensive test coverage
- ✅ Working examples for all features
- ✅ Full TypeScript support

**Tested Features:**
- Chat history persistence (LangChain)
- Hybrid search retrieval (both adapters)
- Graph-RAG mode (both adapters)
- Session management (LangChain)
- Vector store operations (LlamaIndex)
- Metadata handling (both adapters)
- Client reuse patterns (both adapters)

**Known Limitations:**
- CrewAI adapter postponed (Python-only framework)
- No Python bindings yet
- Requires Node.js 20+

**Migration from Direct MCP:**
If you're currently using the MCP server directly, migrating to the adapters is straightforward:

```typescript
// Before (direct MCP)
const client = new Client(...);
await client.callTool({ name: 'mutate_memory', ... });

// After (with adapter)
import { CozoMemoryClient } from '@cozo-memory/adapters-core';
const client = new CozoMemoryClient();
await client.createEntity('name', 'type', metadata);
```

**Next Steps:**
1. Publish to NPM
2. Create GitHub releases
3. Add NPM badges to README
4. Announce on social media
5. Gather community feedback

---

## Version History

- **0.1.0** (2026-03-01) - Initial release with LangChain and LlamaIndex adapters

[Unreleased]: https://github.com/yourusername/cozo-memory/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourusername/cozo-memory/releases/tag/v0.1.0
