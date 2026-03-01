import 'dotenv/config';
import { EmbeddingService } from './embedding-service';
import * as path from 'path';
import * as fs from 'fs';

// Test data - verschiedene Szenarien
const TEST_QUERIES = [
  "What is machine learning?",
  "How do neural networks work?",
  "Explain quantum computing",
  "What are the benefits of TypeScript?",
  "How to optimize database queries?",
  "Best practices for API design",
  "Understanding distributed systems",
  "Introduction to graph databases",
  "Microservices architecture patterns",
  "Cloud computing fundamentals"
];

const TEST_DOCUMENTS = [
  "Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed.",
  "Neural networks are computing systems inspired by biological neural networks that constitute animal brains. They consist of interconnected nodes or neurons.",
  "Quantum computing uses quantum-mechanical phenomena such as superposition and entanglement to perform operations on data.",
  "TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale.",
  "Database query optimization involves analyzing and improving query performance through indexing, query rewriting, and execution plan analysis.",
  "API design best practices include using RESTful principles, proper versioning, clear documentation, and consistent error handling.",
  "Distributed systems are computing systems whose components are located on different networked computers, which communicate and coordinate their actions.",
  "Graph databases use graph structures with nodes, edges, and properties to represent and store data, ideal for connected data.",
  "Microservices architecture is an approach to developing a single application as a suite of small services, each running in its own process.",
  "Cloud computing delivers computing services including servers, storage, databases, networking, software, analytics, and intelligence over the Internet."
];

// Cosine similarity berechnen
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Test 1: Embedding-Geschwindigkeit
async function testEmbeddingSpeed(service: EmbeddingService, modelName: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST 1: Embedding-Geschwindigkeit - ${modelName}`);
  console.log('='.repeat(70));
  
  const times: number[] = [];
  
  // Warmup
  await service.embed("warmup");
  
  // Single embeddings
  for (const query of TEST_QUERIES) {
    const start = performance.now();
    await service.embed(query);
    const end = performance.now();
    times.push(end - start);
  }
  
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  
  console.log(`\nSingle Embedding Performance:`);
  console.log(`  Average: ${avgTime.toFixed(2)} ms`);
  console.log(`  Min:     ${minTime.toFixed(2)} ms`);
  console.log(`  Max:     ${maxTime.toFixed(2)} ms`);
  
  return { avgTime, minTime, maxTime };
}

// Test 2: Batch-Performance
async function testBatchPerformance(service: EmbeddingService, modelName: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST 2: Batch-Performance - ${modelName}`);
  console.log('='.repeat(70));
  
  const start = performance.now();
  await service.embedBatch(TEST_DOCUMENTS);
  const end = performance.now();
  
  const totalTime = end - start;
  const avgPerDoc = totalTime / TEST_DOCUMENTS.length;
  
  console.log(`\nBatch Embedding (${TEST_DOCUMENTS.length} documents):`);
  console.log(`  Total time:    ${totalTime.toFixed(2)} ms`);
  console.log(`  Avg per doc:   ${avgPerDoc.toFixed(2)} ms`);
  console.log(`  Throughput:    ${(1000 / avgPerDoc).toFixed(2)} docs/sec`);
  
  return { totalTime, avgPerDoc };
}

