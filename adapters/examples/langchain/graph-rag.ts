/**
 * Graph-RAG example using Cozo Memory
 * 
 * This example demonstrates:
 * - Building a knowledge graph with entities and relationships
 * - Using Graph-RAG for deep relational reasoning
 * - Traversing relationships to find connected knowledge
 */

import { CozoMemoryRetriever } from '@cozo-memory/langchain';
import { CozoMemoryClient } from '@cozo-memory/adapters-core';
import { ChatOpenAI } from '@langchain/openai';
import { RetrievalQAChain } from 'langchain/chains';

async function buildKnowledgeGraph(client: CozoMemoryClient) {
  console.log('🕸️  Building knowledge graph...\n');

  // Create entities
  const alice = await client.createEntity('Alice', 'Person', { role: 'Developer' });
  const bob = await client.createEntity('Bob', 'Person', { role: 'Designer' });
  const projectX = await client.createEntity('Project X', 'Project', { status: 'active' });
  const featureFlags = await client.createEntity('Feature Flags', 'Technology', { category: 'DevOps' });

  // Add observations
  await client.addObservation(alice.id, 'Alice is a senior TypeScript developer with 5 years of experience');
  await client.addObservation(bob.id, 'Bob specializes in UI/UX design and has won several design awards');
  await client.addObservation(projectX.id, 'Project X is a new SaaS platform launching in Q2 2026');
  await client.addObservation(featureFlags.id, 'Feature flags enable gradual rollouts and A/B testing');

  // Create relationships
  await client.createRelationship(alice.id, projectX.id, 'works_on', 1.0);
  await client.createRelationship(bob.id, projectX.id, 'works_on', 1.0);
  await client.createRelationship(projectX.id, featureFlags.id, 'uses_technology', 0.9);
  await client.createRelationship(alice.id, bob.id, 'collaborates_with', 0.8);

  console.log('✅ Knowledge graph built\n');
  console.log('Entities: Alice, Bob, Project X, Feature Flags');
  console.log('Relationships: works_on, uses_technology, collaborates_with\n');
}

async function main() {
  console.log('🔗 Graph-RAG with Cozo Memory\n');

  // Create client and build knowledge graph
  const client = new CozoMemoryClient();
  await client.connect();
  await buildKnowledgeGraph(client);

  // Create retriever with Graph-RAG enabled
  const retriever = new CozoMemoryRetriever({
    client,
    useGraphRAG: true,
    graphRAGDepth: 2,  // Traverse up to 2 hops
    searchOptions: {
      limit: 10
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

  // Ask questions that require graph traversal
  const questions = [
    'What is Alice working on?',
    'What technologies does Project X use?',
    'Who is collaborating with Alice?',
    'What is Bob\'s role in the project?'
  ];

  for (const question of questions) {
    console.log(`\nQ: ${question}`);
    const result = await chain.call({ query: question });
    console.log(`A: ${result.text}`);
    
    // Show retrieved documents
    const docs = await retriever.getRelevantDocuments(question);
    console.log(`   📄 Retrieved ${docs.length} documents via graph traversal`);
  }

  // Close connections
  await retriever.close();
  console.log('\n✅ Done!');
}

main().catch(console.error);
