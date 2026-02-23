# Cozo Memory - MCP Server with Graph Database & Vector Search

This project implements a Model Context Protocol (MCP) server that acts as a persistent memory system for LLMs. It leverages **CozoDB**, a powerful graph database, combined with vector embeddings for hybrid search capabilities.

## Features

- **Graph Database Storage**: Stores entities, relationships, and observations using CozoDB.
- **Hybrid Search**: Combines graph traversal with vector similarity search (using `Xenova/bge-m3` embeddings).
- **MCP Integration**: Fully compatible with the Model Context Protocol via `fastmcp`.
- **Inference Engine**: Capabilities for logical deduction and reasoning over the stored data.
- **API Bridge**: HTTP bridge for external access.

## Prerequisites

- Node.js (v18+ recommended)
- npm or pnpm

## Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd cozo-memory
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

## Usage

### Running the MCP Server

To start the MCP server (development mode):

```bash
npm run dev
```

To build and run the production server:

```bash
npm run build
npm start
```

### Running the API Bridge

To start the HTTP API bridge:

```bash
npm run bridge
```

## Project Structure

- `src/`: Backend source code (TypeScript)
  - `index.ts`: Main entry point for the MCP server.
  - `embedding-service.ts`: Handles vector embeddings.
  - `hybrid-search.ts`: Logic for combining graph and vector search.
  - `inference-engine.ts`: Logic for deductions.
- `dist/`: Compiled backend code.
- `memory_db.cozo`: The CozoDB database file (created on first run).

## Technologies

- **CozoDB**: Graph + Relational database.
- **FastMCP**: TypeScript SDK for MCP.
- **Ollama**: Integration for local LLMs.
- **ONNX Runtime**: For running embedding models locally.

## License

Apache 2.0 Lizens
