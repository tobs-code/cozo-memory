import { MemoryServer } from './index';
import * as fs from 'fs';

const TEST_DB_PATH = 'test_spreading_mcp';

async function runTest() {
  console.error('=== Testing spreading_activation MCP Tool ===\n');

  // Clean up old test database
  const dbFile = `${TEST_DB_PATH}.db`;
  if (fs.existsSync(dbFile)) {
    try {
      fs.unlinkSync(dbFile);
      console.error('[Cleanup] Removed old test database');
    } catch (e) {
      console.error('[Cleanup] Warning: Could not remove old database:', e);
    }
  }

  const server = new MemoryServer(TEST_DB_PATH);
  await server.initPromise;

  try {
    console.error('1. Creating test knowledge graph...');
    
    // Create entities
    const aiResult = await server.createEntity({ name: 'Artificial Intelligence', type: 'Concept', metadata: {} });
    const aiId = aiResult.id!;
    console.error(`✓ Created AI: ${aiId}`);

    const mlResult = await server.createEntity({ name: 'Machine Learning', type: 'Concept', metadata: {} });
    const mlId = mlResult.id!;
    console.error(`✓ Created ML: ${mlId}`);

    const dlResult = await server.createEntity({ name: 'Deep Learning', type: 'Concept', metadata: {} });
    const dlId = dlResult.id!;
    console.error(`✓ Created DL: ${dlId}`);

    const nnResult = await server.createEntity({ name: 'Neural Networks', type: 'Concept', metadata: {} });
    const nnId = nnResult.id!;
    console.error(`✓ Created NN: ${nnId}`);

    const cnnResult = await server.createEntity({ name: 'Convolutional Neural Networks', type: 'Concept', metadata: {} });
    const cnnId = cnnResult.id!;
    console.error(`✓ Created CNN: ${cnnId}`);

    const rnnResult = await server.createEntity({ name: 'Recurrent Neural Networks', type: 'Concept', metadata: {} });
    const rnnId = rnnResult.id!;
    console.error(`✓ Created RNN: ${rnnId}`);

    const transformerResult = await server.createEntity({ name: 'Transformers', type: 'Concept', metadata: {} });
    const transformerId = transformerResult.id!;
    console.error(`✓ Created Transformers: ${transformerId}\n`);

    console.error('2. Creating relationships (knowledge graph structure)...');
    
    // AI -> ML -> DL -> NN -> CNN/RNN/Transformers
    await server.createRelation({ from_id: aiId, to_id: mlId, relation_type: 'includes', strength: 1.0, metadata: {} });
    console.error('✓ AI includes ML');

    await server.createRelation({ from_id: mlId, to_id: dlId, relation_type: 'includes', strength: 0.9, metadata: {} });
    console.error('✓ ML includes DL');

    await server.createRelation({ from_id: dlId, to_id: nnId, relation_type: 'uses', strength: 1.0, metadata: {} });
    console.error('✓ DL uses NN');

    await server.createRelation({ from_id: nnId, to_id: cnnId, relation_type: 'type_of', strength: 0.8, metadata: {} });
    console.error('✓ NN type_of CNN');

    await server.createRelation({ from_id: nnId, to_id: rnnId, relation_type: 'type_of', strength: 0.8, metadata: {} });
    console.error('✓ NN type_of RNN');

    await server.createRelation({ from_id: nnId, to_id: transformerId, relation_type: 'type_of', strength: 0.9, metadata: {} });
    console.error('✓ NN type_of Transformers\n');

    console.error('3. Testing spreading_activation with query "neural networks"...');
    
    const result = await server.getSpreadingService().spreadActivation('neural networks', 3);
    
    console.error('✓ Spreading activation completed:', {
      totalScores: result.scores.length,
      iterations: result.iterations,
      converged: result.converged,
      seedNodes: result.seedNodes.length
    });

    if (result.scores.length > 0) {
      console.error('\n4. Analyzing activation scores...');
      
      result.scores.slice(0, 10).forEach((score, i) => {
        console.error(`  ${i + 1}. Entity: ${score.entityId.substring(0, 8)}...`);
        console.error(`     Activation: ${score.activation.toFixed(4)}`);
        console.error(`     Source: ${score.source}`);
        console.error(`     Hops: ${score.hops}`);
        console.error('');
      });

      // Verify seed nodes
      console.error('5. Verifying seed nodes...');
      const seedCount = result.scores.filter(s => s.source === 'seed').length;
      const propagatedCount = result.scores.filter(s => s.source === 'propagated').length;
      console.error(`  - Seed nodes: ${seedCount}`);
      console.error(`  - Propagated nodes: ${propagatedCount}`);

      // Check convergence
      console.error('\n6. Convergence analysis:');
      console.error(`  - Converged: ${result.converged ? 'Yes' : 'No'}`);
      console.error(`  - Iterations: ${result.iterations}`);

      // Verify activation distribution
      const highActivation = result.scores.filter(s => s.activation >= 0.7).length;
      const mediumActivation = result.scores.filter(s => s.activation >= 0.3 && s.activation < 0.7).length;
      const lowActivation = result.scores.filter(s => s.activation < 0.3).length;

      console.error('\n7. Activation distribution:');
      console.error(`  - High (≥0.7): ${highActivation}`);
      console.error(`  - Medium (0.3-0.7): ${mediumActivation}`);
      console.error(`  - Low (<0.3): ${lowActivation}`);

    } else {
      console.error('⚠ No activation scores found');
    }

    console.error('\n8. Testing with different seed_top_k...');
    
    const result2 = await server.getSpreadingService().spreadActivation('deep learning', 2);
    console.error(`✓ With seed_top_k=2: ${result2.scores.length} results, ${result2.iterations} iterations`);

    console.error('\n=== ✓ spreading_activation MCP Tool Test Passed ===\n');

  } catch (error) {
    console.error('\n=== ✗ Test Failed ===');
    console.error('Error:', error);
    throw error;
  } finally {
    // Cleanup
    server.db.close();
    if (fs.existsSync(dbFile)) {
      try {
        fs.unlinkSync(dbFile);
        console.error('[Cleanup] Test database removed');
      } catch (e) {
        console.error('[Cleanup] Warning: Could not remove test database');
      }
    }
  }
}

runTest().catch(console.error);
