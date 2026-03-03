#!/usr/bin/env node
import { MemoryServer } from "./index";

async function testActivationMCPTools() {
  console.log("=== Testing ACT-R Memory Activation MCP Tools ===\n");

  const server = new MemoryServer();
  await server.initPromise;

  try {
    // Step 1: Create test entity
    console.log("1. Creating test entity...");
    const entityResult = await server.createEntity({
      name: "ACT-R Test Entity",
      type: "TestEntity",
      metadata: { purpose: "testing activation" }
    });
    console.log("✓ Entity created:", entityResult.id);

    // Step 2: Add multiple observations
    console.log("\n2. Adding test observations...");
    const observations = [
      "First observation - should have low activation initially",
      "Second observation - will be accessed multiple times",
      "Third observation - will remain unaccessed",
      "Fourth observation - emotionally salient content with URGENT deadline",
      "Fifth observation - normal content"
    ];

    const obsIds: string[] = [];
    for (const text of observations) {
      const obs = await server.addObservation({
        entity_id: entityResult.id,
        text: text,
        metadata: { test: true }
      });
      if (obs.id) {
        obsIds.push(obs.id);
        console.log(`✓ Observation added: ${obs.id.substring(0, 8)}...`);
      }
    }

    // Wait a bit to simulate time passing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 3: Test get_activation_stats (initial state)
    console.log("\n3. Testing get_activation_stats (initial state)...");
    const stats1 = await server.getActivationService().getActivationStats(entityResult.id);
    console.log("✓ Initial activation stats:");
    console.log(`  - Total observations: ${stats1.totalObservations}`);
    console.log(`  - Average activation: ${stats1.averageActivation.toFixed(3)}`);
    console.log(`  - Average strength: ${stats1.averageStrength.toFixed(2)}`);
    console.log(`  - Below threshold: ${stats1.belowThreshold}`);
    console.log(`  - Above threshold: ${stats1.aboveThreshold}`);
    console.log(`  - Distribution:`, stats1.distribution);

    // Step 4: Test record_memory_access
    console.log("\n4. Testing record_memory_access...");
    // Access the second observation multiple times
    for (let i = 0; i < 3; i++) {
      await server.getActivationService().recordAccess(obsIds[1]);
      console.log(`✓ Access ${i + 1} recorded for observation ${obsIds[1].substring(0, 8)}...`);
    }

    // Access the first observation once
    await server.getActivationService().recordAccess(obsIds[0]);
    console.log(`✓ Access recorded for observation ${obsIds[0].substring(0, 8)}...`);

    // Step 5: Check activation stats after accesses
    console.log("\n5. Checking activation stats after accesses...");
    const stats2 = await server.getActivationService().getActivationStats(entityResult.id);
    console.log("✓ Updated activation stats:");
    console.log(`  - Total observations: ${stats2.totalObservations}`);
    console.log(`  - Average activation: ${stats2.averageActivation.toFixed(3)}`);
    console.log(`  - Average strength: ${stats2.averageStrength.toFixed(2)}`);
    console.log(`  - Below threshold: ${stats2.belowThreshold}`);
    console.log(`  - Above threshold: ${stats2.aboveThreshold}`);
    console.log(`  - Distribution:`, stats2.distribution);

    // Step 6: Get detailed activation scores
    console.log("\n6. Getting detailed activation scores...");
    const scores = await server.getActivationService().calculateActivationScores(entityResult.id);
    console.log("✓ Top 3 most active observations:");
    scores.slice(0, 3).forEach((score, idx) => {
      console.log(`  ${idx + 1}. Activation: ${score.activation.toFixed(3)}, Strength: ${score.strength.toFixed(1)}, Access count: ${score.accessCount}`);
    });

    // Step 7: Test prune_weak_memories (dry run)
    console.log("\n7. Testing prune_weak_memories (dry run)...");
    const pruneResult1 = await server.getActivationService().pruneWeakMemories(true, entityResult.id);
    console.log("✓ Dry run prune result:");
    console.log(`  - Would prune: ${pruneResult1.pruned}`);
    console.log(`  - Would preserve: ${pruneResult1.preserved}`);
    console.log(`  - Candidates for pruning: ${pruneResult1.candidates.length}`);
    if (pruneResult1.candidates.length > 0) {
      console.log(`  - Sample candidate: activation=${pruneResult1.candidates[0].activation.toFixed(3)}, reason="${pruneResult1.candidates[0].reason}"`);
    }

    // Step 8: Test prune_weak_memories (actual prune)
    console.log("\n8. Testing prune_weak_memories (actual prune)...");
    const pruneResult2 = await server.getActivationService().pruneWeakMemories(false, entityResult.id);
    console.log("✓ Actual prune result:");
    console.log(`  - Pruned: ${pruneResult2.pruned}`);
    console.log(`  - Preserved: ${pruneResult2.preserved}`);

    // Step 9: Final activation stats
    console.log("\n9. Final activation stats after pruning...");
    const stats3 = await server.getActivationService().getActivationStats(entityResult.id);
    console.log("✓ Final stats:");
    console.log(`  - Total observations: ${stats3.totalObservations}`);
    console.log(`  - Average activation: ${stats3.averageActivation.toFixed(3)}`);
    console.log(`  - Average strength: ${stats3.averageStrength.toFixed(2)}`);
    console.log(`  - Below threshold: ${stats3.belowThreshold}`);
    console.log(`  - Above threshold: ${stats3.aboveThreshold}`);

    // Step 10: Test global stats (all entities)
    console.log("\n10. Testing global activation stats (all entities)...");
    const globalStats = await server.getActivationService().getActivationStats();
    console.log("✓ Global stats:");
    console.log(`  - Total observations: ${globalStats.totalObservations}`);
    console.log(`  - Average activation: ${globalStats.averageActivation.toFixed(3)}`);
    console.log(`  - Below threshold: ${globalStats.belowThreshold}`);
    console.log(`  - Above threshold: ${globalStats.aboveThreshold}`);

    console.log("\n=== ✓ All ACT-R Memory Activation MCP Tools Tests Passed ===");

  } catch (error) {
    console.error("\n✗ Test failed:", error);
    process.exit(1);
  }
}

testActivationMCPTools();
