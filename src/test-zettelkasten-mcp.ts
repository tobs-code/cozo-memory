#!/usr/bin/env node
import { MemoryServer } from "./index";

async function testZettelkastenMCPTools() {
  console.log("=== Testing Zettelkasten MCP Tools ===\n");

  const server = new MemoryServer();
  await server.initPromise;

  try {
    // Step 1: Create test entity
    console.log("1. Creating test entity...");
    const entityResult = await server.createEntity({
      name: "Zettelkasten Test",
      type: "TestEntity",
      metadata: { purpose: "testing" }
    });
    console.log("✓ Entity created:", entityResult.id);

    // Step 2: Add multiple observations
    console.log("\n2. Adding test observations...");
    const observations = [
      "Machine learning is a subset of artificial intelligence focused on learning from data.",
      "Neural networks are computational models inspired by biological neurons in the brain.",
      "Deep learning uses multiple layers of neural networks to learn hierarchical representations.",
      "Transformers revolutionized NLP by using self-attention mechanisms instead of recurrence.",
      "Large language models like GPT are trained on massive text corpora using transformers."
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

    // Step 3: Test get_zettelkasten_stats via direct method call
    console.log("\n3. Testing getZettelkastenStats...");
    const stats = await server.getZettelkastenService().getEvolutionStats();
    console.log("✓ Stats retrieved:");
    console.log(`  - Total observations: ${stats.totalObservations}`);
    console.log(`  - Enriched observations: ${stats.enrichedObservations}`);
    console.log(`  - Total links: ${stats.totalLinks}`);
    console.log(`  - Average links per note: ${stats.averageLinksPerNote.toFixed(2)}`);
    console.log(`  - Top keywords: ${stats.topKeywords.slice(0, 5).map((k: any) => k.keyword).join(", ")}`);

    // Step 4: Test enrich_observation via getting observation data and calling enrichment
    console.log("\n4. Testing enrichObservation...");
    const obsRes = await server.db.run(
      `?[obs_id, entity_id, text, embedding] := *observation{id: $id, entity_id, text, embedding, @ "NOW"}, obs_id = $id`,
      { id: obsIds[0] }
    );
    
    if (obsRes.rows.length > 0) {
      const [obs_id, entity_id, text, embedding] = obsRes.rows[0];
      const enrichData = await server.getZettelkastenService().enrichObservation(
        obs_id as string,
        text as string,
        embedding as number[],
        entity_id as string
      );
      
      console.log("✓ Observation enriched:");
      console.log(`  - Observation ID: ${enrichData.observationId}`);
      console.log(`  - Extracted keywords: ${enrichData.extractedKeywords.join(", ")}`);
      console.log(`  - Added tags: ${enrichData.addedTags.join(", ")}`);
      console.log(`  - Created links: ${enrichData.createdLinks}`);
      console.log(`  - Related notes: ${enrichData.relatedNotes.length}`);
      console.log(`  - Evolution summary: ${enrichData.evolutionSummary}`);
    }

    // Step 5: Verify stats updated
    console.log("\n5. Verifying stats after enrichment...");
    const stats2 = await server.getZettelkastenService().getEvolutionStats();
    console.log("✓ Updated stats:");
    console.log(`  - Total observations: ${stats2.totalObservations}`);
    console.log(`  - Enriched observations: ${stats2.enrichedObservations}`);
    console.log(`  - Total links: ${stats2.totalLinks}`);
    console.log(`  - Average links per note: ${stats2.averageLinksPerNote.toFixed(2)}`);

    // Step 6: Enrich another observation
    console.log("\n6. Enriching second observation...");
    const obsRes2 = await server.db.run(
      `?[obs_id, entity_id, text, embedding] := *observation{id: $id, entity_id, text, embedding, @ "NOW"}, obs_id = $id`,
      { id: obsIds[1] }
    );
    
    if (obsRes2.rows.length > 0) {
      const [obs_id, entity_id, text, embedding] = obsRes2.rows[0];
      const enrichData2 = await server.getZettelkastenService().enrichObservation(
        obs_id as string,
        text as string,
        embedding as number[],
        entity_id as string
      );
      
      console.log("✓ Second observation enriched:");
      console.log(`  - Created links: ${enrichData2.createdLinks}`);
      console.log(`  - Related notes: ${enrichData2.relatedNotes.length}`);
    }

    // Step 7: Final stats
    console.log("\n7. Final statistics...");
    const stats3 = await server.getZettelkastenService().getEvolutionStats();
    console.log("✓ Final stats:");
    console.log(`  - Total observations: ${stats3.totalObservations}`);
    console.log(`  - Enriched observations: ${stats3.enrichedObservations}`);
    console.log(`  - Total links: ${stats3.totalLinks}`);
    console.log(`  - Average links per note: ${stats3.averageLinksPerNote.toFixed(2)}`);
    console.log(`  - Top keywords: ${stats3.topKeywords.slice(0, 10).map((k: any) => `${k.keyword}(${k.frequency})`).join(", ")}`);

    console.log("\n=== ✓ All Zettelkasten MCP Tools Tests Passed ===");

  } catch (error) {
    console.error("\n✗ Test failed:", error);
    process.exit(1);
  }
}

testZettelkastenMCPTools();
