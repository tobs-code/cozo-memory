/**
 * Graph-RAG Example with Cozo Memory + LlamaIndex
 * 
 * This example demonstrates:
 * - Using Graph-RAG for deeper relational reasoning
 * - Traversing knowledge graphs during retrieval
 * - Finding connections between entities
 */

import { CozoVectorStore } from '@cozo-memory/llamaindex';
import { VectorStoreIndex, Document, Settings } from 'llamaindex';
import { OpenAI, OpenAIEmbedding } from 'llamaindex';
import 'dotenv/config';

async function main() {
  console.log('=== Graph-RAG with Cozo Memory + LlamaIndex ===\n');

  // Configure LlamaIndex
  Settings.llm = new OpenAI({ model: 'gpt-4', temperature: 0 });
  Settings.embedModel = new OpenAIEmbedding({ model: 'text-embedding-3-small' });

  // Create Cozo Memory vector store with Graph-RAG enabled
  const vectorStore = new CozoVectorStore({
    entityType: 'KnowledgeNode',
    useGraphRAG: true,
    graphRAGDepth: 3,  // Traverse up to 3 hops
    clientOptions: {
      serverPath: 'node',
      serverArgs: ['../../../dist/index.js']
    }
  });

  console.log('✓ Created vector store with Graph-RAG enabled\n');

  // Create interconnected documents about European geography
  const documents = [
    new Document({
      text: 'France is a country in Western Europe. Its capital is Paris. France borders Spain, Italy, Switzerland, Germany, and Belgium.',
      id_: 'doc-france',
      metadata: { type: 'country', region: 'Western Europe' }
    }),
    new Document({
      text: 'Paris is the capital of France. It is located on the Seine River and is known for art, fashion, and culture.',
      id_: 'doc-paris',
      metadata: { type: 'city', country: 'France' }
    }),
    new Document({
      text: 'The Eiffel Tower is an iron lattice tower in Paris. It was built in 1889 and is one of the most recognizable structures in the world.',
      id_: 'doc-eiffel',
      metadata: { type: 'landmark', city: 'Paris' }
    }),
    new Document({
      text: 'Germany borders France to the east. Its capital is Berlin. Germany is known for its engineering and automotive industry.',
      id_: 'doc-germany',
      metadata: { type: 'country', region: 'Central Europe' }
    }),
    new Document({
      text: 'The Seine River flows through Paris and is a major waterway in northern France. It is 777 kilometers long.',
      id_: 'doc-seine',
      metadata: { type: 'river', country: 'France' }
    })
  ]);

  console.log(`✓ Created ${documents.length} interconnected documents\n`);

  // Build index
  console.log('Building index with Graph-RAG...');
  const index = await VectorStoreIndex.fromDocuments(documents, { vectorStore });
  console.log('✓ Index built\n');

  // Create query engine
  const queryEngine = index.asQueryEngine();

  // Complex relational queries that benefit from graph traversal
  const queries = [
    'What landmarks are in the capital of the country that borders Germany?',
    'Tell me about the river that flows through the city with the Eiffel Tower',
    'What countries are connected to France and what are their capitals?'
  ];

  for (const query of queries) {
    console.log(`Query: ${query}`);
    const response = await queryEngine.query({ query });
    console.log(`Answer: ${response.toString()}\n`);
    console.log('---\n');
  }

  // Cleanup
  await vectorStore.close();
  console.log('✓ Closed connection');
}

main().catch(console.error);
