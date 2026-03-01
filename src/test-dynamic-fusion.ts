/**
 * Test Dynamic Fusion Framework
 * 
 * Tests the 4-path retrieval system with different fusion strategies
 */

import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';
import { DynamicFusionSearch, DEFAULT_FUSION_CONFIG } from './dynamic-fusion';
import { v4 as uuidv4 } from 'uuid';

async function setupTestData(db: CozoDb) {
  console.log('\n=== Setting up test data ===');
  
  const embeddingService = new EmbeddingService();
  
  // Create test entities
  const entities = [
    { name: 'TypeScript', type: 'Technology', description: 'Typed superset of JavaScript' },
    { name: 'React', type: 'Framework', description: 'JavaScript library for building user interfaces' },
    { name: 'Node.js', type: 'Runtime', description: 'JavaScript runtime built on Chrome V8 engine' },
    { name: 'CozoDB', type: 'Database', description: 'Embedded graph database with Datalog' },
    { name: 'HNSW', type: 'Algorithm', description: 'Hierarchical Navigable Small World for vector search' },
    { name: 'Graph RAG', type: 'Technique', description: 'Retrieval augmented generation using graph traversal' },
  ];
  
  const entityIds: string[] = [];
  
  for (const entity of entities) {
    const id = uuidv4();
    entityIds.push(id);
    
    const contentEmbedding = await embeddingService.embed(entity.description);
    const nameEmbedding = await embeddingService.embed(entity.name);
    
    await db.run(
      `?[id, name, type, metadata, content_embedding, name_embedding] <- [[$id, $name, $type, $metadata, vec($content_emb), vec($name_emb)]] :put entity {id => name, type, metadata, content_embedding, name_embedding}`,
      {
        id,
        name: entity.name,
        type: entity.type,
        metadata: { description: entity.description },
        content_emb: contentEmbedding,
        name_emb: nameEmbedding
      }
    );
    
    console.log(`Created entity: ${entity.name} (${entity.type})`);
  }
  
  // Create relationships
  const relationships = [
    { from: 0, to: 1, type: 'USED_WITH' }, // TypeScript -> React
    { from: 1, to: 2, type: 'RUNS_ON' },   // React -> Node.js
    { from: 3, to: 4, type: 'IMPLEMENTS' }, // CozoDB -> HNSW
    { from: 5, to: 3, type: 'USES' },       // Graph RAG -> CozoDB
    { from: 5, to: 4, type: 'LEVERAGES' },  // Graph RAG -> HNSW
  ];
  
  for (const rel of relationships) {
    await db.run(
      `?[from_id, to_id, relation_type] <- [[$from, $to, $type]] :put relationship {from_id, to_id => relation_type}`,
      {
        from: entityIds[rel.from],
        to: entityIds[rel.to],
        type: rel.type
      }
    );
    
    console.log(`Created relationship: ${entities[rel.from].name} -[${rel.type}]-> ${entities[rel.to].name}`);
  }
  
  return entityIds;
}

async function testVectorSearch(fusion: DynamicFusionSearch) {
  console.log('\n=== Test 1: Vector Search Only ===');
  
  const config = {
    vector: { enabled: true, weight: 1.0, topK: 5 },
    sparse: { enabled: false, weight: 0, topK: 5 },
    fts: { enabled: false, weight: 0, topK: 5 },
    graph: { enabled: false, weight: 0, maxDepth: 2 },
    fusion: { strategy: 'rrf' as const, rrfK: 60 }
  };
  
  const { results, stats } = await fusion.search('database with graph capabilities', config);
  
  console.log(`Found ${results.length} results in ${stats.fusionTime}ms`);
  console.log('Path contributions:', stats.pathContributions);
  
  results.slice(0, 3).forEach((r, i) => {
    console.log(`${i + 1}. ${r.name} (${r.type}) - Score: ${r.score.toFixed(4)} - Source: ${r.source}`);
  });
}

async function testHybridSearch(fusion: DynamicFusionSearch) {
  console.log('\n=== Test 2: Hybrid Search (All Paths) ===');
  
  const config = {
    vector: { enabled: true, weight: 0.4, topK: 10 },
    sparse: { enabled: true, weight: 0.3, topK: 10 },
    fts: { enabled: true, weight: 0.2, topK: 10 },
    graph: { enabled: true, weight: 0.1, maxDepth: 2, maxResults: 10 },
    fusion: { strategy: 'rrf' as const, rrfK: 60, deduplication: true }
  };
  
  const { results, stats } = await fusion.search('TypeScript React', config);
  
  console.log(`Found ${results.length} results in ${stats.fusionTime}ms`);
  console.log('Path contributions:', stats.pathContributions);
  console.log('Path times:', stats.pathTimes);
  
  results.slice(0, 5).forEach((r, i) => {
    console.log(`${i + 1}. ${r.name} (${r.type}) - Score: ${r.score.toFixed(4)} - Source: ${r.source}`);
    if (r.pathScores) {
      console.log(`   Path scores:`, r.pathScores);
    }
  });
}

