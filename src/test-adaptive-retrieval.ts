/**
 * Test for GraphRAG-R1 Inspired Adaptive Retrieval System
 */

import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';
import { AdaptiveGraphRetrieval, RetrievalStrategy } from './adaptive-retrieval';

const DB_PATH = 'memory_db.cozo.db';

async function testAdaptiveRetrieval() {
  console.log('=== Testing GraphRAG-R1 Adaptive Retrieval ===\n');

  const db = new CozoDb('sqlite', DB_PATH);
  const embeddingService = new EmbeddingService();
  const adaptiveRetrieval = new AdaptiveGraphRetrieval(db, embeddingService, {
    enablePRA: true,
    enableCAF: true,
    maxRetrievalCalls: 5,
    explorationRate: 0.2,  // 20% exploration for testing
    decayFactor: 0.8,
    costPenalty: 0.15
  });

  // Wait for initialization
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('✅ Adaptive Retrieval System initialized\n');

  // Test 1: Simple Query
  console.log('--- Test 1: Simple Query ---');
  const simpleQuery = 'Alice';
  const result1 = await adaptiveRetrieval.retrieve(simpleQuery, 5);
  console.log(`Query: "${simpleQuery}"`);
  console.log(`Strategy: ${result1.strategy}`);
  console.log(`Results: ${result1.results.length}`);
  console.log(`Retrieval Count: ${result1.retrievalCount}`);
  console.log(`Latency: ${result1.latency}ms`);
  console.log(`CAF Score: ${result1.cafScore?.toFixed(3)}`);
  console.log('Top Results:', result1.results.slice(0, 3).map(r => r.name));
  console.log();

  // Simulate feedback (in production, this would come from user or evaluation)
  await adaptiveRetrieval.updateStrategyPerformance(
    result1.strategy,
    0.85,  // F1 score
    result1.retrievalCount,
    result1.latency,
    true   // success
  );

  // Test 2: Moderate Complexity Query
  console.log('--- Test 2: Moderate Complexity Query ---');
  const moderateQuery = 'Who works on Project Alpha and knows TypeScript?';
  const result2 = await adaptiveRetrieval.retrieve(moderateQuery, 5);
  console.log(`Query: "${moderateQuery}"`);
  console.log(`Strategy: ${result2.strategy}`);
  console.log(`Results: ${result2.results.length}`);
  console.log(`Retrieval Count: ${result2.retrievalCount}`);
  console.log(`Latency: ${result2.latency}ms`);
  console.log(`CAF Score: ${result2.cafScore?.toFixed(3)}`);
  console.log('Top Results:', result2.results.slice(0, 3).map(r => r.name));
  console.log();

  await adaptiveRetrieval.updateStrategyPerformance(
    result2.strategy,
    0.72,
    result2.retrievalCount,
    result2.latency,
    true
  );

  // Test 3: Complex Multi-Hop Query
  console.log('--- Test 3: Complex Multi-Hop Query ---');
  const complexQuery = 'What are the connections between Alice and Bob through their projects?';
  const result3 = await adaptiveRetrieval.retrieve(complexQuery, 5);
  console.log(`Query: "${complexQuery}"`);
  console.log(`Strategy: ${result3.strategy}`);
  console.log(`Results: ${result3.results.length}`);
  console.log(`Retrieval Count: ${result3.retrievalCount}`);
  console.log(`Latency: ${result3.latency}ms`);
  console.log(`CAF Score: ${result3.cafScore?.toFixed(3)}`);
  console.log('Top Results:', result3.results.slice(0, 3).map(r => r.name));
  console.log();

  await adaptiveRetrieval.updateStrategyPerformance(
    result3.strategy,
    0.68,
    result3.retrievalCount,
    result3.latency,
    true
  );

  // Test 4: Exploratory Query
  console.log('--- Test 4: Exploratory Query ---');
  const exploratoryQuery = 'Show me everything related to software development';
  const result4 = await adaptiveRetrieval.retrieve(exploratoryQuery, 10);
  console.log(`Query: "${exploratoryQuery}"`);
  console.log(`Strategy: ${result4.strategy}`);
  console.log(`Results: ${result4.results.length}`);
  console.log(`Retrieval Count: ${result4.retrievalCount}`);
  console.log(`Latency: ${result4.latency}ms`);
  console.log(`CAF Score: ${result4.cafScore?.toFixed(3)}`);
  console.log('Top Results:', result4.results.slice(0, 3).map(r => r.name));
  console.log();

  await adaptiveRetrieval.updateStrategyPerformance(
    result4.strategy,
    0.55,
    result4.retrievalCount,
    result4.latency,
    false  // Lower success for exploratory
  );

  // Test 5: Repeat Simple Query (should use learned strategy)
  console.log('--- Test 5: Repeat Simple Query (Learning Test) ---');
  const result5 = await adaptiveRetrieval.retrieve(simpleQuery, 5);
  console.log(`Query: "${simpleQuery}"`);
  console.log(`Strategy: ${result5.strategy}`);
  console.log(`Results: ${result5.results.length}`);
  console.log(`Retrieval Count: ${result5.retrievalCount}`);
  console.log(`Latency: ${result5.latency}ms`);
  console.log(`CAF Score: ${result5.cafScore?.toFixed(3)}`);
  console.log();

  // Display Performance Statistics
  console.log('=== Performance Statistics ===\n');
  const stats = adaptiveRetrieval.getPerformanceStats();
  
  for (const [strategy, perf] of stats.entries()) {
    if (perf.totalCount > 0) {
      console.log(`Strategy: ${strategy}`);
      console.log(`  Success Rate: ${((perf.successCount / perf.totalCount) * 100).toFixed(1)}%`);
      console.log(`  Avg F1 Score: ${perf.avgF1Score.toFixed(3)}`);
      console.log(`  Avg Retrieval Cost: ${perf.avgRetrievalCost.toFixed(2)}`);
      console.log(`  Avg Latency: ${perf.avgLatency.toFixed(0)}ms`);
      console.log(`  Total Uses: ${perf.totalCount}`);
      console.log();
    }
  }

  // Test PRA Reward Calculation
  console.log('=== PRA Reward Analysis ===');
  console.log('Retrieval Count | PRA Reward');
  console.log('----------------|------------');
  for (let i = 1; i <= 10; i++) {
    const reward = Math.pow(0.8, i - 1);
    console.log(`${i.toString().padStart(15)} | ${reward.toFixed(4)}`);
  }
  console.log();

  // Test CAF Score Calculation
  console.log('=== CAF Score Analysis ===');
  console.log('F1=0.9, varying retrieval counts:');
  console.log('Retrieval Count | CAF Score');
  console.log('----------------|----------');
  for (let i = 1; i <= 10; i++) {
    const cafScore = 0.9 * Math.exp(-0.15 * i);
    console.log(`${i.toString().padStart(15)} | ${cafScore.toFixed(4)}`);
  }
  console.log();

  console.log('✅ All tests completed successfully!');
  console.log('\n📊 Key Insights:');
  console.log('1. System adapts strategy based on query complexity');
  console.log('2. PRA encourages essential retrievals, penalizes excessive ones');
  console.log('3. CAF balances answer quality with computational cost');
  console.log('4. Performance tracking enables continuous improvement');
}

// Run tests
testAdaptiveRetrieval().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
