/**
 * Test: Explainable Retrieval Service
 * 
 * Tests the explainable retrieval functionality with various search types.
 */

import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';
import { ExplainableRetrievalService } from './explainable-retrieval';

const DB_PATH = 'test_explainable.cozo.db';

async function main() {
  console.log('='.repeat(80));
  console.log('Explainable Retrieval Service Test');
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
  const explainableService = new ExplainableRetrievalService(db, embeddingService);

  try {
    // Initialize database schema
    console.log('\n📊 Initializing database schema...');
    await initializeSchema(db);

    // Create test data
    console.log('\n📝 Creating test data...');
    await createTestData(db, embeddingService);

    // Test 1: Hybrid Search with Explanation
    console.log('\n' + '='.repeat(80));
    console.log('Test 1: Simple Search Results with Detailed Explanation');
    console.log('='.repeat(80));
    
    // Create mock results instead of using HybridSearch
    const mockResults = [
      {
        id: 'typescript',
        entity_id: 'typescript',
        name: 'TypeScript',
        type: 'Technology',
        score: 0.95,
        source: 'vector',
        metadata: { pagerank: 0.95 },
        pathScores: { vector: 0.95 }
      },
      {
        id: 'alice',
        entity_id: 'alice',
        name: 'Alice Johnson',
        type: 'Person',
        score: 0.85,
        source: 'vector,graph',
        metadata: { pagerank: 0.85 },
        pathScores: { vector: 0.80, graph: 0.90 }
      }
    ];

    const explainedHybrid = await explainableService.explainResults(
      mockResults,
      'TypeScript programming',
      'hybrid',
      {
        includePathVisualization: true,
        includeReasoningSteps: true,
        includeScoreBreakdown: true
      }
    );

    console.log(`\nFound ${explainedHybrid.length} results:\n`);
    explainedHybrid.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.name} (${result.type})`);
      console.log(`   Score: ${result.score.toFixed(4)}`);
      console.log(`   Source: ${result.source}`);
      console.log(`\n   📋 Summary: ${result.explanation.summary}`);
      console.log(`\n   🔍 Reasoning: ${result.explanation.reasoning}`);
      
      if (result.explanation.steps.length > 0) {
        console.log(`\n   📊 Reasoning Steps:`);
        result.explanation.steps.forEach(step => {
          console.log(`      ${step.step}. ${step.operation}: ${step.description}`);
          if (step.score !== undefined) {
            console.log(`         Score: ${step.score.toFixed(4)}`);
          }
        });
      }

      console.log(`\n   💯 Score Breakdown:`);
      console.log(`      Final Score: ${result.explanation.scoreBreakdown.finalScore.toFixed(4)}`);
      console.log(`      Formula: ${result.explanation.scoreBreakdown.formula}`);
      if (Object.keys(result.explanation.scoreBreakdown.components).length > 0) {
        console.log(`      Components:`);
        Object.entries(result.explanation.scoreBreakdown.components).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            console.log(`         ${key}: ${(value as number).toFixed(4)}`);
          }
        });
      }

      console.log(`\n   🎯 Confidence: ${(result.explanation.confidence * 100).toFixed(1)}%`);
      console.log(`   📍 Sources: ${result.explanation.sources.join(', ')}`);
    });

    // Test 2: Dynamic Fusion with Explanation
    console.log('\n' + '='.repeat(80));
    console.log('Test 2: Dynamic Fusion with Path Scores');
    console.log('='.repeat(80));

    const mockFusionResults = [
      {
        id: 'alice',
        entity_id: 'alice',
        name: 'Alice Johnson',
        type: 'Person',
        score: 0.92,
        source: 'vector,sparse,fts',
        metadata: {},
        pathScores: { vector: 0.88, sparse: 0.85, fts: 0.95, graph: 0.0 }
      },
      {
        id: 'typescript',
        entity_id: 'typescript',
        name: 'TypeScript',
        type: 'Technology',
        score: 0.90,
        source: 'vector,fts',
        metadata: {},
        pathScores: { vector: 0.92, sparse: 0.0, fts: 0.88, graph: 0.0 }
      }
    ];

    const explainedFusion = await explainableService.explainResults(
      mockFusionResults,
      'TypeScript expert',
      'dynamic_fusion',
      {
        includePathVisualization: false,
        includeReasoningSteps: true,
        includeScoreBreakdown: true
      }
    );

    console.log(`\nFound ${explainedFusion.length} results:\n`);
    explainedFusion.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.name} (${result.type})`);
      console.log(`   Score: ${result.score.toFixed(4)}`);
      console.log(`\n   📋 Summary: ${result.explanation.summary}`);
      console.log(`\n   🔍 Reasoning: ${result.explanation.reasoning}`);
      
      if (result.explanation.steps.length > 0) {
        console.log(`\n   📊 Reasoning Steps:`);
        result.explanation.steps.forEach(step => {
          console.log(`      ${step.step}. ${step.operation}: ${step.description}`);
          if (step.score !== undefined) {
            console.log(`         Score: ${step.score.toFixed(4)}`);
          }
        });
      }

      if (result.explanation.scoreBreakdown.components) {
        console.log(`\n   💯 Path Scores:`);
        Object.entries(result.explanation.scoreBreakdown.components).forEach(([key, value]) => {
          if (value !== undefined) {
            console.log(`      ${key}: ${(value as number).toFixed(4)}`);
          }
        });
      }
    });

    // Test 3: Graph-RAG with Path Visualization
    console.log('\n' + '='.repeat(80));
    console.log('Test 3: Graph-RAG with Path Visualization');
    console.log('='.repeat(80));

    const mockGraphResults = [
      {
        id: 'project-x',
        entity_id: 'project-x',
        name: 'Project X',
        type: 'Project',
        score: 0.88,
        source: 'graph',
        metadata: { pagerank: 0.7, depth: 2 },
        pathScores: { vector: 0.85, graph: 0.90 },
        depth: 2
      },
      {
        id: 'alice',
        entity_id: 'alice',
        name: 'Alice Johnson',
        type: 'Person',
        score: 0.85,
        source: 'graph',
        metadata: { pagerank: 0.85, depth: 1 },
        pathScores: { vector: 0.88, graph: 0.82 },
        depth: 1
      }
    ];

    const explainedGraph = await explainableService.explainResults(
      mockGraphResults,
      'TypeScript projects',
      'graph_rag',
      {
        includePathVisualization: true,
        includeReasoningSteps: true,
        includeScoreBreakdown: true
      }
    );

    console.log(`\nFound ${explainedGraph.length} results:\n`);
    explainedGraph.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.name} (${result.type})`);
      console.log(`   Score: ${result.score.toFixed(4)}`);
      
      console.log(`\n   📋 Summary: ${result.explanation.summary}`);
      console.log(`\n   🔍 Reasoning: ${result.explanation.reasoning}`);

      if (result.explanation.pathVisualization) {
        console.log(`\n   🗺️  Path Visualization:`);
        console.log(`      ${result.explanation.pathVisualization.textual}`);
        console.log(`      Total Hops: ${result.explanation.pathVisualization.totalHops}`);
        console.log(`      Confidence: ${(result.explanation.pathVisualization.confidence * 100).toFixed(1)}%`);
        
        if (result.explanation.pathVisualization.nodes.length > 0) {
          console.log(`\n      Nodes:`);
          result.explanation.pathVisualization.nodes.forEach(node => {
            console.log(`         ${node.position}. ${node.name} (${node.type}) - Score: ${(node.score || 0).toFixed(4)}`);
          });
        }

        if (result.explanation.pathVisualization.edges.length > 0) {
          console.log(`\n      Edges:`);
          result.explanation.pathVisualization.edges.forEach(edge => {
            console.log(`         ${edge.from} --[${edge.label}]--> ${edge.to}`);
          });
        }
      }

      if (result.explanation.steps.length > 0) {
        console.log(`\n   📊 Reasoning Steps:`);
        result.explanation.steps.forEach(step => {
          console.log(`      ${step.step}. ${step.operation}: ${step.description}`);
        });
      }
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
  try {
    await db.run('::remove entity');
  } catch (e) {
    // Ignore if doesn't exist
  }
  try {
    await db.run('::remove observation');
  } catch (e) {
    // Ignore if doesn't exist
  }
  try {
    await db.run('::remove relationship');
  } catch (e) {
    // Ignore if doesn't exist
  }
  try {
    await db.run('::remove entity_rank');
  } catch (e) {
    // Ignore if doesn't exist
  }
  try {
    await db.run('::remove search_cache');
  } catch (e) {
    // Ignore if doesn't exist
  }

  // Entity relation with dual embeddings
  await db.run(`
    :create entity {
      id: String,
      =>
      name: String,
      type: String,
      embedding: <F32; 1024>,
      name_embedding: <F32; 1024>,
      metadata: Json,
      created_at: Validity
    }
  `);

  // HNSW indices for content embeddings
  await db.run(`
    ::hnsw create entity:semantic {
      dim: 1024,
      m: 50,
      ef_construction: 200,
      fields: [embedding],
      distance: Cosine,
      extend_candidates: true,
      keep_pruned_connections: true
    }
  `);

  // HNSW index for name embeddings
  await db.run(`
    ::hnsw create entity:name_semantic {
      dim: 1024,
      m: 50,
      ef_construction: 200,
      fields: [name_embedding],
      distance: Cosine,
      extend_candidates: true,
      keep_pruned_connections: true
    }
  `);

  // FTS index for entity names
  await db.run(`
    ::fts create entity:fts {
      extractor: name,
      tokenizer: Simple,
      filters: [Lowercase, Stemmer('english'), Stopwords('en')]
    }
  `);

  // Search cache relation
  await db.run(`
    :create search_cache {
      query_hash: String,
      =>
      results: Json,
      timestamp: Int,
      query_text: String
    }
  `);

  // Observation relation
  await db.run(`
    :create observation {
      id: String,
      =>
      entity_id: String,
      text: String,
      embedding: <F32; 1024>,
      metadata: Json,
      created_at: Validity
    }
  `);

  // Relationship relation
  await db.run(`
    :create relationship {
      from_id: String,
      to_id: String,
      relation_type: String,
      =>
      strength: Float,
      metadata: Json,
      created_at: Validity
    }
  `);

  // Entity rank
  await db.run(`
    :create entity_rank {
      entity_id: String
      =>
      pagerank: Float,
      betweenness: Float
    }
  `);

  console.log('✅ Schema initialized');
}

async function createTestData(db: CozoDb, embeddingService: EmbeddingService) {
  const now = Date.now() * 1000; // microseconds

  // Create entities
  const entities = [
    { id: 'alice', name: 'Alice Johnson', type: 'Person', text: 'Alice is a TypeScript expert and senior developer' },
    { id: 'bob', name: 'Bob Smith', type: 'Person', text: 'Bob is a JavaScript developer learning TypeScript' },
    { id: 'typescript', name: 'TypeScript', type: 'Technology', text: 'TypeScript is a typed superset of JavaScript' },
    { id: 'project-x', name: 'Project X', type: 'Project', text: 'Project X is a large TypeScript application' },
    { id: 'react', name: 'React', type: 'Technology', text: 'React is a JavaScript library for building user interfaces' }
  ];

  for (const entity of entities) {
    const embedding = await embeddingService.embed(entity.text);
    const nameEmbedding = await embeddingService.embed(entity.name);

    await db.run(`
      ?[id, name, type, embedding, name_embedding, metadata, created_at] <- [[$id, $name, $type, $embedding, $name_embedding, $metadata, $created_at]]
      :put entity {id, name, type, embedding, name_embedding, metadata, created_at}
    `, {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      embedding,
      name_embedding: nameEmbedding,
      metadata: {},
      created_at: [now, true]
    });
  }

  // Create relationships
  const relationships = [
    { from: 'alice', to: 'typescript', type: 'expert_in', strength: 0.95 },
    { from: 'alice', to: 'project-x', type: 'works_on', strength: 0.9 },
    { from: 'bob', to: 'typescript', type: 'learning', strength: 0.6 },
    { from: 'project-x', to: 'typescript', type: 'uses', strength: 1.0 },
    { from: 'project-x', to: 'react', type: 'uses', strength: 0.8 }
  ];

  for (const rel of relationships) {
    await db.run(`
      ?[from_id, to_id, relation_type, strength, metadata, created_at] <- [[$from_id, $to_id, $relation_type, $strength, $metadata, $created_at]]
      :put relationship {from_id, to_id, relation_type, strength, metadata, created_at}
    `, {
      from_id: rel.from,
      to_id: rel.to,
      relation_type: rel.type,
      strength: rel.strength,
      metadata: {},
      created_at: [now, true]
    });
  }

  // Create PageRank scores
  await db.run(`
    ?[entity_id, pagerank, betweenness] <- [
      ['alice', 0.85, 0.5],
      ['typescript', 0.95, 0.8],
      ['project-x', 0.7, 0.3],
      ['bob', 0.4, 0.1],
      ['react', 0.6, 0.2]
    ]
    :put entity_rank {entity_id, pagerank, betweenness}
  `);

  console.log('✅ Test data created');
}

main().catch(console.error);
