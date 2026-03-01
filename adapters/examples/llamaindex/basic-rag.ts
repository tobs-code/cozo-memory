/**
 * Basic RAG Example with Cozo Memory + LlamaIndex
 * 
 * This example demonstrates:
 * - Creating a vector store with Cozo Memory
 * - Indexing documents
 * - Querying with semantic search
 */

import { CozoVectorStore } from '@cozo-memory/llamaindex';
import { VectorStoreIndex, Document, Settings } from 'llamaindex';
import { OpenAI, OpenAIEmbedding } from 'llamaindex';
import 'dotenv/config';

async function main() {
  console.log('=== Basic RAG with Cozo Memory + LlamaIndex ===\n');

  // Configure LlamaIndex
  Settings.llm = new OpenAI({ model: 'gpt-4', temperature: 0 });
  Settings.embedModel = new OpenAIEmbedding({ model: 'text-embedding-3-small' });

  // Create Cozo Memory vector store
  const vectorStore = new CozoVectorStore({
    entityType: 'Document',
    clientOptions: {
      serverPath: 'node',
      serverArgs: ['../../../dist/index.js']
    }
  });

  console.log('✓ Created vector store\n');

  // Create sample documents
  const documents = [
    new Document({
      text: 'Paris is the capital and largest city of France. It is known for the Eiffel Tower, Louvre Museum, and Notre-Dame Cathedral.',
      id_: 'doc-paris'
    }),
    new Document({
      text: 'London is the capital of the United Kingdom. Famous landmarks include Big Ben, Tower Bridge, and Buckingham Palace.',
      id_: 'doc-london'
    }),
    new Document({
      text: 'Berlin is the capital of Germany. It is known for the Brandenburg Gate, Berlin Wall remnants, and Museum Island.',
      id_: 'doc-berlin'
    }),
    new Document({
      text: 'Rome is the capital of Italy. It features the Colosseum, Vatican City, and Trevi Fountain.',
      id_: 'doc-rome'
    })
  ];

  console.log(`✓ Created ${documents.length} documents\n`);

  // Build index
  console.log('Building index...');
  const index = await VectorStoreIndex.fromDocuments(documents, { vectorStore });
  console.log('✓ Index built\n');

  // Create query engine
  const queryEngine = index.asQueryEngine();

  // Example queries
  const queries = [
    'What is the capital of France?',
    'Tell me about landmarks in London',
    'Which city has the Colosseum?'
  ];

  for (const query of queries) {
    console.log(`Query: ${query}`);
    const response = await queryEngine.query({ query });
    console.log(`Answer: ${response.toString()}\n`);
  }

  // Cleanup
  await vectorStore.close();
  console.log('✓ Closed connection');
}

main().catch(console.error);
