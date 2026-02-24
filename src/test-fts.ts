
import { MemoryServer } from "./index";
import path from "path";
import fs from "fs";

async function main() {
  console.log("🚀 Starting FTS (Full-Text Search) Test...");

  const memory = new MemoryServer();

  console.log("Waiting for schema...");
  await memory.initPromise;
  console.log("--- Schema ready ---");

  console.log("1. Creating Test Data...");
  // createEntity returns { id, name, type, status } or { error }
  const e1 = await memory.createEntity({ name: "Berlin", type: "City", metadata: { description: "Berlin" } }) as any;
  const e2 = await memory.createEntity({ name: "Munich", type: "City", metadata: { description: "Munich" } }) as any;

  console.log("Entity 1 created:", e1.id || e1.error);
  console.log("Entity 2 created:", e2.id || e2.error);

  if (e1.error || e2.error) {
    console.error("Failed to create entities");
    return;
  }

  console.log("Adding Observations...");
  await memory.addObservation({
    entity_id: e1.id,
    text: "Berlin is the capital of Germany. There are many museums.",
  });
  await memory.addObservation({
    entity_id: e2.id,
    text: "Munich is famous for Oktoberfest and technology development.",
  });
  await memory.addObservation({
    entity_id: e1.id,
    text: "The software is in beta stage and runs stably.",
  });

  console.log("Data created.");

  console.log("\n2. Testing FTS Search...");

  console.log("\n--- Test 1: Search for 'Capital' ---");
  const res1 = await memory.advancedSearch({ query: "Capital", limit: 5 });
  console.log(`Found: ${res1.length} results`);
  res1.forEach((r: any) => console.log(` - [${r.source}] ${r.text?.substring(0, 50)}... (Score: ${r.score.toFixed(4)})`));

  console.log("\n--- Test 2: Stemming Test ('developed' should find 'development') ---");
  // "developed" stem -> "develop", "development" stem -> "develop"
  // Cozo uses tantivy, check language support. Defaults to English?
  const res2 = await memory.advancedSearch({ query: "developed", limit: 5 });
  console.log(`Found: ${res2.length} results`);
  res2.forEach((r: any) => console.log(` - [${r.source}] ${r.text?.substring(0, 50)}... (Score: ${r.score.toFixed(4)})`));

  console.log("\n--- Test 3: Multiple Keywords ('Beta stable') ---");
  const res3 = await memory.advancedSearch({ query: "Beta stable", limit: 5 });
  console.log(`Found: ${res3.length} results`);
  res3.forEach((r: any) => console.log(` - [${r.source}] ${r.text?.substring(0, 50)}... (Score: ${r.score.toFixed(4)})`));

  console.log("\n--- Test 4: Stopwords Test ('the that') ---");
  const res4 = await memory.advancedSearch({ query: "the that", limit: 5 });
  console.log(`Found: ${res4.length} results (should be low or 0 if only stopwords)`);
}

main().catch((error) => {
  console.log("❌ Test failed:", error);
  if ((error as any).display) console.error((error as any).display);
});

console.log("\n✅ FTS Test completed.");
