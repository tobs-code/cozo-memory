/**
 * Persistent Index Example with Cozo Memory + LlamaIndex
 * 
 * This example demonstrates:
 * - Creating a persistent index that survives restarts
 * - Reusing existing data across sessions
 * - Incremental updates to the index
 */

import { CozoVectorStore } from '@cozo-memory/llamaindex';
import { VectorStoreIndex, Document, Settings } from 'llamaindex';
import { OpenAI, OpenAIEmbedding } from 'llamaindex';
import 'dotenv/config';

async function buildInitialIndex() {
  console.log('=== Building Initial Index ===\n');

  const vectorStore = new CozoVectorStore({
    entityType: 'PersistentDoc',
    clientOptions: {
      serverPath: 'node',
      serverArgs: ['../../../dist/index.js']
    }
  });

  const documents = [
    new Document({
      text: 'TypeScript is a strongly typed programming language that builds on JavaScript.',
      id_: 'doc-typescript'
    }),
    new Document({
      text: 'Python is a high-level, interpreted programming language known for its simplicity.',
      id_: 'doc-python'
    }),
    new Document({
      text: 'Rust is a systems programming language focused on safety and performance.',
      id_: 'doc-rust'
    })
  ];

  console.log('Building index with initial documents...');
  const index = await VectorStoreIndex.fromDocuments(documents, { vectorStore });
  console.log('✓ Initial index built\n');

  await vectorStore.close();
  return index;
}

async function queryExistingIndex() {
  console.log('=== Querying Existing Index ===\n');

  // Create new vector store instance (simulates new session)
  const vectorStore = new CozoVectorStore({
    entityType: 'PersistentDoc',
    clientOptions: {
      serverPath: 'node',
      serverArgs: ['../../../dist/index.js']
    }
  });

  // Create index from existing vector store
  const index = await VectorStoreIndex.fromVectorStore(vectorStore);
  console.log('✓ Loaded existing index\n');

  const queryEngine = index.asQueryEngine();
  
  const query = 'What programming languages are mentioned?';
  console.log(`Query: ${query}`);
  const response = await queryEngine.query({ query });
  console.log(`Answer: ${response.toString()}\n`);

  await vectorStore.close();
}

async function addMoreDocuments() {
  console.log('=== Adding More Documents ===\n');

  const vectorStore = new CozoVectorStore({
    entityType: 'PersistentDoc',
    clientOptions: {
      serverPath: 'node',
      serverArgs: ['../../../dist/index.js']
    }
  });

  const index = await VectorStoreIndex.fromVectorStore(vectorStore);

  // Add new documents to existing index
  const newDocuments = [
    new Document({
      text: 'Go is a statically typed, compiled language designed at Google for building scalable systems.',
      id_: 'doc-go'
    }),
    new Document({
      text: 'Java is a class-based, object-oriented programming language used for enterprise applications.',
      id_: 'doc-java'
    })
  ];

  console.log('Adding new documents to existing index...');
  for (const doc of newDocuments) {
    await index.insert(doc);
  }
  console.log('✓ Documents added\n');

  // Query updated index
  const queryEngine = index.asQueryEngine();
  const query = 'Tell me about Go and Java';
  console.log(`Query: ${query}`);
  const response = await queryEngine.query({ query });
  console.log(`Answer: ${response.toString()}\n`);

  await vectorStore.close();
}

async function main() {
  // Configure LlamaIndex
  Settings.llm = new OpenAI({ model: 'gpt-4', temperature: 0 });
  Settings.embedModel = new OpenAIEmbedding({ model: 'text-embedding-3-small' });

  // Step 1: Build initial index
  await buildInitialIndex();

  console.log('Simulating application restart...\n');
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Step 2: Query existing index (simulates new session)
  await queryExistingIndex();

  console.log('Adding more data...\n');
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Step 3: Add more documents incrementally
  await addMoreDocuments();

  console.log('✓ All operations completed');
}

main().catch(console.error);
