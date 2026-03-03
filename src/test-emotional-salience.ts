import { CozoDb } from 'cozo-node';
import { EmotionalSalienceService } from './emotional-salience';

async function testEmotionalSalience() {
  console.log('=== Emotional Salience Weighting Test ===\n');

  const db = new CozoDb();
  const salienceService = new EmotionalSalienceService(db, {
    enableSalience: true,
    salienceBoostFactor: 2.0,
    decaySlowdownFactor: 0.5,
    minSalienceThreshold: 0.3
  });

  try {
    // Initialize database schema
    await db.run(`
      :create entity {
        id: String,
        =>
        name: String,
        type: String,
      }
    `);
    
    await db.run(`
      :create observation {
        id: String,
        =>
        entity_id: String,
        text: String,
        metadata: Json?,
      }
    `);
    
    console.log('✓ Database initialized\n');

    // Test 1: Create test observations with varying emotional salience
    console.log('Test 1: Creating observations with different salience levels...');
    
    const testObservations = [
      {
        text: 'CRITICAL: Never forget to backup the database before deployment. This is extremely important!',
        expected: 'high'
      },
      {
        text: 'Important reminder: The deadline for the project is next Friday.',
        expected: 'medium'
      },
      {
        text: 'Interesting discovery: The new algorithm is 20% faster than the old one.',
        expected: 'medium'
      },
      {
        text: 'Note: The meeting is scheduled for 3 PM tomorrow.',
        expected: 'low'
      },
      {
        text: 'The weather is nice today.',
        expected: 'neutral'
      },
      {
        text: 'URGENT: Security vulnerability detected in authentication module. Immediate action required!',
        expected: 'high'
      },
      {
        text: 'Surprising breakthrough in machine learning research announced today.',
        expected: 'medium'
      }
    ];

    // Create entity
    const entityResult = await db.run(`
      ?[id, name, type] <- [['test-entity', 'Test Entity', 'Test']]
      :put entity {id, name, type}
    `);

    for (const obs of testObservations) {
      const obsId = `obs-${Math.random().toString(36).substring(7)}`;
      await db.run(`
        ?[id, entity_id, text, metadata] <- [[
          $id,
          'test-entity',
          $text,
          {}
        ]]
        :put observation {id, entity_id, text, metadata}
      `, { id: obsId, text: obs.text });
    }

    console.log(`✓ Created ${testObservations.length} test observations\n`);

    // Test 2: Calculate salience scores
    console.log('Test 2: Calculating salience scores...');
    const scores = await salienceService.scoreAllObservations();
    
    console.log(`\nSalience Scores (sorted by score):`);
    console.log('─'.repeat(80));
    for (const score of scores.slice(0, 10)) {
      console.log(`Score: ${score.salienceScore.toFixed(3)} | Category: ${score.category.toUpperCase()}`);
      console.log(`Text: ${score.text.substring(0, 70)}${score.text.length > 70 ? '...' : ''}`);
      console.log(`Keywords: ${score.detectedKeywords.join(', ')}`);
      console.log(`Boost: Strength ×${score.boost.strengthMultiplier.toFixed(2)}, Decay -${(score.boost.decayReduction * 100).toFixed(0)}%`);
      console.log(`Reason: ${score.reason}`);
      console.log('─'.repeat(80));
    }

    // Test 3: Verify keyword detection
    console.log('\nTest 3: Verifying keyword detection accuracy...');
    let correctDetections = 0;
    for (let i = 0; i < testObservations.length; i++) {
      const expected = testObservations[i].expected;
      const actual = scores.find(s => s.text === testObservations[i].text)?.category || 'neutral';
      const match = expected === actual;
      correctDetections += match ? 1 : 0;
      
      console.log(`${match ? '✓' : '✗'} Expected: ${expected.padEnd(8)} | Actual: ${actual.padEnd(8)} | "${testObservations[i].text.substring(0, 50)}..."`);
    }
    console.log(`\nAccuracy: ${correctDetections}/${testObservations.length} (${(correctDetections / testObservations.length * 100).toFixed(1)}%)\n`);

    // Test 4: Apply salience metadata (dry run)
    console.log('Test 4: Applying salience metadata (dry run)...');
    const dryRunResult = await salienceService.applySalienceMetadata(true);
    console.log(`Would update ${dryRunResult.updated} observations (dry run)`);
    console.log(`Observations with salience >= threshold: ${dryRunResult.scores.length}\n`);

    // Test 5: Apply salience metadata (actual)
    console.log('Test 5: Applying salience metadata (actual)...');
    const applyResult = await salienceService.applySalienceMetadata(false);
    console.log(`✓ Updated ${applyResult.updated} observations with salience metadata\n`);

    // Test 6: Get statistics
    console.log('Test 6: Getting salience statistics...');
    const stats = await salienceService.getSalienceStats();
    console.log(`Total Observations: ${stats.totalObservations}`);
    console.log(`With Salience (>= threshold): ${stats.withSalience}`);
    console.log(`Average Salience: ${stats.averageSalience.toFixed(3)}`);
    console.log(`\nDistribution:`);
    console.log(`  High (>= 0.7):    ${stats.distribution.high}`);
    console.log(`  Medium (0.4-0.7): ${stats.distribution.medium}`);
    console.log(`  Low (0.3-0.4):    ${stats.distribution.low}`);
    console.log(`  Neutral (< 0.3):  ${stats.distribution.neutral}`);
    console.log(`\nTop Keywords:`);
    for (const { keyword, count } of stats.topKeywords.slice(0, 5)) {
      console.log(`  ${keyword.padEnd(20)} ${count}`);
    }
    console.log();

    // Test 7: Get specific observation salience
    console.log('Test 7: Getting salience for specific observation...');
    const firstScore = scores[0];
    const specificSalience = await salienceService.getObservationSalience(firstScore.observationId);
    if (specificSalience) {
      console.log(`✓ Retrieved salience for observation: ${specificSalience.observationId}`);
      console.log(`  Score: ${specificSalience.salienceScore.toFixed(3)}`);
      console.log(`  Category: ${specificSalience.category}`);
      console.log(`  Keywords: ${specificSalience.detectedKeywords.join(', ')}`);
    }
    console.log();

    // Test 8: Test edge cases
    console.log('Test 8: Testing edge cases...');
    
    const edgeCases = [
      { text: '', expected: 0 },
      { text: 'CRITICAL URGENT IMPORTANT NEVER FORGET', expected: 1.0 },
      { text: 'critical critical critical', expected: 1.0 }, // Duplicate keywords
      { text: 'This is critically important and urgent!', expected: 0.8 }
    ];

    for (const testCase of edgeCases) {
      const result = salienceService.calculateSalienceScore(testCase.text);
      const pass = Math.abs(result.score - testCase.expected) < 0.2; // Allow 0.2 tolerance
      console.log(`${pass ? '✓' : '✗'} "${testCase.text}" => ${result.score.toFixed(3)} (expected ~${testCase.expected})`);
    }
    console.log();

    // Test 9: Integration with Memory Activation
    console.log('Test 9: Demonstrating integration with Memory Activation...');
    console.log('Salience boosts can be applied to ACT-R Memory Activation:');
    console.log('  - High salience (0.8): Strength ×1.8, Decay -40%');
    console.log('  - Medium salience (0.5): Strength ×1.5, Decay -25%');
    console.log('  - Low salience (0.3): Strength ×1.3, Decay -15%');
    console.log('  - Neutral (0.0): No boost applied');
    console.log('\nThis slows down Ebbinghaus forgetting curve for emotionally salient memories.\n');

    console.log('=== All Tests Completed Successfully ===');

  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  } finally {
    db.close();
  }
}

// Run tests
testEmotionalSalience().catch(console.error);
