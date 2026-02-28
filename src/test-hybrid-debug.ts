import { MemoryServer } from './index';

async function debugHybridSearch() {
  console.log('Initializing MemoryServer...');
  const server = new MemoryServer();
  await server.initPromise;
  
  // Check database content
  console.log('\n=== Database Content ===');
  const entities = await server.db.run('?[id, name, type] := *entity{id, name, type, @ "NOW"}');
  console.log(`Entities: ${entities.rows.length}`);
  entities.rows.slice(0, 3).forEach((row: any) => {
    console.log(`  - ${row[1]} (${row[2]})`);
  });
  
  const observations = await server.db.run('?[id, text] := *observation{id, text, @ "NOW"}');
  console.log(`\nObservations: ${observations.rows.length}`);
  observations.rows.slice(0, 3).forEach((row: any) => {
    console.log(`  - ${row[1].substring(0, 60)}...`);
  });
  
  // Test embedding
  console.log('\n=== Test Embedding ===');
  const testEmbedding = await server.embeddingService.embed('Alice');
  console.log(`Embedding dimensions: ${testEmbedding.length}`);
  console.log(`First 5 values: ${testEmbedding.slice(0, 5)}`);
  
  // Test HNSW search directly
  console.log('\n=== Test HNSW Search Directly ===');
  try {
    const hnswQuery = `
      ?[id, name, type, dist] := 
        ~entity:name_semantic{id | query: vec([${testEmbedding.join(',')}]), k: 5, bind_distance: dist},
        *entity{id, name, type, @ "NOW"}
    `;
    const hnswResult = await server.db.run(hnswQuery);
    console.log(`HNSW results: ${hnswResult.rows.length}`);
    hnswResult.rows.forEach((row: any) => {
      console.log(`  - ${row[1]} (${row[2]}) - distance: ${row[3]}`);
    });
  } catch (e: any) {
    console.error('HNSW error:', e.message);
  }
  
  // Test hybridSearch
  console.log('\n=== Test HybridSearch ===');
  const searchResult = await server.hybridSearch.search({
    query: 'Alice',
    limit: 5,
    includeEntities: true,
    includeObservations: true
  });
  console.log('HybridSearch result:', JSON.stringify(searchResult, null, 2));
}

debugHybridSearch().catch(console.error);
