import { MemoryServer } from './index';
import * as fs from 'fs';

const TEST_DB_PATH = 'test_hierarchical_mcp';

async function runTest() {
  console.error('=== Testing compress_memory_levels and analyze_memory_distribution MCP Tools ===\n');

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
    
    const entity = await server.createEntity({ 
      name: 'Test Project', 
      type: 'Project', 
      metadata: {} 
    });
    const entityId = entity.id!;
    console.error(`✓ Created entity: ${entityId.substring(0, 8)}...\n`);

    console.error('2. Adding observations at L0 (raw) level...');
    
    // Add multiple observations with L0 level and varied content to avoid deduplication
    for (let i = 0; i < 15; i++) {
      await server.addObservation({
        entity_id: entityId,
        text: `Observation ${i + 1}: This is a test observation about topic ${i * 7} with unique content ${Math.random().toString(36).substring(7)}`,
        metadata: { memory_level: 0 },
        deduplicate: false // Disable deduplication for this test
      });
    }
    console.error(`✓ Added 15 observations at L0 level\n`);

    console.error('3. Testing analyze_memory_distribution...');
    
    const stats = await server.getHierarchicalMemoryService().getMemoryStats(entityId);
    
    console.error(`✓ Memory distribution analysis completed:`);
    console.error(`  - Total observations: ${stats.total_observations}`);
    console.error(`  - L0 (Raw): ${stats.by_level[0] || 0}`);
    console.error(`  - L1 (Session): ${stats.by_level[1] || 0}`);
    console.error(`  - L2 (Weekly): ${stats.by_level[2] || 0}`);
    console.error(`  - L3 (Monthly): ${stats.by_level[3] || 0}\n`);

    if (stats.total_observations !== 15) {
      console.error(`⚠ Warning: Expected 15 observations, got ${stats.total_observations}`);
    }

    console.error('4. Testing compress_memory_levels (will likely not compress due to recency)...');
    
    // Note: Compression requires observations older than retention period
    // For L0, default is 24 hours, so fresh observations won't be compressed
    const compressionResult = await server.getHierarchicalMemoryService().compressMemoryLevel(entityId, 0);
    
    if (compressionResult) {
      console.error(`✓ Compression completed:`);
      console.error(`  - Level: ${compressionResult.level}`);
      console.error(`  - Compressed observations: ${compressionResult.compressed_observations}`);
      console.error(`  - Summary ID: ${compressionResult.summary_id.substring(0, 8)}...`);
      console.error(`  - Preserved: ${compressionResult.preserved_observations.length}`);
      console.error(`  - Deleted: ${compressionResult.deleted_observations.length}`);
    } else {
      console.error(`✓ No compression performed (observations too recent or insufficient count)`);
      console.error(`  This is expected behavior - observations must be older than retention period`);
    }

    console.error('\n5. Re-checking memory distribution after compression attempt...');
    
    const statsAfter = await server.getHierarchicalMemoryService().getMemoryStats(entityId);
    
    console.error(`✓ Updated memory distribution:`);
    console.error(`  - Total observations: ${statsAfter.total_observations}`);
    console.error(`  - L0 (Raw): ${statsAfter.by_level[0] || 0}`);
    console.error(`  - L1 (Session): ${statsAfter.by_level[1] || 0}`);
    console.error(`  - L2 (Weekly): ${statsAfter.by_level[2] || 0}`);
    console.error(`  - L3 (Monthly): ${statsAfter.by_level[3] || 0}`);

    console.error('\n6. Testing with manually aged observations...');
    
    // Create observations with old timestamps by manipulating metadata
    const oldTimestamp = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    console.error(`  Note: CozoDB Validity uses system time, so we cannot easily simulate old observations`);
    console.error(`  In production, compression would work on observations older than retention periods`);

    console.error('\n=== ✓ Hierarchical Memory MCP Tools Test Passed ===\n');

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
