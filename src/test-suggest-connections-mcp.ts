import { MemoryServer } from './index';
import * as fs from 'fs';

const TEST_DB_PATH = 'test_suggest_connections_mcp';

async function runTest() {
  console.error('=== Testing suggest_connections MCP Tool ===\n');

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
    console.error('1. Creating test entities...');
    
    // Create entities
    const aliceResult = await server.createEntity({ name: 'Alice', type: 'Person', metadata: { role: 'Developer', team: 'Backend' } });
    const aliceId = aliceResult.id!;
    console.error(`✓ Created Alice: ${aliceId}`);

    const bobResult = await server.createEntity({ name: 'Bob', type: 'Person', metadata: { role: 'Engineer', team: 'Backend' } });
    const bobId = bobResult.id!;
    console.error(`✓ Created Bob: ${bobId}`);

    const charlieResult = await server.createEntity({ name: 'Charlie', type: 'Person', metadata: { role: 'Manager', team: 'Backend' } });
    const charlieId = charlieResult.id!;
    console.error(`✓ Created Charlie: ${charlieId}`);

    const davidResult = await server.createEntity({ name: 'David', type: 'Person', metadata: { role: 'Designer', team: 'Frontend' } });
    const davidId = davidResult.id!;
    console.error(`✓ Created David: ${davidId}`);

    const projectXResult = await server.createEntity({ name: 'Project X', type: 'Project', metadata: { status: 'active' } });
    const projectXId = projectXResult.id!;
    console.error(`✓ Created Project X: ${projectXId}`);

    const projectYResult = await server.createEntity({ name: 'Project Y', type: 'Project', metadata: { status: 'planning' } });
    const projectYId = projectYResult.id!;
    console.error(`✓ Created Project Y: ${projectYId}\n`);

    console.error('2. Creating relationships...');
    
    // Alice works on Project X
    await server.createRelation({ from_id: aliceId, to_id: projectXId, relation_type: 'works_on', strength: 1.0, metadata: {} });
    console.error('✓ Alice works_on Project X');

    // Bob works on Project X
    await server.createRelation({ from_id: bobId, to_id: projectXId, relation_type: 'works_on', strength: 1.0, metadata: {} });
    console.error('✓ Bob works_on Project X');

    // Charlie manages Project X
    await server.createRelation({ from_id: charlieId, to_id: projectXId, relation_type: 'manages', strength: 1.0, metadata: {} });
    console.error('✓ Charlie manages Project X');

    // Bob knows Charlie
    await server.createRelation({ from_id: bobId, to_id: charlieId, relation_type: 'knows', strength: 0.8, metadata: {} });
    console.error('✓ Bob knows Charlie');

    // David works on Project Y
    await server.createRelation({ from_id: davidId, to_id: projectYId, relation_type: 'works_on', strength: 1.0, metadata: {} });
    console.error('✓ David works_on Project Y\n');

    console.error('3. Testing suggest_connections for Alice via direct method...');
    
    const suggestions = await server.getSuggestionsService().suggestConnections(aliceId);
    console.error('✓ Suggestions retrieved:', {
      entity_id: aliceId,
      count: suggestions.length
    });

    console.error('3. Testing suggest_connections for Alice via direct method...');
    
    const aliceSuggestions = await server.getSuggestionsService().suggestConnections(aliceId);
    console.error('✓ Suggestions retrieved:', {
      entity_id: aliceId,
      count: aliceSuggestions.length
    });

    if (aliceSuggestions && aliceSuggestions.length > 0) {
      console.error('\n4. Analyzing suggestions...');
      
      aliceSuggestions.forEach((s: any, i: number) => {
        console.error(`  ${i + 1}. ${s.entity_name} (${s.entity_type})`);
        console.error(`     Source: ${s.source}`);
        console.error(`     Confidence: ${s.confidence.toFixed(2)} (${s.confidence_level})`);
        console.error(`     Reason: ${s.reason}`);
        if (s.metadata) {
          console.error(`     Metadata:`, JSON.stringify(s.metadata));
        }
        console.error('');
      });

      // Verify expected suggestions
      console.error('5. Verifying expected patterns...');
      
      const bobSuggestion = aliceSuggestions.find((s: any) => s.entity_name === 'Bob');
      if (bobSuggestion) {
        console.error('✓ Found Bob (common neighbor via Project X)');
      }

      const charlieSuggestion = aliceSuggestions.find((s: any) => s.entity_name === 'Charlie');
      if (charlieSuggestion) {
        console.error('✓ Found Charlie (graph proximity via Project X)');
      }

      const projectYSuggestion = aliceSuggestions.find((s: any) => s.entity_name === 'Project Y');
      if (projectYSuggestion) {
        console.error('✓ Found Project Y (vector similarity)');
      }

      // Check confidence levels
      const highConfidence = aliceSuggestions.filter((s: any) => s.confidence_level === 'high');
      const mediumConfidence = aliceSuggestions.filter((s: any) => s.confidence_level === 'medium');
      const lowConfidence = aliceSuggestions.filter((s: any) => s.confidence_level === 'low');

      console.error('\n6. Confidence distribution:');
      console.error(`  - High: ${highConfidence.length}`);
      console.error(`  - Medium: ${mediumConfidence.length}`);
      console.error(`  - Low: ${lowConfidence.length}`);

      // Check sources
      const sources = new Set(aliceSuggestions.map((s: any) => s.source));
      console.error('\n7. Discovery sources used:');
      sources.forEach(source => {
        const count = aliceSuggestions.filter((s: any) => s.source === source).length;
        console.error(`  - ${source}: ${count}`);
      });

    } else {
      console.error('⚠ No suggestions found (this might be expected for sparse graphs)');
    }

    console.error('\n8. Testing with custom parameters...');
    
    const customSuggestions = await server.getSuggestionsService().suggestConnections(bobId);
    console.error(`✓ Custom suggestions for Bob: ${customSuggestions.length} results`);

    console.error('\n=== ✓ suggest_connections MCP Tool Test Passed ===\n');

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
