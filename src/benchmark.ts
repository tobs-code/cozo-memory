
import { MemoryServer } from "./index";
import { EmbeddingService } from "./embedding-service";
import path from "path";
import fs from "fs";
import { performance } from "perf_hooks";

const BENCHMARK_DB_PATH = path.join(process.cwd(), "benchmark_db");

async function runBenchmark() {
  console.log("🚀 Starting Performance Benchmark...");
  
  // Cleanup
  if (fs.existsSync(BENCHMARK_DB_PATH + ".db")) {
    fs.unlinkSync(BENCHMARK_DB_PATH + ".db");
  }

  // Measure Memory Baseline
  const memStart = process.memoryUsage();
  
  // Initialize Server
  console.log("• Initializing Server & Loading Embedding Model...");
  const initStart = performance.now();
  const server = new MemoryServer(BENCHMARK_DB_PATH);
  // Force embedding model load
  await server.embeddingService.embed("warmup");
  const initEnd = performance.now();
  console.log(`  -> Init Time: ${(initEnd - initStart).toFixed(2)}ms`);

  const memAfterInit = process.memoryUsage();
  console.log(`  -> Memory Increase (Init): ${((memAfterInit.rss - memStart.rss) / 1024 / 1024).toFixed(2)} MB RSS`);

  // Data Generation
  const NUM_ENTITIES = 50;
  const NUM_OBSERVATIONS = 200;
  const NUM_RELATIONS = 100;

  console.log(`\n• Generating Data (${NUM_ENTITIES} Entities, ${NUM_OBSERVATIONS} Observations, ${NUM_RELATIONS} Relations)...`);
  
  const dataStart = performance.now();
  
  // Entities
  const entities = [];
  for (let i = 0; i < NUM_ENTITIES; i++) {
    entities.push(await server.createEntity({
      name: `Entity_${i}`,
      type: i % 2 === 0 ? "Person" : "Project",
      metadata: { index: i }
    }));
  }

  // Observations
  for (let i = 0; i < NUM_OBSERVATIONS; i++) {
    const entity = entities[i % NUM_ENTITIES];
    // @ts-ignore
    await server.addObservation({
      // @ts-ignore
      entity_id: entity.id,
      text: `This is observation number ${i} for entity ${// @ts-ignore
      entity.name}. It contains some random keywords like apple, banana, and cherry.`
    });
  }

  // Relations
  for (let i = 0; i < NUM_RELATIONS; i++) {
    const from = entities[i % NUM_ENTITIES];
    const to = entities[(i + 1) % NUM_ENTITIES];
    // @ts-ignore
    await server.createRelation({
      // @ts-ignore
      from_id: from.id,
      // @ts-ignore
      to_id: to.id,
      relation_type: "related_to",
      strength: 0.5
    });
  }
  
  const dataEnd = performance.now();
  console.log(`  -> Data Ingestion Time: ${(dataEnd - dataStart).toFixed(2)}ms`);
  console.log(`  -> Avg Time per Operation: ${((dataEnd - dataStart) / (NUM_ENTITIES + NUM_OBSERVATIONS + NUM_RELATIONS)).toFixed(2)}ms`);

  const memAfterData = process.memoryUsage();
  console.log(`  -> Memory Increase (Data): ${((memAfterData.rss - memAfterInit.rss) / 1024 / 1024).toFixed(2)} MB RSS`);

  // Query Benchmark
  console.log("\n• Running Queries (Hybrid Search)...");
  
  const queries = [
    "observation number 10",
    "apple banana",
    "Entity_0",
    "Project related"
  ];

  const times: number[] = [];
  
  for (const q of queries) {
    const t0 = performance.now();
    await server.hybridSearch.search({
      query: q,
      limit: 10,
      includeEntities: true,
      includeObservations: true
    });
    const t1 = performance.now();
    times.push(t1 - t0);
    process.stdout.write(".");
  }
  console.log("");

  const avgQueryTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minQueryTime = Math.min(...times);
  const maxQueryTime = Math.max(...times);

  console.log(`  -> Avg Query Time: ${avgQueryTime.toFixed(2)}ms`);
  console.log(`  -> Min Query Time: ${minQueryTime.toFixed(2)}ms`);
  console.log(`  -> Max Query Time: ${maxQueryTime.toFixed(2)}ms`);

  // RRF Overhead Estimation (Approximation)
  // We perform a raw vector search (fastest component) and compare with hybrid search
  // This is a rough proxy because hybrid search does 5 parallel searches + RRF
  console.log("\n• Estimating RRF/Combination Overhead...");
  
  const tVecStart = performance.now();
  // Access private method via any cast or just simulate a similar query
  // Since we can't easily access private methods, we will rely on the fact that
  // Hybrid Search = Promise.all([Vector, Keyword, Graph]) + RRF
  // We'll run a search with ONLY vector enabled (by setting weights of others to 0? No, they still run)
  // We will try to run a pure DB query to simulate vector search time
  const vectorOnlyStart = performance.now();
  const qEmb = await server.embeddingService.embed("apple");
  await server.db.run(`
    ?[id, score] := ~entity_semantic { id | query: vec($qEmb), k: 10, ef: 20 }, score = 1.0
  `, { qEmb });
  const vectorOnlyEnd = performance.now();
  const vectorTime = vectorOnlyEnd - vectorOnlyStart;
  
  console.log(`  -> Raw Vector Search Time: ${vectorTime.toFixed(2)}ms`);
  console.log(`  -> Overhead (Hybrid Logic + RRF): ${(avgQueryTime - vectorTime).toFixed(2)}ms`);

  // Final Memory
  const memFinal = process.memoryUsage();
  console.log("\n• Final Memory Stats:");
  console.log(`  -> RSS: ${(memFinal.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  -> Heap Used: ${(memFinal.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  
  // Cleanup
  // @ts-ignore
  server.db.close();
  if (fs.existsSync(BENCHMARK_DB_PATH + ".db")) {
    fs.unlinkSync(BENCHMARK_DB_PATH + ".db");
  }
}

runBenchmark().catch(console.error);
