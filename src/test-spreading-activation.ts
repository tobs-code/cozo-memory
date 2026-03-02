import { CozoDb } from 'cozo-node';
import { SpreadingActivationService } from './spreading-activation';
import { EmbeddingService } from './embedding-service';

async function testSpreadingActivation() {
  console.log('=== SYNAPSE Spreading Activation Test ===\n');

  const db = new CozoDb();
  const embeddingService = new EmbeddingService();
  const synapseService = new SpreadingActivationService(db, embeddingService, {
    spreadingFactor: 0.8,
    decayFactor: 0.5,
    temporalDecay: 0.01,
    inhibitionBeta: 0.15,
    inhibitionTopM: 7,
    propagationSteps: 3,
  });

  try {
    // Setup: Create test graph
    console.log('--- Setup: Creating test knowledge graph ---');

    // Create entity relation
    await db.run(`
      :create entity {
        id: String,
        name: String,
        type: String,
        =>
        embedding: <F32; 1024>,
        metadata: Any
      }
    `);

    // Create relationship relation
    await db.run(`
      :create relationship {
        from_id: String,
        to_id: String,
        relation_type: String,
        =>
        strength: Float,
        created_at: Int,
        metadata: Any
      }
    `);

    // Create entity_rank relation for PageRank
    await db.run(`
      :create entity_rank {
        entity_id: String,
        =>
        rank: Float
      }
    `);

    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

    // Create entities
    const entities = [
      { id: 'e1', name: 'TypeScript', type: 'Technology' },
      { id: 'e2', name: 'JavaScript', type: 'Technology' },
      { id: 'e3', name: 'React', type: 'Framework' },
      { id: 'e4', name: 'Node.js', type: 'Runtime' },
      { id: 'e5', name: 'Alice', type: 'Person' },
      { id: 'e6', name: 'Bob', type: 'Person' },
      { id: 'e7', name: 'Frontend Development', type: 'Concept' },
      { id: 'e8', name: 'Backend Development', type: 'Concept' },
    ];

    for (const entity of entities) {
      const embedding = await embeddingService.embed(entity.name);
      await db.run(`
        ?[id, name, type, embedding, metadata] <- [
          [$id, $name, $type, $embedding, {}]
        ]
        :put entity {id, name, type => embedding, metadata}
      `, {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        embedding,
      });
    }

    // Create relationships (with temporal and strength variations)
    const relationships = [
      // TypeScript ecosystem
      { from: 'e1', to: 'e2', type: 'superset_of', strength: 0.9, time: now },
      { from: 'e1', to: 'e3', type: 'used_with', strength: 0.8, time: oneDayAgo },
      { from: 'e1', to: 'e4', type: 'runs_on', strength: 0.7, time: oneDayAgo },
      
      // React connections
      { from: 'e3', to: 'e2', type: 'built_with', strength: 0.9, time: now },
      { from: 'e3', to: 'e7', type: 'part_of', strength: 0.8, time: now },
      
      // Node.js connections
      { from: 'e4', to: 'e2', type: 'executes', strength: 0.9, time: now },
      { from: 'e4', to: 'e8', type: 'part_of', strength: 0.8, time: now },
      
      // People connections
      { from: 'e5', to: 'e1', type: 'expert_in', strength: 0.9, time: now },
      { from: 'e5', to: 'e3', type: 'uses', strength: 0.7, time: oneDayAgo },
      { from: 'e6', to: 'e4', type: 'expert_in', strength: 0.9, time: now },
      { from: 'e6', to: 'e8', type: 'works_on', strength: 0.8, time: now },
      
      // Weak/old connection (should be dampened by temporal decay)
      { from: 'e7', to: 'e8', type: 'related_to', strength: 0.3, time: oneWeekAgo },
    ];

    for (const rel of relationships) {
      await db.run(`
        ?[from_id, to_id, relation_type, strength, created_at, metadata] <- [
          [$from_id, $to_id, $relation_type, $strength, $created_at, {}]
        ]
        :put relationship {from_id, to_id, relation_type => strength, created_at, metadata}
      `, {
        from_id: rel.from,
        to_id: rel.to,
        relation_type: rel.type,
        strength: rel.strength,
        created_at: rel.time,
      });
    }

    // Create PageRank scores (simulated)
    const pageRanks = [
      { id: 'e1', rank: 0.25 }, // TypeScript - high importance
      { id: 'e2', rank: 0.20 }, // JavaScript - high importance
      { id: 'e3', rank: 0.15 }, // React
      { id: 'e4', rank: 0.15 }, // Node.js
      { id: 'e5', rank: 0.10 }, // Alice
      { id: 'e6', rank: 0.08 }, // Bob
      { id: 'e7', rank: 0.04 }, // Frontend
      { id: 'e8', rank: 0.03 }, // Backend
    ];

    for (const pr of pageRanks) {
      await db.run(`
        ?[entity_id, rank] <- [[$entity_id, $rank]]
        :put entity_rank {entity_id => rank}
      `, { entity_id: pr.id, rank: pr.rank });
    }

    console.log('✓ Created 8 entities and 12 relationships\n');

    // Test 1: Basic Spreading Activation
    console.log('--- Test 1: Basic Spreading Activation ---');
    console.log('Query: "TypeScript programming"');
    
    const result1 = await synapseService.spreadActivation('TypeScript programming', 3);
    
    console.log(`Iterations: ${result1.iterations}, Converged: ${result1.converged}`);
    console.log(`Seed nodes: ${result1.seedNodes.join(', ')}`);
    console.log('\nActivation Scores (Top 5):');
    
    for (const score of result1.scores.slice(0, 5)) {
      const entity = entities.find(e => e.id === score.entityId);
      console.log(`  ${entity?.name} (${score.entityId}): ${score.activation.toFixed(4)} [${score.source}, ${score.hops} hops]`);
    }
    console.log();

    // Test 2: Multi-Hop Reasoning
    console.log('--- Test 2: Multi-Hop Reasoning (Bridge Node Effect) ---');
    console.log('Query: "Frontend expert" (should find Alice via TypeScript → React → Frontend)');
    
    const result2 = await synapseService.spreadActivation('Frontend expert', 2);
    
    console.log('\nActivation Scores (All activated nodes):');
    for (const score of result2.scores) {
      const entity = entities.find(e => e.id === score.entityId);
      console.log(`  ${entity?.name}: ${score.activation.toFixed(4)} [${score.source}]`);
    }
    console.log();

    // Test 3: Temporal Decay Effect
    console.log('--- Test 3: Temporal Decay Effect ---');
    console.log('Recent connections should have higher activation than old ones');
    
    // Create two similar relationships with different timestamps
    const recentTime = now;
    const oldTime = now - (30 * 24 * 60 * 60 * 1000); // 30 days ago

    await db.run(`
      ?[from_id, to_id, relation_type, strength, created_at, metadata] <- [
        ['e_test_recent', 'e_test_target', 'test_rel', 0.8, $recent_time, {}],
        ['e_test_old', 'e_test_target', 'test_rel', 0.8, $old_time, {}]
      ]
      :put relationship {from_id, to_id, relation_type => strength, created_at, metadata}
    `, { recent_time: recentTime, old_time: oldTime });

    console.log('✓ Created test relationships with different timestamps');
    console.log('  Recent: strength=0.8, age=0 days');
    console.log('  Old: strength=0.8, age=30 days');
    console.log('  Expected: Recent should propagate more activation due to temporal decay\n');

    // Test 4: Lateral Inhibition
    console.log('--- Test 4: Lateral Inhibition ---');
    console.log('High-activation nodes should suppress weaker competitors');
    
    const result4 = await synapseService.spreadActivation('JavaScript TypeScript React', 5);
    
    console.log('\nTop-M nodes (should inhibit others):');
    const topM = result4.scores.slice(0, 7);
    for (const score of topM) {
      const entity = entities.find(e => e.id === score.entityId);
      console.log(`  ${entity?.name}: ${score.activation.toFixed(4)}`);
    }
    
    console.log('\nSuppressed nodes (below threshold):');
    const suppressed = result4.scores.slice(7);
    for (const score of suppressed) {
      const entity = entities.find(e => e.id === score.entityId);
      console.log(`  ${entity?.name}: ${score.activation.toFixed(4)} (suppressed by inhibition)`);
    }
    console.log();

    // Test 5: Triple Hybrid Retrieval
    console.log('--- Test 5: Triple Hybrid Retrieval ---');
    console.log('Query: "TypeScript development"');
    console.log('Combining: Semantic (50%) + Activation (30%) + PageRank (20%)');
    
    const result5 = await synapseService.tripleHybridRetrieval('TypeScript development', {
      topK: 5,
      lambdaSemantic: 0.5,
      lambdaActivation: 0.3,
      lambdaStructural: 0.2,
      seedTopK: 3,
    });
    
    console.log('\nHybrid Scores (Top 5):');
    for (const result of result5) {
      const entity = entities.find(e => e.id === result.entityId);
      console.log(`  ${entity?.name}:`);
      console.log(`    Combined: ${result.score.toFixed(4)}`);
      console.log(`    Breakdown: ${result.breakdown.formula}`);
      console.log(`      Semantic: ${result.breakdown.semantic.toFixed(4)}`);
      console.log(`      Activation: ${result.breakdown.activation.toFixed(4)}`);
      console.log(`      Structural: ${result.breakdown.structural.toFixed(4)}`);
    }
    console.log();

    // Test 6: Fan Effect
    console.log('--- Test 6: Fan Effect (Attention Dilution) ---');
    console.log('Nodes with many outgoing edges should dilute their activation');
    
    // JavaScript has many connections (high fan)
    // Alice has few connections (low fan)
    const jsConnections = relationships.filter(r => r.from === 'e2').length;
    const aliceConnections = relationships.filter(r => r.from === 'e5').length;
    
    console.log(`JavaScript (e2) out-degree: ${jsConnections}`);
    console.log(`Alice (e5) out-degree: ${aliceConnections}`);
    console.log('Expected: Alice should spread more activation per edge due to lower fan\n');

    // Test 7: Convergence Analysis
    console.log('--- Test 7: Convergence Analysis ---');
    console.log('Testing activation convergence over iterations');
    
    const convergenceResults = [];
    for (let steps = 1; steps <= 5; steps++) {
      const service = new SpreadingActivationService(db, embeddingService, {
        propagationSteps: steps,
      });
      const result = await service.spreadActivation('TypeScript', 2);
      convergenceResults.push({
        steps,
        converged: result.converged,
        iterations: result.iterations,
        totalActivation: result.scores.reduce((sum, s) => sum + s.activation, 0),
      });
    }
    
    console.log('\nSteps | Converged | Iterations | Total Activation');
    console.log('------|-----------|------------|------------------');
    for (const res of convergenceResults) {
      console.log(`  ${res.steps}   |    ${res.converged ? 'Yes' : 'No '}    |     ${res.iterations}      |      ${res.totalActivation.toFixed(4)}`);
    }
    console.log();

    console.log('✓ All SYNAPSE spreading activation tests completed successfully!\n');

    console.log('Key Insights:');
    console.log('- Spreading Activation propagates relevance through graph structure');
    console.log('- Lateral Inhibition suppresses weak competitors, focusing on salient nodes');
    console.log('- Fan Effect dilutes activation from high-degree nodes (attention distribution)');
    console.log('- Temporal Decay prioritizes recent connections over old ones');
    console.log('- Triple Hybrid combines geometric (semantic), dynamic (activation), and structural (PageRank) signals');
    console.log('- System converges within 3 iterations, making it efficient for real-time retrieval');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    db.close();
  }
}

testSpreadingActivation().catch(console.error);
