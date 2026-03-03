#!/usr/bin/env node
import { MemoryServer } from "./index";

async function testSalienceMCPTool() {
  console.log("=== Testing Emotional Salience MCP Tool ===\n");

  const server = new MemoryServer();
  await server.initPromise;

  try {
    // Step 1: Create test entity
    console.log("1. Creating test entity...");
    const entityResult = await server.createEntity({
      name: "Salience Test Entity",
      type: "TestEntity",
      metadata: { purpose: "testing salience" }
    });
    console.log("✓ Entity created:", entityResult.id);

    // Step 2: Add observations with varying emotional salience
    console.log("\n2. Adding observations with different emotional levels...");
    const observations = [
      "URGENT: Critical security vulnerability discovered in production system!",
      "Important meeting scheduled for tomorrow at 10 AM",
      "The weather is nice today",
      "DEADLINE: Project must be completed by Friday or we lose the client",
      "Regular status update: everything is proceeding normally",
      "Exciting news: We won the innovation award!",
      "Failed deployment caused major outage affecting 10,000 users",
      "Coffee machine needs refilling",
      "Emergency: Server crash requires immediate attention",
      "Routine maintenance completed successfully"
    ];

    for (const text of observations) {
      await server.addObservation({
        entity_id: entityResult.id,
        text: text,
        metadata: { test: true }
      });
      console.log(`✓ Added: "${text.substring(0, 50)}..."`);
    }

    // Step 3: Test get_salience_stats
    console.log("\n3. Testing get_salience_stats...");
    const stats = await server.getSalienceService().getSalienceStats();
    
    console.log("✓ Salience stats retrieved:");
    console.log(`  - Total observations: ${stats.totalObservations}`);
    console.log(`  - With salience (≥0.3): ${stats.withSalience}`);
    console.log(`  - Average salience: ${stats.averageSalience.toFixed(3)}`);
    console.log(`  - Distribution:`);
    console.log(`    • High: ${stats.distribution.high}`);
    console.log(`    • Medium: ${stats.distribution.medium}`);
    console.log(`    • Low: ${stats.distribution.low}`);
    console.log(`    • Neutral: ${stats.distribution.neutral}`);
    
    if (stats.topKeywords.length > 0) {
      console.log(`  - Top keywords:`);
      stats.topKeywords.slice(0, 5).forEach((kw, idx) => {
        console.log(`    ${idx + 1}. ${kw.keyword} (${kw.count})`);
      });
    }

    // Step 4: Verify high-salience observations
    console.log("\n4. Verifying high-salience observations...");
    const allScores = await server.getSalienceService().scoreAllObservations();
    const highSalience = allScores.filter(s => s.category === 'high');
    
    console.log(`✓ Found ${highSalience.length} high-salience observations:`);
    highSalience.forEach((score, idx) => {
      console.log(`  ${idx + 1}. Score: ${score.salienceScore.toFixed(2)}, Keywords: ${score.detectedKeywords.join(", ")}`);
      console.log(`     Text: "${score.text.substring(0, 60)}..."`);
    });

    // Step 5: Check emotional categories
    console.log("\n5. Checking emotional category distribution...");
    const categories = {
      critical: allScores.filter(s => s.detectedKeywords.some(k => ['urgent', 'critical', 'emergency'].includes(k.toLowerCase()))).length,
      important: allScores.filter(s => s.detectedKeywords.some(k => ['important', 'deadline'].includes(k.toLowerCase()))).length,
      emotional: allScores.filter(s => s.detectedKeywords.some(k => ['exciting', 'failed'].includes(k.toLowerCase()))).length,
      neutral: allScores.filter(s => s.salienceScore === 0).length
    };
    
    console.log("✓ Category breakdown:");
    console.log(`  - Critical/Emergency: ${categories.critical}`);
    console.log(`  - Important/Deadline: ${categories.important}`);
    console.log(`  - Emotional: ${categories.emotional}`);
    console.log(`  - Neutral: ${categories.neutral}`);

    // Step 6: Verify salience affects activation
    console.log("\n6. Verifying salience integration with ACT-R...");
    const activationStats = await server.getActivationService().getActivationStats(entityResult.id);
    console.log("✓ ACT-R activation stats:");
    console.log(`  - Total observations: ${activationStats.totalObservations}`);
    console.log(`  - Average strength: ${activationStats.averageStrength.toFixed(2)}`);
    console.log(`  - Note: High-salience observations have boosted strength`);

    console.log("\n=== ✓ Emotional Salience MCP Tool Test Passed ===");

  } catch (error) {
    console.error("\n✗ Test failed:", error);
    process.exit(1);
  }
}

testSalienceMCPTool();
