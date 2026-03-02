/**
 * Test: Query-Aware Flow Diffusion Traversal
 * 
 * Tests the QAFD-RAG inspired query-aware graph traversal.
 */

import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';
import { QueryAwareTraversal } from './query-aware-traversal';

const DB_PATH = 'test_query_aware.cozo.db';
const EMBEDDING_DIM = 1024;

async function main() {
  console.log('='.repeat(80));
  console.log('Query-Aware Flow Diffusion Traversal Test');
  console.log('='.repeat(80));

  // Delete existing database
  const fs = require('fs');
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('\n🗑️  Deleted existing database');
  }

  // Initialize services
  const db = new CozoDb('sqlite', DB_PATH);
  const embeddingService = new EmbeddingService();
  const queryAwareTraversal = new QueryAwareTraversal(db, embeddingService);

  try {
    // Initialize database schema
    console.log('\n📊 Initializing database schema...');
    await initializeSchema(db);

    // Create test data
    console.log('\n📝 Creating test data...');
    await createTestData(db, embeddingService);

    // Test 1: Single-seed traversal
    console.log('\n' + '='.repeat(80));
    console.log('Test 1: Query-Aware Traversal from Single Seed');
    console.log('='.repeat(80));

    const results1 = await queryAwareTraversal.traverse(
      'typescript',
      'TypeScript programming and development',
      {
        maxHops: 2,
        dampingFactor: 0.85,
        minScore: 0.05,
        topK: 10
      }
    );

    console.log(`\nFound ${results1.length} results:\n`);
    results1.forEach((result, index) => {
      console.log(`${index + 1}. ${result.name} (${result.type})`);
      console.log(`   Score: ${result.score.toFixed(4)}`);
      console.log(`   Hops: ${result.hops}`);
      console.log(`   Path Score: ${result.path_score.toFixed(4)}`);
    });

    // Test 2: Multi-seed traversal
    console.log('\n' + '='.repeat(80));
    console.log('Test 2: Query-Aware Traversal from Multiple Seeds');
    console.log('='.repeat(80));

    const results2 = await queryAwareTraversal.traverseFromSeeds(
      ['typescript', 'react'],
      'modern web development frameworks',
      {
        maxHops: 2,
        dampingFactor: 0.85,
        minScore: 0.05,
        topK: 10
      }
    );

    console.log(`\nFound ${results2.length} results:\n`);
    results2.forEach((result, index) => {
      console.log(`${index + 1}. ${result.name} (${result.type})`);
      console.log(`   Score: ${result.score.toFixed(4)}`);
      console.log(`   Hops: ${result.hops}`);
    });

    // Test 3: Hybrid search (Vector + Query-Aware Traversal)
    console.log('\n' + '='.repeat(80));
    console.log('Test 3: Hybrid Search (Vector Seeds + Query-Aware Traversal)');
    console.log('='.repeat(80));

    const results3 = await queryAwareTraversal.hybridSearch(
      'JavaScript frameworks for building user interfaces',
      {
        seedTopK: 3,
        maxHops: 2,
        dampingFactor: 0.85,
        minScore: 0.05,
        topK: 10
      }
    );

    console.log(`\nFound ${results3.length} results:\n`);
    results3.forEach((result, index) => {
      console.log(`${index + 1}. ${result.name} (${result.type})`);
      console.log(`   Score: ${result.score.toFixed(4)}`);
      console.log(`   Hops: ${result.hops}`);
      console.log(`   Source: ${result.source}`);
    });

    // Test 4: Filtered by relationship type
    console.log('\n' + '='.repeat(80));
    console.log('Test 4: Query-Aware Traversal with Relationship Filter');
    console.log('='.repeat(80));

    const results4 = await queryAwareTraversal.traverse(
      'alice',
      'TypeScript expertise and projects',
      {
        maxHops: 2,
        dampingFactor: 0.85,
        minScore: 0.05,
        topK: 10,
        relationTypes: ['expert_in', 'works_on']
      }
    );

    console.log(`\nFound ${results4.length} results (filtered by expert_in, works_on):\n`);
    results4.forEach((result, index) => {
      console.log(`${index + 1}. ${result.name} (${result.type})`);
      console.log(`   Score: ${result.score.toFixed(4)}`);
      console.log(`   Hops: ${result.hops}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ All tests completed successfully!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    db.close();
  }
}

async function initializeSchema(db: CozoDb) {
  // Drop existing relations if they exist
  try { await db.run('::remove entity'); } catch (e) { }
  try { await db.run('::remove relationship'); } catch (e) { }

  // Entity relation with embeddings
  await db.run(`
    :create entity {
      id: String,
      created_at: Validity
      =>
      name: String,
      type: String,
      embedding: <F32; ${EMBEDDING_DIM}>,
      metadata: Json
    }
  `);

  // HNSW index for semantic search
  await db.run(`
    ::hnsw create entity:semantic {
      dim: ${EMBEDDING_DIM},
      m: 50,
      ef_construction: 200,
      fields: [embedding],
      distance: Cosine,
      extend_candidates: true,
      keep_pruned_connections: true
    }
  `);

  // Relationship relation
  await db.run(`
    :create relationship {
      from_id: String,
      to_id: String,
      relation_type: String,
      created_at: Validity
      =>
      strength: Float,
      metadata: Json
    }
  `);

  console.log('✅ Schema initialized');
}

async function createTestData(db: CozoDb, embeddingService: EmbeddingService) {
  const now = Date.now() * 1000; // microseconds

  // Create entities with embeddings
  const entities = [
    { id: 'alice', name: 'Alice Johnson', type: 'Person', text: 'Alice is a senior TypeScript developer and expert in React' },
    { id: 'bob', name: 'Bob Smith', type: 'Person', text: 'Bob is a JavaScript developer learning TypeScript and Vue.js' },
    { id: 'typescript', name: 'TypeScript', type: 'Technology', text: 'TypeScript is a typed superset of JavaScript for large-scale applications' },
    { id: 'javascript', name: 'JavaScript', type: 'Technology', text: 'JavaScript is a dynamic programming language for web development' },
    { id: 'react', name: 'React', type: 'Framework', text: 'React is a JavaScript library for building user interfaces' },
    { id: 'vue', name: 'Vue.js', type: 'Framework', text: 'Vue.js is a progressive JavaScript framework for building UIs' },
    { id: 'angular', name: 'Angular', type: 'Framework', text: 'Angular is a TypeScript-based web application framework' },
    { id: 'project-x', name: 'Project X', type: 'Project', text: 'Project X is a large-scale TypeScript application using React' },
    { id: 'project-y', name: 'Project Y', type: 'Project', text: 'Project Y is a Vue.js application with TypeScript support' },
    { id: 'nodejs', name: 'Node.js', type: 'Runtime', text: 'Node.js is a JavaScript runtime built on Chrome V8 engine' }
  ];

  for (const entity of entities) {
    const embedding = await embeddingService.embed(entity.text);

    await db.run(`
      ?[id, created_at, name, type, embedding, metadata] <- [[$id, $created_at, $name, $type, $embedding, $metadata]]
      :put entity {id, created_at, name, type, embedding, metadata}
    `, {
      id: entity.id,
      created_at: [now, true],
      name: entity.name,
      type: entity.type,
      embedding,
      metadata: {}
    });
  }

  // Create relationships
  const relationships = [
    { from: 'alice', to: 'typescript', type: 'expert_in', strength: 0.95 },
    { from: 'alice', to: 'react', type: 'expert_in', strength: 0.90 },
    { from: 'alice', to: 'project-x', type: 'works_on', strength: 0.85 },
    { from: 'bob', to: 'javascript', type: 'expert_in', strength: 0.80 },
    { from: 'bob', to: 'typescript', type: 'learning', strength: 0.60 },
    { from: 'bob', to: 'vue', type: 'uses', strength: 0.75 },
    { from: 'bob', to: 'project-y', type: 'works_on', strength: 0.70 },
    { from: 'typescript', to: 'javascript', type: 'extends', strength: 1.0 },
    { from: 'react', to: 'javascript', type: 'uses', strength: 0.95 },
    { from: 'vue', to: 'javascript', type: 'uses', strength: 0.95 },
    { from: 'angular', to: 'typescript', type: 'uses', strength: 1.0 },
    { from: 'project-x', to: 'typescript', type: 'uses', strength: 1.0 },
    { from: 'project-x', to: 'react', type: 'uses', strength: 0.95 },
    { from: 'project-y', to: 'vue', type: 'uses', strength: 0.95 },
    { from: 'project-y', to: 'typescript', type: 'uses', strength: 0.80 },
    { from: 'react', to: 'nodejs', type: 'runs_on', strength: 0.85 },
    { from: 'vue', to: 'nodejs', type: 'runs_on', strength: 0.85 }
  ];

  for (const rel of relationships) {
    await db.run(`
      ?[from_id, to_id, relation_type, created_at, strength, metadata] <- [[$from_id, $to_id, $relation_type, $created_at, $strength, $metadata]]
      :put relationship {from_id, to_id, relation_type, created_at, strength, metadata}
    `, {
      from_id: rel.from,
      to_id: rel.to,
      relation_type: rel.type,
      created_at: [now, true],
      strength: rel.strength,
      metadata: {}
    });
  }

  console.log('✅ Test data created');
}

main().catch(console.error);
