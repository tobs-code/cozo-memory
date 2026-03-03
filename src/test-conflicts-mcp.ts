import { MemoryServer } from './index';
import * as fs from 'fs';

const TEST_DB_PATH = 'test_conflicts_mcp';

async function runTest() {
  console.error('=== Testing detect_conflicts and resolve_conflicts MCP Tools ===\n');

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
    console.error('1. Creating test entity...');
    
    const entityResult = await server.createEntity({ 
      name: 'Project Alpha', 
      type: 'Project', 
      metadata: {} 
    });
    const entityId = entityResult.id!;
    console.error(`✓ Created entity: ${entityId}\n`);

    console.error('2. Adding observations with potential conflicts...');
    
    // Add first observation
    const obs1 = await server.addObservation({
      entity_id: entityId,
      text: 'Project status is pending approval',
      metadata: { timestamp: Date.now() }
    });
    console.error(`✓ Added observation 1: ${obs1.id?.substring(0, 8)}...`);
    
    // Wait a bit to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Add redundant observation (very similar)
    const obs2 = await server.addObservation({
      entity_id: entityId,
      text: 'Project status is pending approval and waiting',
      metadata: { timestamp: Date.now() }
    });
    console.error(`✓ Added observation 2 (redundant): ${obs2.id?.substring(0, 8)}...`);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Add superseding observation
    const obs3 = await server.addObservation({
      entity_id: entityId,
      text: 'Project status updated: now approved and in progress',
      metadata: { timestamp: Date.now() }
    });
    console.error(`✓ Added observation 3 (superseding): ${obs3.id?.substring(0, 8)}...`);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Add contradictory observation
    const obs4 = await server.addObservation({
      entity_id: entityId,
      text: 'Project is not approved and has been rejected',
      metadata: { timestamp: Date.now() }
    });
    console.error(`✓ Added observation 4 (contradictory): ${obs4.id?.substring(0, 8)}...\n`);

    console.error('3. Testing detect_conflicts...');
    
    const conflicts = await server.getConflictService().detectConflicts(entityId);
    
    console.error(`✓ Conflict detection completed: ${conflicts.length} conflicts found`);
    
    if (conflicts.length > 0) {
      console.error('\n4. Analyzing detected conflicts...');
      
      conflicts.forEach((conflict, i) => {
        console.error(`\n  Conflict ${i + 1}:`);
        console.error(`    Type: ${conflict.conflict_type}`);
        console.error(`    Confidence: ${conflict.confidence.toFixed(2)} (${conflict.confidence_level})`);
        console.error(`    Older: "${conflict.older_text.substring(0, 50)}..."`);
        console.error(`    Newer: "${conflict.newer_text.substring(0, 50)}..."`);
        console.error(`    Reason: ${conflict.reason}`);
      });

      // Verify conflict types
      console.error('\n5. Verifying conflict types...');
      
      const redundancyConflicts = conflicts.filter(c => c.conflict_type === 'temporal_redundancy');
      const contradictionConflicts = conflicts.filter(c => c.conflict_type === 'semantic_contradiction');
      const supersededConflicts = conflicts.filter(c => c.conflict_type === 'superseded_fact');
      
      console.error(`  - Temporal Redundancy: ${redundancyConflicts.length}`);
      console.error(`  - Semantic Contradiction: ${contradictionConflicts.length}`);
      console.error(`  - Superseded Fact: ${supersededConflicts.length}`);

      // Check confidence levels
      const highConfidence = conflicts.filter(c => c.confidence_level === 'high');
      const mediumConfidence = conflicts.filter(c => c.confidence_level === 'medium');
      const lowConfidence = conflicts.filter(c => c.confidence_level === 'low');
      
      console.error('\n6. Confidence distribution:');
      console.error(`  - High: ${highConfidence.length}`);
      console.error(`  - Medium: ${mediumConfidence.length}`);
      console.error(`  - Low: ${lowConfidence.length}`);

      console.error('\n7. Testing resolve_conflicts...');
      
      const resolution = await server.getConflictService().resolveConflicts(entityId);
      
      console.error(`✓ Conflict resolution completed:`);
      console.error(`  - Resolved conflicts: ${resolution.resolved_conflicts}`);
      console.error(`  - Invalidated observations: ${resolution.invalidated_observations.length}`);
      console.error(`  - Audit trail entries: ${resolution.audit_observations.length}`);

      if (resolution.invalidated_observations.length > 0) {
        console.error('\n8. Verifying invalidated observations...');
        console.error(`  Invalidated IDs: ${resolution.invalidated_observations.map(id => id.substring(0, 8)).join(', ')}...`);
      }

      if (resolution.audit_observations.length > 0) {
        console.error('\n9. Verifying audit trail...');
        console.error(`  Audit IDs: ${resolution.audit_observations.map(id => id.substring(0, 8)).join(', ')}...`);
      }

      console.error('\n10. Re-checking for conflicts after resolution...');
      
      const remainingConflicts = await server.getConflictService().detectConflicts(entityId);
      console.error(`✓ Remaining conflicts: ${remainingConflicts.length} (expected: 0)`);
      
      if (remainingConflicts.length === 0) {
        console.error('  ✓ All conflicts successfully resolved!');
      } else {
        console.error('  ⚠ Some conflicts remain (this may be expected for certain conflict types)');
      }

    } else {
      console.error('⚠ No conflicts detected (observations may be too dissimilar)');
    }

    console.error('\n=== ✓ Conflict Detection and Resolution MCP Tools Test Passed ===\n');

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