// Test 3: Semantic Similarity Quality
async function testSemanticSimilarity(service: EmbeddingService, modelName: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST 3: Semantic Similarity Quality - ${modelName}`);
  console.log('='.repeat(70));
  
  // Embed queries and documents
  const queryEmbeddings = await service.embedBatch(TEST_QUERIES);
  const docEmbeddings = await service.embedBatch(TEST_DOCUMENTS);
  
  // Expected matches (query index -> document index)
  const expectedMatches = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  
  let correctMatches = 0;
  const similarities: number[] = [];
  
  console.log(`\nTop Match for each Query:`);
  
  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const queryEmb = queryEmbeddings[i];
    
    // Calculate similarities with all documents
    const sims = docEmbeddings.map((docEmb, idx) => ({
      idx,
      similarity: cosineSimilarity(queryEmb, docEmb)
    }));
    
    // Sort by similarity
    sims.sort((a, b) => b.similarity - a.similarity);
    
    const topMatch = sims[0];
    const isCorrect = topMatch.idx === expectedMatches[i];
    
    if (isCorrect) correctMatches++;
    similarities.push(topMatch.similarity);
    
    console.log(`  Q${i}: "${TEST_QUERIES[i].substring(0, 40)}..."`);
    console.log(`       → Doc ${topMatch.idx} (sim: ${topMatch.similarity.toFixed(4)}) ${isCorrect ? '✓' : '✗'}`);
  }
  
  const accuracy = (correctMatches / TEST_QUERIES.length) * 100;
  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  
  console.log(`\nResults:`);
  console.log(`  Accuracy:          ${accuracy.toFixed(1)}% (${correctMatches}/${TEST_QUERIES.length})`);
  console.log(`  Avg Similarity:    ${avgSimilarity.toFixed(4)}`);
  
  return { accuracy, avgSimilarity, correctMatches };
}

// Test 4: Long Context Handling
async function testLongContext(service: EmbeddingService, modelName: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST 4: Long Context Handling - ${modelName}`);
  console.log('='.repeat(70));
  
  const shortText = "Machine learning is AI.";
  const mediumText = TEST_DOCUMENTS[0]; // ~150 chars
  const longText = TEST_DOCUMENTS.join(" "); // ~1000 chars
  const veryLongText = longText.repeat(5); // ~5000 chars
  
  const tests = [
    { name: "Short (~20 chars)", text: shortText },
    { name: "Medium (~150 chars)", text: mediumText },
    { name: "Long (~1000 chars)", text: longText },
    { name: "Very Long (~5000 chars)", text: veryLongText }
  ];
  
  console.log(`\nContext Length Performance:`);
  
  const results = [];
  for (const test of tests) {
    const start = performance.now();
    await service.embed(test.text);
    const end = performance.now();
    const time = end - start;
    
    console.log(`  ${test.name.padEnd(25)} ${time.toFixed(2)} ms`);
    results.push({ name: test.name, time });
  }
  
  return results;
}

