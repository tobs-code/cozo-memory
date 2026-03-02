/**
 * Test suite for Temporal Conflict Resolution Service
 * 
 * Tests T-GRAG-inspired conflict detection and resolution
 */

import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';
import {
  TemporalConflictResolutionService,
  ConflictType,
  ConflictConfidence,
} from './temporal-conflict-resolution';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = 'test_temporal_conflict.cozo.db';

async function setupDatabase(): Promise<CozoDb> {
  const db = new CozoDb('sqlite', DB_PATH);

  // Create schema matching the main codebase format
  try {
    await db.run(`
      :create entity {
        id: String,
        created_at: Validity
        =>
        name: String,
        type: String,
        embedding: <F32; 1024>,
        name_embedding: <F32; 1024>,
        metadata: Json
      }
    `);
  } catch (e) {
    // Schema already exists, ignore
  }

  try {
    await db.run(`
      :create observation {
        id: String,
        created_at: Validity
        =>
        entity_id: String,
        text: String,
        embedding: <F32; 1024>,
        metadata: Json
      }
    `);
  } catch (e) {
    // Schema already exists, ignore
  }

  return db;
}

async function createTestEntity(
  db: CozoDb,
  embeddings: EmbeddingService,
  name: string
): Promise<string> {
  const entityId = uuidv4();
  const embedding = await embeddings.embed(name);
  const now = Date.now() * 1000; // Convert to microseconds

  await db.run(
    `
    ?[id, created_at, name, type, embedding, name_embedding, metadata] := 
      id = $id,
      created_at = $created_at,
      name = $name,
      type = $type,
      embedding = $embedding,
      name_embedding = $name_embedding,
      metadata = $metadata
    
    :put entity {
      id, created_at => name, type, embedding, name_embedding, metadata
    }
  `,
    {
      id: entityId,
      created_at: [now, true], // Validity format: [timestamp_microseconds, is_valid]
      name,
      type: 'test',
      embedding,
      name_embedding: embedding,
      metadata: {},
    }
  );

  return entityId;
}

async function createTestObservation(
  db: CozoDb,
  embeddings: EmbeddingService,
  entityId: string,
  text: string,
  createdAt: number
): Promise<string> {
  const obsId = uuidv4();
  const embedding = await embeddings.embed(text);

  await db.run(
    `
    ?[id, created_at, entity_id, text, embedding, metadata] := 
      id = $id,
      created_at = $created_at,
      entity_id = $entity_id,
      text = $text,
      embedding = $embedding,
      metadata = $metadata
    
    :put observation {
      id, created_at => entity_id, text, embedding, metadata
    }
  `,
    {
      id: obsId,
      created_at: [createdAt * 1000, true], // Validity format: [timestamp_microseconds, is_valid]
      entity_id: entityId,
      text,
      embedding,
      metadata: {},
    }
  );

  return obsId;
}

