
import { MemoryServer } from './index';

async function main() {
  const memory = new MemoryServer();

  // Wait for initialization
  await memory.initPromise;

  console.log("--- Adding Test Data ---");
  const alice = await memory.createEntity({
    name: "Alice",
    type: "Person",
    metadata: { role: "engineer", expertise: "TypeScript" }
  }) as any;
  
  const bob = await memory.createEntity({
    name: "Bob",
    type: "Person",
    metadata: { role: "manager", expertise: "Agile" }
  }) as any;

  const projectX = await memory.createEntity({
    name: "Project X",
    type: "Project",
    metadata: { status: "Active" }
  }) as any;

  // Use id instead of entity_id
  await memory.createRelation({
    from_id: alice.id,
    to_id: projectX.id,
    relation_type: "WORKS_ON",
  });
  await memory.createRelation({
    from_id: bob.id,
    to_id: projectX.id,
    relation_type: "WORKS_ON",
  });

  await memory.addObservation({
    entity_id: alice.id,
    text: "Alice is a software engineer working on Project X.",
  });
  await memory.addObservation({
    entity_id: bob.id,
    text: "Bob is a project manager for Project X.",
  });

  console.log("Entities created:", { alice: alice.id, bob: bob.id, projectX: projectX.id });

  console.log("\n--- Search 1: Simple Search for Alice ---");
  // Use advancedSearch
  const res1 = await memory.advancedSearch({
    query: "Alice engineer",
    limit: 5,
  });
  console.log("Results 1:", JSON.stringify(res1, null, 2));

  console.log("\n--- Search 2: Filter by Type 'Person' ---");
  const res2 = await memory.advancedSearch({
    query: "engineer",
    filters: {
      entityTypes: ["Person"],
    },
  });
  console.log("Results 2:", JSON.stringify(res2, null, 2));

  console.log("\n--- Search 3: Filter by Metadata ---");
  const res3 = await memory.advancedSearch({
    query: "Alice",
    filters: {
      metadata: {
        role: "engineer",
      },
    },
  });
  console.log("Results 3:", JSON.stringify(res3, null, 2));

  console.log("\n--- Search 4: Graph Constraints (Relations) ---");
  // Find people who work on Project X
  const res4 = await memory.advancedSearch({
    query: "Project X",
    graphConstraints: {
      requiredRelations: ["WORKS_ON"],
      maxDepth: 1,
    },
  });
  console.log("Results 4:", JSON.stringify(res4, null, 2));
}

main().catch((error) => {
  console.log("Error in test:", error);
});
