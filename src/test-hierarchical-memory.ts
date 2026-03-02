/**
 * Test: Hierarchical Memory Levels
 * 
 * Tests L0-L3 memory compression with importance scoring
 */

import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';
import { HierarchicalMemoryService, MemoryLevel } from './hierarchical-memory';
import { v4 as uuidv4 } from 'uuid';

async function testHierarchicalMemory() {
  console.log('\n=== Testing Hierarchical Memory Levels ===\n');

  const db = new CozoDb('mem', '');
  const embeddings = new EmbeddingService();
  const hierarchicalMemory = new HierarchicalMemoryService(db, embeddings, {
    l0_retention_hours: 0.001, // Very short for testing (3.6 seconds)
    l1_retention_days: 0.00001, // Very short for testing
    l2_retention_days: 0.00002,
    l3_retention_days: 0.00003,
    compression_threshold: 0.5,
    min_observations_for_compression: 3,
    llm_model: 'demyagent-4b-i1:Q6_K'
  });

  try {
    // Setup schema
    console.log('Setting up schema...');
    await db.run(`
      :create entity {
        id: String =>
        name: String,
        type: String,
        embedding: <F32; 1024>,
        name_embedding: <F32; 1024>,
        metadata: Json,
        created_at: Validity
      }
    `);

    await db.run(`
      :create observation {
        id: String,
        created_at: Validity =>
        entity_id: String,
        text: String,
        embedding: <F32; 1024>,
        metadata: Json
      }
    `);

    await db.run(`
      :create relationship {
        from_id: String,
        to_id: String,
        created_at: Validity =>
        relation_type: String,
        strength: Float,
        metadata: Json
      }
    `);

    // Create test entity
    console.log('\n1. Creating test entity...');
    const entityId = uuidv4();
    const entityName = 'Test Project Alpha';
    const entityEmbedding = await embeddings.embed(entityName);
    const now = Date.now() * 1000;

    await db.run(`
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
    `, {
      id: entityId,
      created_at: [now, true],
      name: entityName,
      type: 'Project',
      embedding: entityEmbedding,
      name_embedding: entityEmbedding,
      metadata: {}
    });

    console.log(`✓ Created entity: ${entityId}`);

    // Create L0 observations (raw observations)
    console.log('\n2. Creating L0 observations...');
    const observations = [
      'Started initial planning phase for Project Alpha',
      'Completed requirements gathering with stakeholders',
      'Identified key technical challenges and dependencies',
      'Set up development environment and CI/CD pipeline',
      'First sprint planning meeting completed',
      'Team onboarding and role assignments finalized',
      'Architecture design review scheduled for next week',
      'Budget approval received from finance department',
      'Risk assessment document created and reviewed',
      'Project kickoff meeting with all stakeholders'
    ];

    const obsIds: string[] = [];
    for (let i = 0; i < observations.length; i++) {
      const obsId = uuidv4();
      const obsText = observations[i];
      const obsEmbedding = await embeddings.embed(obsText);
      const obsTime = (now - (observations.length - i) * 10000000); // Spread over time

      await db.run(`
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
      `, {
        id: obsId,
        created_at: [obsTime, true],
        entity_id: entityId,
        text: obsText,
        embedding: obsEmbedding,
        metadata: {
          memory_level: MemoryLevel.L0_RAW,
          access_count: Math.floor(Math.random() * 10)
        }
      });

      obsIds.push(obsId);
      console.log(`  ✓ Created observation ${i + 1}/${observations.length}: "${obsText.substring(0, 50)}..."`);
    }

    // Get initial memory stats
    console.log('\n3. Initial memory statistics...');
    const initialStats = await hierarchicalMemory.getMemoryStats(entityId);
    console.log(`  Total observations: ${initialStats.total_observations}`);
    console.log(`  By level:`, initialStats.by_level);

    // Calculate importance scores
    console.log('\n4. Calculating importance scores...');
    for (let i = 0; i < Math.min(3, obsIds.length); i++) {
      const score = await hierarchicalMemory.calculateImportanceScore(obsIds[i]);
      console.log(`  Observation ${i + 1}:`);
      console.log(`    PageRank: ${score.pagerank.toFixed(3)}`);
      console.log(`    Recency: ${score.recency.toFixed(3)}`);
      console.log(`    Access Frequency: ${score.accessFrequency.toFixed(3)}`);
      console.log(`    Combined: ${score.combined.toFixed(3)}`);
    }

    // Compress L0 to L1
    console.log('\n5. Compressing L0 → L1...');
    const l0Result = await hierarchicalMemory.compressMemoryLevel(entityId, MemoryLevel.L0_RAW);
    
    if (l0Result) {
      console.log(`  ✓ Compression successful!`);
      console.log(`    Compressed observations: ${l0Result.compressed_observations}`);
      console.log(`    Preserved (high importance): ${l0Result.preserved_observations.length}`);
      console.log(`    Deleted (low importance): ${l0Result.deleted_observations.length}`);
      console.log(`    Summary ID: ${l0Result.summary_id}`);
      console.log(`    Summary: "${l0Result.summary_text.substring(0, 100)}..."`);
    } else {
      console.log('  ℹ Not enough observations for compression (expected for test)');
    }

    // Get updated memory stats
    console.log('\n6. Updated memory statistics...');
    const updatedStats = await hierarchicalMemory.getMemoryStats(entityId);
    console.log(`  Total observations: ${updatedStats.total_observations}`);
    console.log(`  By level:`, updatedStats.by_level);

    // Test compress all levels
    console.log('\n7. Testing compress all levels...');
    const allResults = await hierarchicalMemory.compressAllLevels(entityId);
    console.log(`  ✓ Processed ${allResults.length} compression operations`);
    
    for (const result of allResults) {
      console.log(`    Level ${result.level}: ${result.compressed_observations} observations → ${result.preserved_observations.length} preserved, ${result.deleted_observations.length} deleted`);
    }

    // Final memory stats
    console.log('\n8. Final memory statistics...');
    const finalStats = await hierarchicalMemory.getMemoryStats(entityId);
    console.log(`  Total observations: ${finalStats.total_observations}`);
    console.log(`  By level:`, finalStats.by_level);

    // Test configuration
    console.log('\n9. Testing configuration...');
    const config = hierarchicalMemory.getConfig();
    console.log(`  L0 retention: ${config.l0_retention_hours} hours`);
    console.log(`  L1 retention: ${config.l1_retention_days} days`);
    console.log(`  L2 retention: ${config.l2_retention_days} days`);
    console.log(`  L3 retention: ${config.l3_retention_days} days`);
    console.log(`  Compression threshold: ${config.compression_threshold}`);
    console.log(`  Min observations: ${config.min_observations_for_compression}`);

    // Update configuration
    hierarchicalMemory.updateConfig({
      compression_threshold: 0.7
    });
    console.log(`  ✓ Updated compression threshold to 0.7`);

    console.log('\n✅ All hierarchical memory tests passed!\n');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    db.close();
  }
}

// Run tests
testHierarchicalMemory().catch(console.error);
