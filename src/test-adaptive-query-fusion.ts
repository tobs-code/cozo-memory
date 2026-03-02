/**
 * Test: Adaptive Query Fusion with Dynamic Weights
 * 
 * Tests query classification and adaptive weight selection
 */

import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';
import { AdaptiveQueryFusion, QueryIntent, QueryComplexity } from './adaptive-query-fusion';
import * as fs from 'fs';

const DB_PATH = 'test-adaptive-fusion.db';

async function testAdaptiveQueryFusion() {
  // Clean up old database
  if (fs.existsSync(DB_PATH)) {
    try {
      fs.unlinkSync(DB_PATH);
    } catch (e) {}
  }

  const db = new CozoDb('sqlite', DB_PATH);
  const embeddingService = new EmbeddingService();

  try {
    console.log('=== Adaptive Query Fusion Tests ===\n');

    const fusion = new AdaptiveQueryFusion(db, embeddingService, {
      enableLLM: false, // Disable LLM for testing (no Ollama required)
      cacheClassifications: true,
      maxCacheSize: 100
    });

    // Test cases with expected classifications
    const testQueries = [
      // FINDER queries (factual information seeking)
      {
        query: 'What is the capital of France?',
        expectedIntent: QueryIntent.FINDER,
        description: 'Simple factual question'
      },
      {
        query: 'When was the first iPhone released?',
        expectedIntent: QueryIntent.FINDER,
        description: 'Factual query with temporal aspect'
      },
      {
        query: 'Find me the latest news about AI developments',
        expectedIntent: QueryIntent.FINDER,
        description: 'Information seeking with recency'
      },

      // EVALUATOR queries (comparison/evaluation)
      {
        query: 'Compare TypeScript vs JavaScript',
        expectedIntent: QueryIntent.EVALUATOR,
        description: 'Direct comparison'
      },
      {
        query: 'What are the pros and cons of microservices?',
        expectedIntent: QueryIntent.EVALUATOR,
        description: 'Evaluation query'
      },
      {
        query: 'Which database is better for my use case?',
        expectedIntent: QueryIntent.EVALUATOR,
        description: 'Comparative evaluation'
      },

      // EXPLAINER queries (concept understanding)
      {
        query: 'How does machine learning work?',
        expectedIntent: QueryIntent.EXPLAINER,
        description: 'Concept explanation'
      },
      {
        query: 'Explain the concept of blockchain',
        expectedIntent: QueryIntent.EXPLAINER,
        description: 'Direct explanation request'
      },
      {
        query: 'Why is caching important in web development?',
        expectedIntent: QueryIntent.EXPLAINER,
        description: 'Why question (explanation)'
      },

      // GENERATOR queries (content creation)
      {
        query: 'Write a Python function to calculate fibonacci',
        expectedIntent: QueryIntent.GENERATOR,
        description: 'Code generation'
      },
      {
        query: 'Create a marketing strategy for a startup',
        expectedIntent: QueryIntent.GENERATOR,
        description: 'Content generation'
      },
      {
        query: 'Suggest a project structure for a Node.js app',
        expectedIntent: QueryIntent.GENERATOR,
        description: 'Suggestion/recommendation'
      }
    ];

    console.log('--- Test 1: Query Classification ---\n');

    for (const testCase of testQueries) {
      const classification = await fusion.classifyQuery(testCase.query);

      const match = classification.intent === testCase.expectedIntent ? '✓' : '✗';
      console.log(`${match} "${testCase.query}"`);
      console.log(`  Description: ${testCase.description}`);
      console.log(`  Intent: ${classification.intent} (expected: ${testCase.expectedIntent})`);
      console.log(`  Complexity: ${classification.complexity}`);
      console.log(`  Confidence: ${(classification.confidence * 100).toFixed(0)}%`);
      console.log(`  Method: ${classification.method}`);
      console.log();
    }

    console.log('--- Test 2: Adaptive Weights ---\n');

    const weightTestQueries = [
      'What is TypeScript?',           // FINDER + SIMPLE
      'Compare React vs Vue',          // EVALUATOR + MODERATE
      'Explain how async/await works', // EXPLAINER + MODERATE
      'Create a REST API'              // GENERATOR + MODERATE
    ];

    for (const query of weightTestQueries) {
      const weights = await fusion.getAdaptiveWeights(query);
      const classification = await fusion.getClassificationDetails(query);

      console.log(`Query: "${query}"`);
      console.log(`Intent: ${classification.intent}, Complexity: ${classification.complexity}`);
      console.log(`Weights:`);
      console.log(`  Vector: ${(weights.vector * 100).toFixed(0)}%`);
      console.log(`  Sparse: ${(weights.sparse * 100).toFixed(0)}%`);
      console.log(`  FTS:    ${(weights.fts * 100).toFixed(0)}%`);
      console.log(`  Graph:  ${(weights.graph * 100).toFixed(0)}%`);
      console.log();
    }

    console.log('--- Test 3: Caching ---\n');

    const cacheTestQuery = 'What is the meaning of life?';

    // First call (not cached)
    console.log(`First call: "${cacheTestQuery}"`);
    const start1 = Date.now();
    const result1 = await fusion.classifyQuery(cacheTestQuery);
    const time1 = Date.now() - start1;
    console.log(`Time: ${time1}ms`);

    // Second call (cached)
    console.log(`\nSecond call (should be cached): "${cacheTestQuery}"`);
    const start2 = Date.now();
    const result2 = await fusion.classifyQuery(cacheTestQuery);
    const time2 = Date.now() - start2;
    console.log(`Time: ${time2}ms`);
    console.log(`Speedup: ${(time1 / time2).toFixed(1)}x faster`);

    const cacheStats = fusion.getCacheStats();
    console.log(`\nCache stats: ${cacheStats.size}/${cacheStats.maxSize} entries`);

    console.log('\n--- Test 4: Complexity Classification ---\n');

    const complexityTests = [
      { query: 'What is AI?', expected: QueryComplexity.SIMPLE },
      { query: 'How does machine learning relate to AI?', expected: QueryComplexity.MODERATE },
      { query: 'Explain the relationship between neural networks, deep learning, and AI, and how they impact modern software development', expected: QueryComplexity.COMPLEX },
      { query: 'Tell me everything about cloud computing', expected: QueryComplexity.EXPLORATORY }
    ];

    for (const test of complexityTests) {
      const classification = await fusion.classifyQuery(test.query);
      const match = classification.complexity === test.expected ? '✓' : '✗';
      console.log(`${match} "${test.query}"`);
      console.log(`  Complexity: ${classification.complexity} (expected: ${test.expected})`);
      console.log();
    }

    console.log('=== All Tests Completed ===');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await db.close();
    // Clean up
    if (fs.existsSync(DB_PATH)) {
      try {
        fs.unlinkSync(DB_PATH);
      } catch (e) {}
    }
  }
}

testAdaptiveQueryFusion();