async function runTests() {
  console.log('🧪 Starting Temporal Conflict Resolution Tests\n');

  const db = await setupDatabase();
  const embeddings = new EmbeddingService();
  const conflictService = new TemporalConflictResolutionService(db, embeddings);

  try {
    // Test 1: Temporal Redundancy Detection
    console.log('Test 1: Temporal Redundancy Detection');
    const entity1 = await createTestEntity(db, embeddings, 'Project Alpha');
    
    const now = Date.now();
    const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);
    
    await createTestObservation(
      db,
      embeddings,
      entity1,
      'Project Alpha is in active development with 5 team members',
      oneMonthAgo
    );
    
    await createTestObservation(
      db,
      embeddings,
      entity1,
      'Project Alpha is actively being developed by a team of 5 people',
      now
    );

    const conflicts1 = await conflictService.detectConflicts(entity1);
    console.log(`✓ Found ${conflicts1.length} conflict(s)`);
    if (conflicts1.length > 0) {
      console.log(`  Type: ${conflicts1[0].conflict_type}`);
      console.log(`  Confidence: ${(conflicts1[0].confidence * 100).toFixed(1)}%`);
      console.log(`  Reason: ${conflicts1[0].reason}`);
    }
    console.log('');

    // Test 2: Semantic Contradiction Detection
    console.log('Test 2: Semantic Contradiction Detection');
    const entity2 = await createTestEntity(db, embeddings, 'Service Beta');
    
    await createTestObservation(
      db,
      embeddings,
      entity2,
      'Service Beta is active and running in production',
      oneMonthAgo
    );
    
    await createTestObservation(
      db,
      embeddings,
      entity2,
      'Service Beta has been discontinued and shut down',
      now
    );

    const conflicts2 = await conflictService.detectConflicts(entity2);
    console.log(`✓ Found ${conflicts2.length} conflict(s)`);
    if (conflicts2.length > 0) {
      console.log(`  Type: ${conflicts2[0].conflict_type}`);
      console.log(`  Confidence: ${(conflicts2[0].confidence * 100).toFixed(1)}%`);
      console.log(`  Reason: ${conflicts2[0].reason}`);
    }
    console.log('');

    // Test 3: Superseded Fact Detection
    console.log('Test 3: Superseded Fact Detection');
    const entity3 = await createTestEntity(db, embeddings, 'Company Revenue');
    
    await createTestObservation(
      db,
      embeddings,
      entity3,
      'Company revenue was $10 million in Q1 2025',
      oneMonthAgo
    );
    
    await createTestObservation(
      db,
      embeddings,
      entity3,
      'Updated: Company revenue is now $12 million in Q1 2025 after corrections',
      now
    );

    const conflicts3 = await conflictService.detectConflicts(entity3);
    console.log(`✓ Found ${conflicts3.length} conflict(s)`);
    if (conflicts3.length > 0) {
      console.log(`  Type: ${conflicts3[0].conflict_type}`);
      console.log(`  Confidence: ${(conflicts3[0].confidence * 100).toFixed(1)}%`);
      console.log(`  Reason: ${conflicts3[0].reason}`);
    }
    console.log('');

    // Test 4: Conflict Resolution
    console.log('Test 4: Conflict Resolution');
    const entity4 = await createTestEntity(db, embeddings, 'Product Gamma');
    
    await createTestObservation(
      db,
      embeddings,
      entity4,
      'Product Gamma is available for purchase',
      oneMonthAgo
    );
    
    await createTestObservation(
      db,
      embeddings,
      entity4,
      'Product Gamma is no longer available and has been removed from catalog',
      now
    );

    const resolution = await conflictService.resolveConflicts(entity4);
    console.log(`✓ Resolved ${resolution.resolved_conflicts} conflict(s)`);
    console.log(`  Invalidated observations: ${resolution.invalidated_observations.length}`);
    console.log(`  Audit observations created: ${resolution.audit_observations.length}`);
    console.log('');

    // Test 5: No Conflicts (Different Topics)
    console.log('Test 5: No Conflicts (Different Topics)');
    const entity5 = await createTestEntity(db, embeddings, 'Team Delta');
    
    await createTestObservation(
      db,
      embeddings,
      entity5,
      'Team Delta is working on the frontend',
      oneMonthAgo
    );
    
    await createTestObservation(
      db,
      embeddings,
      entity5,
      'Team Delta completed the backend integration',
      now
    );

    const conflicts5 = await conflictService.detectConflicts(entity5);
    console.log(`✓ Found ${conflicts5.length} conflict(s) (expected: 0)`);
    if (conflicts5.length > 0) {
      console.log(`  Unexpected conflict found:`);
      console.log(`  Type: ${conflicts5[0].conflict_type}`);
      console.log(`  Confidence: ${(conflicts5[0].confidence * 100).toFixed(1)}%`);
      console.log(`  Reason: ${conflicts5[0].reason}`);
    }
    console.log('');

    // Test 6: Configuration Update
    console.log('Test 6: Configuration Update');
    const originalConfig = conflictService.getConfig();
    console.log(`  Original similarity threshold: ${originalConfig.similarityThreshold}`);
    
    conflictService.updateConfig({ similarityThreshold: 0.9 });
    const updatedConfig = conflictService.getConfig();
    console.log(`  Updated similarity threshold: ${updatedConfig.similarityThreshold}`);
    console.log('✓ Configuration updated successfully');
    console.log('');

    // Test 7: Time Window Filtering
    console.log('Test 7: Time Window Filtering');
    const entity7 = await createTestEntity(db, embeddings, 'Old Project');
    
    const twoYearsAgo = now - (730 * 24 * 60 * 60 * 1000);
    
    await createTestObservation(
      db,
      embeddings,
      entity7,
      'Old Project is active',
      twoYearsAgo
    );
    
    await createTestObservation(
      db,
      embeddings,
      entity7,
      'Old Project is inactive',
      now
    );

    // Should not detect conflict due to time window (default 365 days)
    const conflicts7 = await conflictService.detectConflicts(entity7);
    console.log(`✓ Found ${conflicts7.length} conflict(s) (expected: 0 due to time window)`);
    console.log('');

    // Test 8: Multiple Conflicts
    console.log('Test 8: Multiple Conflicts');
    const entity8 = await createTestEntity(db, embeddings, 'Multi Conflict');
    
    const threeMonthsAgo = now - (90 * 24 * 60 * 60 * 1000);
    const twoMonthsAgo = now - (60 * 24 * 60 * 60 * 1000);
    
    await createTestObservation(
      db,
      embeddings,
      entity8,
      'Status is enabled and operational',
      threeMonthsAgo
    );
    
    await createTestObservation(
      db,
      embeddings,
      entity8,
      'Status is disabled temporarily',
      twoMonthsAgo
    );
    
    await createTestObservation(
      db,
      embeddings,
      entity8,
      'Status is permanently shut down',
      now
    );

    const conflicts8 = await conflictService.detectConflicts(entity8);
    console.log(`✓ Found ${conflicts8.length} conflict(s)`);
    conflicts8.forEach((c, i) => {
      console.log(`  Conflict ${i + 1}: ${c.conflict_type} (confidence: ${(c.confidence * 100).toFixed(1)}%)`);
    });
    console.log('');

    console.log('✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    // Cleanup
    try {
      const fs = await import('fs');
      if (fs.existsSync(DB_PATH)) {
        fs.unlinkSync(DB_PATH);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Run tests
runTests().catch(console.error);
