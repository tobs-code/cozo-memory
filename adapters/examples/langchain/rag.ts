/**
 * RAG (Retrieval Augmented Generation) example using Cozo Memory
 * 
 * This example demonstrates:
 * - Ingesting documents into Cozo Memory
 * - Using CozoMemoryRetriever for semantic search
 * - Building a QA system with RetrievalQAChain
 */

import { CozoMemoryRetriever } from '@cozo-memory/langchain';
import { CozoMemoryClient } from '@cozo-memory/adapters-core';
import { ChatOpenAI } from '@langchain/openai';
import { RetrievalQAChain } from 'langchain/chains';

async function ingestDocuments(client: CozoMemoryClient) {
  console.log('📚 Ingesting documents...\n');

  // Create a knowledge base entity
  const kb = await client.createEntity(
    'Product Knowledge Base',
    'KnowledgeBase',
    { domain: 'product' }
  );

  // Add product information
  const docs = [
    'Our flagship product is the SmartWidget 3000. It features AI-powered automation and costs $299.',
    'The SmartWidget 3000 has a battery life of 48 hours and comes in three colors: black, white, and blue.',
    'We offer a 2-year warranty on all SmartWidget products. Extended warranty is available for $49.',
    'The SmartWidget 3000 is compatible with iOS 15+ and Android 12+. It connects via Bluetooth 5.0.',
    'Customer reviews rate the SmartWidget 3000 at 4.8/5 stars. Most praised features are battery life and ease of use.'
  ];

  for (const doc of docs) {
    await client.addObservation(kb.id, doc, {
      source: 'product_docs',
      indexed: true
    });
  }

  console.log(`✅ Ingested ${docs.length} documents\n`);
  return kb.id;
}

async function main() {
  console.log('🔍 RAG with Cozo Memory\n');

  // Create client and ingest documents
  const client = new CozoMemoryClient();
  await client.connect();
  await ingestDocuments(client);

  // Create retriever with hybrid search
  const retriever = new CozoMemoryRetriever({
    client,
    searchOptions: {
      limit: 3,
      rerank: true,
      include_observations: true
    }
  });

  // Create QA chain
  const chain = RetrievalQAChain.fromLLM(
    new ChatOpenAI({
      modelName: 'gpt-3.5-turbo',
      temperature: 0
    }),
    retriever
  );

  // Ask questions
  const questions = [
    'What is the price of the SmartWidget 3000?',
    'How long does the battery last?',
    'What warranty options are available?',
    'Is it compatible with my iPhone?'
  ];

  for (const question of questions) {
    console.log(`\nQ: ${question}`);
    const result = await chain.call({ query: question });
    console.log(`A: ${result.text}`);
  }

  // Close connections
  await retriever.close();
  console.log('\n✅ Done!');
}

main().catch(console.error);
