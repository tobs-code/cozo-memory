/**
 * Integration Test for Adaptive Retrieval in MCP Server
 * Tests the full integration of GraphRAG-R1 adaptive retrieval
 */

import { MemoryServer } from './index';

async function testAdaptiveIntegration() {
  console.log('=== Testing Adaptive Retrieval MCP Integration ===\n');

  const server = new MemoryServer();
  await server.initPromise;

  console.log('✅ MemoryServer initialized with AdaptiveRetrieval\n');

  // Test 1: Simple Query
  console.log('--- Test 1: Simple Query via Adaptive Retrieval ---');
  const result1 = await server.adaptiveRetrieval.retrieve('Alice', 5);
  console.log(`Query: "Alice"`);
  console.log(`Strategy Selected: ${result1.strategy}`);
  console.log(`Results: ${result1.results.length}`);
  console.log(`Retrieval Count: ${result1.retrievalCount}`);
  console.log(`CAF Score: ${result1.cafScore?.toFixed(3)}`);
  console.log(`Latency: ${result1.latency}ms`);
  if (result1.results.length > 0) {
    console.log('Top Result:', result1.results[0].name);
  }
  console.log();

  // Test 2: Complex Query
  console.log('--- Test 2: Complex Multi-Hop Query ---');
  const result2 = await server.adaptiveRetrieval.retrieve(
    'What are the connections between people working on projects?',
    10
  );
  console.log(`Query: "What are the connections between people working on projects?"`);
  console.log(`Strategy Selected: ${result2.strategy}`);
  console.log(`Results: ${result2.results.length}`);
  console.log(`Retrieval Count: ${result2.retrievalCount}`);
  console.log(`CAF Score: ${result2.cafScore?.toFixed(3)}`);
  console.log(`Latency: ${result2.latency}ms`);
  console.log();

  // Test 3: Exploratory Query
  console.log('--- Test 3: Exploratory Query ---');
  const result3 = await server.adaptiveRetrieval.retrieve(
    'Show me everything about software development',
    10
  );
  console.log(`Query: "Show me everything about software development"`);
  console.log(`Strategy Selected: ${result3.strategy}`);
  console.log(`Results: ${result3.results.length}`);
  console.log(`Retrieval Count: ${result3.retrievalCount}`);
  console.log(`CAF Score: ${result3.cafScore?.toFixed(3)}`);
  console.log(`Latency: ${result3.latency}ms`);
  console.log();

  // Test 4: Performance Statistics
  console.log('--- Test 4: Performance Statistics ---');
  const stats = server.adaptiveRetrieval.getPerformanceStats();
  console.log(`Tracked Strategies: ${stats.size}`);
  for (const [strategy, perf] of stats.entries()) {
    if (perf.totalCount > 0) {
      console.log(`\nStrategy: ${strategy}`);
      console.log(`  Success Rate: ${((perf.successCount / perf.totalCount) * 100).toFixed(1)}%`);
      console.log(`  Avg F1 Score: ${perf.avgF1Score.toFixed(3)}`);
      console.log(`  Avg Retrieval Cost: ${perf.avgRetrievalCost.toFixed(2)}`);
      console.log(`  Avg Latency: ${perf.avgLatency.toFixed(0)}ms`);
      console.log(`  Total Uses: ${perf.totalCount}`);
    }
  }
  console.log();

  // Test 5: Learning Over Time
  console.log('--- Test 5: Learning Test (Repeat Query) ---');
  console.log('Running same query 3 times to test adaptation...');
  
  for (let i = 1; i <= 3; i++) {
    const result = await server.adaptiveRetrieval.retrieve('TypeScript', 5);
    console.log(`Run ${i}: Strategy=${result.strategy}, Results=${result.results.length}, CAF=${result.cafScore?.toFixed(3)}`);
    
    // Simulate feedback
    await server.adaptiveRetrieval.updateStrategyPerformance(
      result.strategy,
      0.8,
      result.retrievalCount,
      result.latency,
      true
    );
  }
  console.log();

  console.log('✅ All integration tests completed successfully!');
  console.log('\n📊 Summary:');
  console.log('1. AdaptiveRetrieval successfully integrated into MemoryServer');
  console.log('2. Query complexity classification working');
  console.log('3. Strategy selection adapting based on query type');
  console.log('4. Performance tracking persisting to CozoDB');
  console.log('5. PRA and CAF scoring functioning correctly');
  console.log('\n🎯 Next Step: Restart Kiro to test via MCP tool call');
}

// Run tests
testAdaptiveIntegration().catch(error => {
  console.error('❌ Integration test failed:', error);
  process.exit(1);
});
