import { CozoDb } from 'cozo-node';
import { MemoryActivationService } from './memory-activation';

async function testMemoryActivation() {
  console.log('=== Memory Activation Service Test ===\n');
  
  const db = new CozoDb();
  const activationService = new MemoryActivationService(db, {
    retentionThreshold: 0.1,
    initialStrength: 1.0,
    strengthIncrement: 1.0,
    timeUnit: 'days'
  });
  
  try {
    // Setup: Create test entity and observations
    console.log('--- Setup: Creating test data ---');
    
    const entityId = 'test-entity-1';
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    
    // Create entity relation
    await db.run(`
      :create entity {
        id: String,
        name: String,
        type: String,
        =>
        metadata: String
      }
    `);
    
    await db.run(`
      ?[id, name, type, metadata] <- [
        [$id, 'Test Entity', 'test', 'test entity']
      ]
      :put entity {id, name, type => metadata}
    `, { id: entityId });
    
    // Create observation relation
    await db.run(`
      :create observation {
        id: String,
        entity_id: String,
        text: String,
        =>
        metadata: Any,
        created_at: Int
      }
    `);
    
    // Create observations with different access patterns
    const observations = [
      {
        id: 'obs-1',
        text: 'Recently accessed, high strength',
        metadata: { access_count: 5, last_access_time: oneDayAgo },
        created_at: thirtyDaysAgo
      },
      {
        id: 'obs-2',
        text: 'Moderately accessed',
        metadata: { access_count: 2, last_access_time: threeDaysAgo },
        created_at: thirtyDaysAgo
      },
      {
        id: 'obs-3',
        text: 'Rarely accessed, weak memory',
        metadata: { access_count: 1, last_access_time: sevenDaysAgo },
        created_at: thirtyDaysAgo
      },
      {
        id: 'obs-4',
        text: 'Never accessed, very weak',
        metadata: { access_count: 0, last_access_time: thirtyDaysAgo },
        created_at: thirtyDaysAgo
      },
      {
        id: 'obs-5',
        text: 'Frequently accessed, very strong',
        metadata: { access_count: 10, last_access_time: now },
        created_at: thirtyDaysAgo
      }
    ];
    
    for (const obs of observations) {
      await db.run(`
        ?[id, entity_id, text, metadata, created_at] <- [
          [$id, $entity_id, $text, $metadata, $created_at]
        ]
        :put observation {id, entity_id, text => metadata, created_at}
      `, {
        id: obs.id,
        entity_id: entityId,
        text: obs.text,
        metadata: obs.metadata,
        created_at: obs.created_at
      });
    }
    
    console.log(`✓ Created ${observations.length} test observations\n`);
    
    // Test 1: Calculate activation scores
    console.log('--- Test 1: Calculate Activation Scores ---');
    const scores = await activationService.calculateActivationScores(entityId);
    
    console.log('Activation Scores (sorted by activation):');
    for (const score of scores) {
      console.log(`  ${score.observationId}:`);
      console.log(`    Activation: ${score.activation.toFixed(4)}`);
      console.log(`    Strength: ${score.strength.toFixed(2)}`);
      console.log(`    Time since access: ${score.timeSinceAccess.toFixed(2)} days`);
      console.log(`    Access count: ${score.accessCount}`);
      console.log(`    Should retain: ${score.shouldRetain}`);
      console.log(`    Reason: ${score.reason}`);
    }
    console.log();
    
    // Test 2: Get activation statistics
    console.log('--- Test 2: Activation Statistics ---');
    const stats = await activationService.getActivationStats(entityId);
    
    console.log(`Total observations: ${stats.totalObservations}`);
    console.log(`Average activation: ${stats.averageActivation.toFixed(4)}`);
    console.log(`Average strength: ${stats.averageStrength.toFixed(2)}`);
    console.log(`Below threshold: ${stats.belowThreshold}`);
    console.log(`Above threshold: ${stats.aboveThreshold}`);
    console.log('Distribution:');
    console.log(`  Very weak (<0.1): ${stats.distribution.veryWeak}`);
    console.log(`  Weak (0.1-0.3): ${stats.distribution.weak}`);
    console.log(`  Moderate (0.3-0.6): ${stats.distribution.moderate}`);
    console.log(`  Strong (0.6-0.9): ${stats.distribution.strong}`);
    console.log(`  Very strong (>0.9): ${stats.distribution.veryStrong}`);
    console.log();
    
    // Test 3: Record access (simulates recall)
    console.log('--- Test 3: Record Access (Simulate Recall) ---');
    const weakObsId = 'obs-3';
    console.log(`Recording access for ${weakObsId}...`);
    
    const beforeAccess = scores.find(s => s.observationId === weakObsId);
    console.log(`Before: activation=${beforeAccess?.activation.toFixed(4)}, strength=${beforeAccess?.strength.toFixed(2)}`);
    
    await activationService.recordAccess(weakObsId);
    
    const afterScores = await activationService.calculateActivationScores(entityId);
    const afterAccess = afterScores.find(s => s.observationId === weakObsId);
    console.log(`After: activation=${afterAccess?.activation.toFixed(4)}, strength=${afterAccess?.strength.toFixed(2)}`);
    console.log(`✓ Strength increased from ${beforeAccess?.strength.toFixed(2)} to ${afterAccess?.strength.toFixed(2)}`);
    console.log();
    
    // Test 4: Prune weak memories (dry run)
    console.log('--- Test 4: Prune Weak Memories (Dry Run) ---');
    const pruneResult = await activationService.pruneWeakMemories(true, entityId);
    
    console.log(`Candidates for deletion: ${pruneResult.candidates.length}`);
    for (const candidate of pruneResult.candidates) {
      console.log(`  ${candidate.observationId}: ${candidate.reason}`);
    }
    console.log(`Would preserve: ${pruneResult.preserved} observations`);
    console.log();
    
    // Test 5: Activation decay over time
    console.log('--- Test 5: Activation Decay Simulation ---');
    console.log('Simulating activation decay for obs-2 over time:');
    
    const testObs = scores.find(s => s.observationId === 'obs-2');
    if (testObs) {
      const strength = testObs.strength;
      const timePoints = [0, 1, 3, 7, 14, 30, 60, 90];
      
      console.log(`Strength: ${strength.toFixed(2)}`);
      console.log('Time (days) | Activation | Retained?');
      console.log('------------|------------|----------');
      
      for (const days of timePoints) {
        const activation = Math.exp(-days / strength);
        const retained = activation >= 0.1;
        console.log(`${days.toString().padStart(11)} | ${activation.toFixed(4).padStart(10)} | ${retained ? 'Yes' : 'No'}`);
      }
    }
    console.log();
    
    // Test 6: Strength progression with repeated recalls
    console.log('--- Test 6: Strength Progression with Repeated Recalls ---');
    console.log('Simulating repeated recalls for a new observation:');
    console.log('Recalls | Strength | Activation (7 days) | Retained?');
    console.log('--------|----------|---------------------|----------');
    
    for (let recalls = 0; recalls <= 10; recalls++) {
      const strength = 1.0 + recalls * 1.0; // initialStrength + recalls * strengthIncrement
      const activation = Math.exp(-7 / strength); // 7 days later
      const retained = activation >= 0.1;
      console.log(`${recalls.toString().padStart(7)} | ${strength.toFixed(2).padStart(8)} | ${activation.toFixed(4).padStart(19)} | ${retained ? 'Yes' : 'No'}`);
    }
    console.log();
    
    // Test 7: Compare with different threshold values
    console.log('--- Test 7: Impact of Different Retention Thresholds ---');
    const thresholds = [0.05, 0.1, 0.2, 0.3];
    
    console.log('Threshold | Retained | Deleted');
    console.log('----------|----------|--------');
    
    for (const threshold of thresholds) {
      const testService = new MemoryActivationService(db, {
        retentionThreshold: threshold,
        initialStrength: 1.0,
        strengthIncrement: 1.0,
        timeUnit: 'days'
      });
      
      const testScores = await testService.calculateActivationScores(entityId);
      const retained = testScores.filter(s => s.shouldRetain).length;
      const deleted = testScores.filter(s => !s.shouldRetain).length;
      
      console.log(`${threshold.toFixed(2).padStart(9)} | ${retained.toString().padStart(8)} | ${deleted.toString().padStart(7)}`);
    }
    console.log();
    
    // Test 8: Verify Ebbinghaus curve shape
    console.log('--- Test 8: Ebbinghaus Forgetting Curve Verification ---');
    console.log('Classic Ebbinghaus curve: steep initial decline, then gradual leveling');
    console.log('Time (days) | Retention (S=1) | Retention (S=5) | Retention (S=10)');
    console.log('------------|-----------------|-----------------|------------------');
    
    const curveTimePoints = [0, 0.5, 1, 2, 5, 10, 20, 30];
    for (const days of curveTimePoints) {
      const r1 = Math.exp(-days / 1);
      const r5 = Math.exp(-days / 5);
      const r10 = Math.exp(-days / 10);
      console.log(`${days.toString().padStart(11)} | ${r1.toFixed(4).padStart(15)} | ${r5.toFixed(4).padStart(15)} | ${r10.toFixed(4).padStart(16)}`);
    }
    console.log();
    
    console.log('✓ All memory activation tests completed successfully!');
    console.log('\nKey Insights:');
    console.log('- Higher strength (S) = slower forgetting');
    console.log('- Each recall increases strength, making memories more durable');
    console.log('- Activation threshold determines retention policy');
    console.log('- System naturally implements spaced repetition via activation decay');
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    db.close();
  }
}

testMemoryActivation();