// Test 5: Cache Performance
async function testCachePerformance(service: EmbeddingService, modelName: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST 5: Cache Performance - ${modelName}`);
  console.log('='.repeat(70));
  
  const testText = "Test cache performance";
  
  // First call (cold)
  const start1 = performance.now();
  await service.embed(testText);
  const end1 = performance.now();
  const coldTime = end1 - start1;
  
  // Second call (cached)
  const start2 = performance.now();
  await service.embed(testText);
  const end2 = performance.now();
  const cachedTime = end2 - start2;
  
  const speedup = coldTime / cachedTime;
  
  console.log(`\nCache Hit Performance:`);
  console.log(`  Cold (first call):   ${coldTime.toFixed(2)} ms`);
  console.log(`  Cached (second):     ${cachedTime.toFixed(2)} ms`);
  console.log(`  Speedup:             ${speedup.toFixed(1)}x faster`);
  
  const stats = service.getCacheStats();
  console.log(`\nCache Statistics:`);
  console.log(`  Size:     ${stats.size}/${stats.maxSize}`);
  console.log(`  Model:    ${stats.model}`);
  console.log(`  Dims:     ${stats.dimensions}`);
  
  return { coldTime, cachedTime, speedup };
}

// Test 6: Memory Usage
async function testMemoryUsage(service: EmbeddingService, modelName: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST 6: Memory Usage - ${modelName}`);
  console.log('='.repeat(70));
  
  const memBefore = process.memoryUsage();
  
  // Embed a batch
  await service.embedBatch(TEST_DOCUMENTS);
  
  const memAfter = process.memoryUsage();
  
  const heapUsedMB = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;
  const rssMB = (memAfter.rss - memBefore.rss) / 1024 / 1024;
  
  console.log(`\nMemory Usage (after batch embedding):`);
  console.log(`  Heap Used:    ${heapUsedMB.toFixed(2)} MB`);
  console.log(`  RSS:          ${rssMB.toFixed(2)} MB`);
  console.log(`  Total Heap:   ${(memAfter.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  
  return { heapUsedMB, rssMB };
}

// Main comparison function
async function runSingleModelTest(modelId: string) {
  console.log('\n' + '█'.repeat(70));
  console.log(`TESTING MODEL: ${modelId}`);
  console.log('█'.repeat(70));
  
  const service = new EmbeddingService();
  
  const results: any = {
    model: modelId,
    timestamp: new Date().toISOString()
  };
  
  // Run tests
  results.speed = await testEmbeddingSpeed(service, modelId);
  results.batch = await testBatchPerformance(service, modelId);
  results.similarity = await testSemanticSimilarity(service, modelId);
  results.longContext = await testLongContext(service, modelId);
  results.cache = await testCachePerformance(service, modelId);
  results.memory = await testMemoryUsage(service, modelId);
  
  // Save results
  const resultsPath = path.join(__dirname, '..', `embedding-results-${modelId.replace(/\//g, '-')}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  
  console.log(`\n✓ Results saved to: ${resultsPath}`);
  
  return results;
}

async function compareResults() {
  console.log('\n' + '█'.repeat(70));
  console.log('LOADING AND COMPARING RESULTS');
  console.log('█'.repeat(70));
  
  const bgeFile = path.join(__dirname, '..', 'embedding-results-Xenova-bge-m3.json');
  const pplxFile = path.join(__dirname, '..', 'embedding-results-perplexity-ai-pplx-embed-v1-0.6b.json');
  
  if (!fs.existsSync(bgeFile)) {
    console.error('\n✗ BGE-M3 results not found!');
    console.log('Please run: EMBEDDING_MODEL=Xenova/bge-m3 npm run compare-embeddings');
    return;
  }
  
  if (!fs.existsSync(pplxFile)) {
    console.error('\n✗ pplx-embed results not found!');
    console.log('Please run: EMBEDDING_MODEL=perplexity-ai/pplx-embed-v1-0.6b npm run compare-embeddings');
    return;
  }
  
  const bge = JSON.parse(fs.readFileSync(bgeFile, 'utf-8'));
  const pplx = JSON.parse(fs.readFileSync(pplxFile, 'utf-8'));
  
  // Print comparison summary
  console.log(`\n\n${'█'.repeat(70)}`);
  console.log('COMPARISON SUMMARY');
  console.log('█'.repeat(70));
  
  console.log(`\n1. EMBEDDING SPEED (lower is better)`);
  console.log(`   BGE-M3:     ${bge.speed.avgTime.toFixed(2)} ms`);
  console.log(`   pplx-embed: ${pplx.speed.avgTime.toFixed(2)} ms`);
  const speedDiff = ((pplx.speed.avgTime - bge.speed.avgTime) / bge.speed.avgTime * 100);
  console.log(`   Winner:     ${bge.speed.avgTime < pplx.speed.avgTime ? 'BGE-M3' : 'pplx-embed'} (${Math.abs(speedDiff).toFixed(1)}% ${speedDiff > 0 ? 'slower' : 'faster'})`);
  
  console.log(`\n2. BATCH THROUGHPUT (higher is better)`);
  const bgeThroughput = 1000 / bge.batch.avgPerDoc;
  const pplxThroughput = 1000 / pplx.batch.avgPerDoc;
  console.log(`   BGE-M3:     ${bgeThroughput.toFixed(2)} docs/sec`);
  console.log(`   pplx-embed: ${pplxThroughput.toFixed(2)} docs/sec`);
  console.log(`   Winner:     ${bgeThroughput > pplxThroughput ? 'BGE-M3' : 'pplx-embed'}`);
  
  console.log(`\n3. SEMANTIC SIMILARITY ACCURACY (higher is better)`);
  console.log(`   BGE-M3:     ${bge.similarity.accuracy.toFixed(1)}% (${bge.similarity.correctMatches}/${TEST_QUERIES.length})`);
  console.log(`   pplx-embed: ${pplx.similarity.accuracy.toFixed(1)}% (${pplx.similarity.correctMatches}/${TEST_QUERIES.length})`);
  console.log(`   Winner:     ${bge.similarity.accuracy > pplx.similarity.accuracy ? 'BGE-M3' : 'pplx-embed'} ${pplx.similarity.accuracy > bge.similarity.accuracy ? '🏆' : ''}`);
  
  console.log(`\n4. AVERAGE SIMILARITY SCORE (higher is better)`);
  console.log(`   BGE-M3:     ${bge.similarity.avgSimilarity.toFixed(4)}`);
  console.log(`   pplx-embed: ${pplx.similarity.avgSimilarity.toFixed(4)}`);
  const simDiff = ((pplx.similarity.avgSimilarity - bge.similarity.avgSimilarity) / bge.similarity.avgSimilarity * 100);
  console.log(`   Winner:     ${bge.similarity.avgSimilarity > pplx.similarity.avgSimilarity ? 'BGE-M3' : 'pplx-embed'} (${Math.abs(simDiff).toFixed(1)}% ${simDiff > 0 ? 'higher' : 'lower'})`);
  
  console.log(`\n5. CACHE SPEEDUP (higher is better)`);
  console.log(`   BGE-M3:     ${bge.cache.speedup.toFixed(1)}x`);
  console.log(`   pplx-embed: ${pplx.cache.speedup.toFixed(1)}x`);
  
  console.log(`\n6. MEMORY USAGE (lower is better)`);
  console.log(`   BGE-M3:     ${bge.memory.heapUsedMB.toFixed(2)} MB heap`);
  console.log(`   pplx-embed: ${pplx.memory.heapUsedMB.toFixed(2)} MB heap`);
  console.log(`   Winner:     ${bge.memory.heapUsedMB < pplx.memory.heapUsedMB ? 'BGE-M3' : 'pplx-embed'}`);
  
  // Score calculation
  let bgeScore = 0;
  let pplxScore = 0;
  
  if (bge.speed.avgTime < pplx.speed.avgTime) bgeScore++; else pplxScore++;
  if (bgeThroughput > pplxThroughput) bgeScore++; else pplxScore++;
  if (bge.similarity.accuracy > pplx.similarity.accuracy) bgeScore++; else pplxScore++;
  if (bge.similarity.avgSimilarity > pplx.similarity.avgSimilarity) bgeScore++; else pplxScore++;
  if (bge.memory.heapUsedMB < pplx.memory.heapUsedMB) bgeScore++; else pplxScore++;
  
  // Overall winner
  console.log(`\n${'='.repeat(70)}`);
  console.log('OVERALL SCORE');
  console.log('='.repeat(70));
  console.log(`\n  BGE-M3:     ${bgeScore}/5 wins`);
  console.log(`  pplx-embed: ${pplxScore}/5 wins`);
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('RECOMMENDATION');
  console.log('='.repeat(70));
  
  if (pplxScore > bgeScore) {
    console.log(`\n✓ pplx-embed-v1-0.6b is RECOMMENDED 🏆`);
    console.log(`  Reasons:`);
    if (pplx.similarity.accuracy > bge.similarity.accuracy) {
      console.log(`  ✓ Better semantic similarity accuracy (+${(pplx.similarity.accuracy - bge.similarity.accuracy).toFixed(1)}%)`);
    }
    if (pplx.similarity.avgSimilarity > bge.similarity.avgSimilarity) {
      console.log(`  ✓ Higher quality embeddings (+${(simDiff).toFixed(1)}%)`);
    }
    console.log(`  ✓ 32K context length (vs 8K for BGE-M3)`);
    console.log(`  ✓ Better MTEB benchmark scores`);
  } else if (bgeScore > pplxScore) {
    console.log(`\n✓ BGE-M3 is RECOMMENDED 🏆`);
    console.log(`  Reasons:`);
    if (bge.speed.avgTime < pplx.speed.avgTime) {
      console.log(`  ✓ Faster embedding speed (-${Math.abs(speedDiff).toFixed(1)}%)`);
    }
    if (bge.memory.heapUsedMB < pplx.memory.heapUsedMB) {
      console.log(`  ✓ Lower memory usage`);
    }
    console.log(`  ✓ Automatic download (no manual setup)`);
    console.log(`  ✓ Proven stability`);
  } else {
    console.log(`\n⚖ BOTH MODELS ARE EQUALLY COMPETITIVE`);
    console.log(`  Choose based on your priorities:`);
    console.log(`  - pplx-embed: Better quality, longer context (32K)`);
    console.log(`  - BGE-M3: Faster, easier setup, automatic download`);
  }
  
  console.log('\n' + '█'.repeat(70));
  console.log('COMPARISON COMPLETE');
  console.log('█'.repeat(70) + '\n');
}

// Main entry point
async function main() {
  const currentModel = process.env.EMBEDDING_MODEL || "Xenova/bge-m3";
  
  // Check if we should compare existing results
  const args = process.argv.slice(2);
  if (args.includes('--compare')) {
    await compareResults();
    return;
  }
  
  console.log('\n' + '█'.repeat(70));
  console.log('EMBEDDING MODEL BENCHMARK');
  console.log('█'.repeat(70));
  console.log(`\nCurrent model: ${currentModel}`);
  console.log('\nThis will run a comprehensive test suite including:');
  console.log('  1. Embedding speed');
  console.log('  2. Batch performance');
  console.log('  3. Semantic similarity quality');
  console.log('  4. Long context handling');
  console.log('  5. Cache performance');
  console.log('  6. Memory usage');
  console.log('\nEstimated time: 2-3 minutes\n');
  
  await runSingleModelTest(currentModel);
  
  console.log('\n' + '='.repeat(70));
  console.log('NEXT STEPS');
  console.log('='.repeat(70));
  
  if (currentModel === 'Xenova/bge-m3') {
    console.log('\nTo test pplx-embed, run:');
    console.log('  EMBEDDING_MODEL=perplexity-ai/pplx-embed-v1-0.6b npm run compare-embeddings');
  } else if (currentModel === 'perplexity-ai/pplx-embed-v1-0.6b') {
    console.log('\nTo test BGE-M3, run:');
    console.log('  EMBEDDING_MODEL=Xenova/bge-m3 npm run compare-embeddings');
  }
  
  console.log('\nTo compare both results, run:');
  console.log('  npm run compare-embeddings -- --compare');
  console.log();
}

// Run
main().catch(console.error);