async function testFusionStrategies(fusion: DynamicFusionSearch) {
  console.log('\n=== Test 3: Different Fusion Strategies ===');
  
  const query = 'graph database';
  const strategies: Array<'rrf' | 'weighted_sum' | 'max' | 'adaptive'> = ['rrf', 'weighted_sum', 'max', 'adaptive'];
  
  for (const strategy of strategies) {
    const config = {
      ...DEFAULT_FUSION_CONFIG,
      fusion: { ...DEFAULT_FUSION_CONFIG.fusion!, strategy }
    };
    
    const { results, stats } = await fusion.search(query, config);
    
    console.log(`\nStrategy: ${strategy.toUpperCase()}`);
    console.log(`Results: ${results.length}, Time: ${stats.fusionTime}ms`);
    
    if (results.length > 0) {
      console.log(`Top result: ${results[0].name} (Score: ${results[0].score.toFixed(4)})`);
    }
  }
}

async function testGraphExpansion(fusion: DynamicFusionSearch) {
  console.log('\n=== Test 4: Graph Expansion ===');
  
  const config = {
    vector: { enabled: true, weight: 0.5, topK: 3 },
    sparse: { enabled: false, weight: 0, topK: 5 },
    fts: { enabled: false, weight: 0, topK: 5 },
    graph: { enabled: true, weight: 0.5, maxDepth: 2, maxResults: 20 },
    fusion: { strategy: 'weighted_sum' as const, deduplication: true }
  };
  
  const { results, stats } = await fusion.search('React framework', config);
  
  console.log(`Found ${results.length} results in ${stats.fusionTime}ms`);
  console.log('Path contributions:', stats.pathContributions);
  
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.name} (${r.type}) - Score: ${r.score.toFixed(4)} - Source: ${r.source}`);
  });
}

async function testKeywordSearch(fusion: DynamicFusionSearch) {
  console.log('\n=== Test 5: Keyword-Heavy Search ===');
  
  const config = {
    vector: { enabled: true, weight: 0.2, topK: 10 },
    sparse: { enabled: true, weight: 0.5, topK: 10 },
    fts: { enabled: true, weight: 0.3, topK: 10 },
    graph: { enabled: false, weight: 0, maxDepth: 2 },
    fusion: { strategy: 'weighted_sum' as const, deduplication: true }
  };
  
  const { results, stats } = await fusion.search('JavaScript TypeScript', config);
  
  console.log(`Found ${results.length} results in ${stats.fusionTime}ms`);
  console.log('Path contributions:', stats.pathContributions);
  
  results.slice(0, 5).forEach((r, i) => {
    console.log(`${i + 1}. ${r.name} (${r.type}) - Score: ${r.score.toFixed(4)} - Source: ${r.source}`);
  });
}

async function initializeSchema(db: CozoDb, embeddingService: EmbeddingService) {
  console.log('Initializing database schema...');
  
  const dimensions = embeddingService.getDimensions();
  
  // Create entity table with HNSW indexes
  await db.run(`
    :create entity {
      id: String,
      =>
      name: String,
      type: String,
      metadata: Json,
      content_embedding: <F32; ${dimensions}>,
      name_embedding: <F32; ${dimensions}>
    }
  `);
  
  // Create HNSW indexes
  await db.run(`
    ::hnsw create entity:content_hnsw {
      dim: ${dimensions},
      m: 32,
      ef_construction: 200,
      fields: [content_embedding],
      distance: Cosine,
      extend_candidates: true,
      keep_pruned_connections: true,
    }
  `);
  
  await db.run(`
    ::hnsw create entity:name_hnsw {
      dim: ${dimensions},
      m: 32,
      ef_construction: 200,
      fields: [name_embedding],
      distance: Cosine,
      extend_candidates: true,
      keep_pruned_connections: true,
    }
  `);
  
  // Create FTS index
  await db.run(`
    ::fts create entity:name_fts {
      extractor: name,
      tokenizer: Simple,
      filters: [Lowercase, Stemmer('english'), Stopwords('en')],
    }
  `);
  
  // Create relationship table
  await db.run(`
    :create relationship {
      from_id: String,
      to_id: String,
      =>
      relation_type: String,
      strength: Float default 1.0,
      metadata: Json default {},
    }
  `);
  
  console.log('Schema initialized successfully');
}

async function main() {
  console.log('Dynamic Fusion Framework Test Suite');
  console.log('====================================');
  
  // Initialize database
  const db = new CozoDb();
  const embeddingService = new EmbeddingService();
  
  try {
    // Initialize schema
    await initializeSchema(db, embeddingService);
    
    // Setup test data
    await setupTestData(db);
    
    // Initialize Dynamic Fusion
    const fusion = new DynamicFusionSearch(db, embeddingService);
    
    // Run tests
    await testVectorSearch(fusion);
    await testHybridSearch(fusion);
    await testFusionStrategies(fusion);
    await testGraphExpansion(fusion);
    await testKeywordSearch(fusion);
    
    console.log('\n=== All tests completed successfully! ===');
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
