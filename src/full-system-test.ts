
import { MemoryServer } from './index';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';

async function runFullSystemTest() {
  // DB path is handled internally by MemoryServer
  console.log("🚀 Starting Full System Test (v0.8.5)...");

  const memory = new MemoryServer();

  console.log("\n--- 1. Setup & Schema ---");
  await memory.initPromise;
  console.log("✅ Schema initialized.");

  console.log("\n--- 2. Data Ingest & Memory Creation ---");
  const e1 = await memory.createEntity({
    name: "user_123",
    type: "User",
    metadata: { description: "A test user" }
  }) as any;

  if (e1.error) {
    console.error("Failed to create entity:", e1.error);
    return;
  }

  const o1 = await memory.addObservation({
    entity_id: e1.id,
    text: "User prefers dark mode and likes coding in TypeScript.",
  });
  console.log("✅ Observation 1 added.");

  console.log("\n--- 3. Cache System (L1, L2, Semantic) ---");

  // Query 1: Cold start
  const t1 = performance.now();
  await memory.advancedSearch({ query: "dark mode preference" });
  const d1 = performance.now() - t1;
  console.log("Query 1 (Cold Start)...");
  console.log(`⏱️ Duration: ${d1.toFixed(2)}ms`);

  // Query 1: Repeat (L1 Cache)
  const t2 = performance.now();
  await memory.advancedSearch({ query: "dark mode preference" });
  const d2 = performance.now() - t2;
  console.log("\nQuery 1 (L1 Memory Cache)...");
  console.log(`⏱️ Duration: ${d2.toFixed(2)}ms`);
  if (d2 < 5) console.log("✅ SUCCESS: L1 Cache Hit (< 5ms)");

  // Query 2: Semantic Cache (similar query)
  // ... (rest of the test if any)
}

runFullSystemTest().catch(console.error);
