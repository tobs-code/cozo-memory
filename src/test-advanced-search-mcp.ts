import { MemoryServer } from './index';
import * as fs from 'fs';

const TEST_DB_PATH = 'test_advanced_search_mcp';

async function runTest() {
  console.error('=== Testing qafd_search and hierarchical_memory_query MCP Tools ===\n');

  // Clean up old test database
  const dbFile = `${TEST_DB_PATH}.db`;
  if (fs.existsSync(dbFile)) {
    try {
      fs.unlinkSync(dbFile);
      console.error('[Cleanup] Removed old test database');
    } catch (e) {
      console.error('[Cleanup] Warning: Could not remove old database:', e);
    }
  }

  const server = new MemoryServer(TEST_DB_PATH);
  await server.initPromise;

  try {
    console.error('1. Creating test entities and relationships...');
    
    const entity1 = await server.createEntity({ 
      name: 'Machine Learning', 
      type: 'Topic', 
      metadata: {} 
    });
    
    const entity2 = await server.createEntity({ 
      name: 'Neural Networks', 
      type: 'Topic', 
      metadata: {} 
    });
    
    const entity3 = await server.createEntity({ 
      name: 'Deep Learning', 
      type: 'Topic', 
      metadata: {} 
    });
    
    console.error(`✓ Created 3 entities\n`);

    // Create relationships
    await server.createRelation({
      from_id: entity1.id!,
      to_id: entity2.id!,
      relation_type: 'includes',
      strength: 0.9
    });
    
    await server.createRelation({
      from_id: entity2.id!,
      to_id: entity3.id!,
      relation_type: 'specializes_to',
      strength: 0.85
    });
    
    console.error('✓ Created relationships\n');

    // Add observations at different levels
    await server.addObservation({
      entity_id: entity1.id!,
      text: 'Machine learning is a subset of artificial intelligence',
      metadata: { memory_level: 0 },
      deduplicate: false
    });
    
    await server.addObservation({
      entity_id: entity2.id!,
      text: 'Neural networks are inspired by biological neurons',
      metadata: { memory_level: 0 },
      deduplicate: false
    });
    
    await server.addObservation({
      entity_id: entity3.id!,
      text: 'Deep learning uses multiple layers of neural networks',
      metadata: { memory_level: 1 },
      deduplicate: false
    });
    
    console.error('✓ Added observations at different memory levels\n');

    console.error('2. Testing qafd_search (Query-Aware Flow Diffusion)...');
    
    const qafdResult = await server.getQueryAwareTraversal().hybridSearch(
      'artificial intelligence and neural networks',
      {
        seedTopK: 2,
        maxHops: 2,
        dampingFactor: 0.85,
        minScore: 0.05,
        topK: 10
      }
    );
    
    console.error(`✓ QAFD search completed: ${qafdResult.length} results found`);
    
    if (qafdResult.length > 0) {
      console.error('\n3. Analyzing QAFD results...');
      qafdResult.slice(0, 3).forEach((result: any, i: number) => {
        console.error(`\n  Result ${i + 1}:`);
        console.error(`    Entity: ${result.name || result.entity_name || 'Unknown'}`);
        console.error(`    Score: ${result.score?.toFixed(4) || result.finalScore?.toFixed(4) || 'N/A'}`);
        console.error(`    Hops: ${result.hops || result.hop || 0}`);
      });
    }

    console.error('\n4. Testing hierarchical_memory_query...');
    
    // Query all levels
    const queryEmbedding = await server.embeddingService.embed('neural networks and deep learning');
    
    const allLevelsResult = await server.db.run(`
      ?[id, entity_id, text, memory_level, dist] :=
        ~observation:semantic{
          id | 
          query: vec($embedding), 
          k: 10, 
          ef: 100, 
          bind_distance: dist
        },
        *observation{id, entity_id, text, metadata, @ "NOW"},
        memory_level = get(metadata, "memory_level", 0)
      
      :order dist
    `, { embedding: queryEmbedding });
    
    const observations = allLevelsResult.rows.map((r: any) => ({
      id: r[0],
      entity_id: r[1],
      text: r[2],
      memory_level: r[3],
      distance: r[4]
    }));
    
    console.error(`✓ Hierarchical memory query completed: ${observations.length} results found`);
    
    if (observations.length > 0) {
      console.error('\n5. Analyzing hierarchical memory results...');
      
      const byLevel: Record<number, number> = {};
      observations.forEach((obs: any) => {
        byLevel[obs.memory_level] = (byLevel[obs.memory_level] || 0) + 1;
      });
      
      console.error('  Distribution by level:');
      Object.entries(byLevel).forEach(([level, count]) => {
        console.error(`    L${level}: ${count} observations`);
      });
      
      console.error('\n  Top 3 results:');
      observations.slice(0, 3).forEach((obs: any, i: number) => {
        console.error(`\n    ${i + 1}. Level ${obs.memory_level}`);
        console.error(`       Text: ${obs.text.substring(0, 60)}...`);
        console.error(`       Distance: ${obs.distance.toFixed(4)}`);
      });
    }

    console.error('\n6. Testing hierarchical_memory_query with level filter...');
    
    const l0OnlyResult = await server.db.run(`
      ?[id, entity_id, text, memory_level, dist] :=
        ~observation:semantic{
          id | 
          query: vec($embedding), 
          k: 10, 
          ef: 100, 
          bind_distance: dist
        },
        *observation{id, entity_id, text, metadata, @ "NOW"},
        memory_level = get(metadata, "memory_level", 0),
        memory_level = 0
      
      :order dist
    `, { embedding: queryEmbedding });
    
    console.error(`✓ L0-only query completed: ${l0OnlyResult.rows.length} results found`);

    console.error('\n=== ✓ Advanced Search MCP Tools Test Passed ===\n');

  } catch (error) {
    console.error('\n=== ✗ Test Failed ===');
    console.error('Error:', error);
    throw error;
  } finally {
    // Cleanup
    server.db.close();
    if (fs.existsSync(dbFile)) {
      try {
        fs.unlinkSync(dbFile);
        console.error('[Cleanup] Test database removed');
      } catch (e) {
        console.error('[Cleanup] Warning: Could not remove test database');
      }
    }
  }
}

runTest().catch(console.error);
