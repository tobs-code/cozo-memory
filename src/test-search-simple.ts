import { MemoryServer } from './index';

async function testSearch() {
  console.log('Initializing MemoryServer...');
  const server = new MemoryServer();
  await server.initPromise;
  
  console.log('\n=== Testing Search ===');
  
  // Test simple search
  const result = await server.hybridSearch.search({
    query: 'Alice',
    limit: 5,
    includeEntities: true,
    includeObservations: true
  });
  
  console.log('Search result:', JSON.stringify(result, null, 2));
  
  // Check if result is array or object
  console.log('\nResult type:', typeof result);
  console.log('Is array:', Array.isArray(result));
  
  if (Array.isArray(result)) {
    console.log(`Found ${result.length} results`);
  } else {
    console.log('Result keys:', Object.keys(result));
  }
}

testSearch().catch(console.error);
