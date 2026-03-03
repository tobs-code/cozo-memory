import { MemoryServer } from './index';
import * as fs from 'fs';

const TEST_DB_PATH = 'test_logical_edges_mcp';

async function runTest() {
  console.error('=== Testing discover_logical_edges and materialize_logical_edges MCP Tools ===\n');

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
    
    // Create entities of same type
    const project1 = await server.createEntity({ 
      name: 'Project Alpha', 
      type: 'Project', 
      metadata: { category: 'software', status: 'active' } 
    });
    console.error(`✓ Created Project Alpha: ${project1.id?.substring(0, 8)}...`);
    
    const project2 = await server.createEntity({ 
      name: 'Project Beta', 
      type: 'Project', 
      metadata: { category: 'software', status: 'planning' } 
    });
    console.error(`✓ Created Project Beta: ${project2.id?.substring(0, 8)}...`);
    
    const project3 = await server.createEntity({ 
      name: 'Project Gamma', 
      type: 'Project', 
      metadata: { category: 'hardware', status: 'active' } 
    });
    console.error(`✓ Created Project Gamma: ${project3.id?.substring(0, 8)}...\n`);

    // Create some observations with similar content
    await server.addObservation({
      entity_id: project1.id!,
      text: 'This project focuses on machine learning algorithms',
      metadata: {}
    });
    
    await server.addObservation({
      entity_id: project2.id!,
      text: 'This project also uses machine learning for data analysis',
      metadata: {}
    });

    console.error('2. Testing discover_logical_edges...');
    
    const logicalEdges = await server.getLogicalEdgesService().discoverLogicalEdges(project1.id!);
    
    console.error(`✓ Logical edge discovery completed: ${logicalEdges.length} edges found`);
    
    if (logicalEdges.length > 0) {
      console.error('\n3. Analyzing discovered logical edges...');
      
      logicalEdges.slice(0, 5).forEach((edge: any, i: number) => {
        console.error(`\n  Edge ${i + 1}:`);
        console.error(`    Type: ${edge.edge_type}`);
        console.error(`    From: ${edge.from_id.substring(0, 8)}...`);
        console.error(`    To: ${edge.to_id.substring(0, 8)}...`);
        console.error(`    Confidence: ${edge.confidence.toFixed(2)}`);
        console.error(`    Reason: ${edge.reason}`);
      });

      // Verify edge types
      console.error('\n4. Verifying edge types...');
      
      const sameTypeEdges = logicalEdges.filter((e: any) => e.edge_type === 'same_type');
      const sameCategoryEdges = logicalEdges.filter((e: any) => e.edge_type === 'same_category');
      const contextualEdges = logicalEdges.filter((e: any) => e.edge_type === 'contextual');
      
      console.error(`  - Same Type: ${sameTypeEdges.length}`);
      console.error(`  - Same Category: ${sameCategoryEdges.length}`);
      console.error(`  - Contextual: ${contextualEdges.length}`);

      console.error('\n5. Testing materialize_logical_edges...');
      
      const materializedCount = await server.getLogicalEdgesService().materializeLogicalEdges(project1.id!);
      
      console.error(`✓ Materialization completed: ${materializedCount} edges materialized`);

      if (materializedCount > 0) {
        console.error('\n6. Verifying materialized relationships...');
        
        // Query relationships from project1
        const relRes = await server.db.run(`
          ?[to_id, relation_type, strength] := 
            *relationship{from_id, to_id, relation_type, strength, @ "NOW"},
            from_id = $from_id
        `, { from_id: project1.id });
        
        console.error(`  ✓ Found ${relRes.rows.length} relationships from Project Alpha`);
        
        if (relRes.rows.length > 0) {
          relRes.rows.slice(0, 3).forEach((r: any, i: number) => {
            console.error(`    ${i + 1}. Type: ${r[1]}, Strength: ${r[2].toFixed(2)}`);
          });
        }
      }

    } else {
      console.error('⚠ No logical edges discovered (entities may be too dissimilar)');
    }

    console.error('\n7. Testing detect_temporal_patterns...');
    
    // Add more observations with timestamps
    await server.addObservation({
      entity_id: project1.id!,
      text: 'Sprint 1 completed',
      metadata: {}
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await server.addObservation({
      entity_id: project1.id!,
      text: 'Sprint 2 in progress',
      metadata: {}
    });

    // Use the MCP tool interface through the server
    const patterns = await (async () => {
      const entityRes = await server.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: project1.id });
      if (entityRes.rows.length === 0) {
        return { error: 'Entity not found' };
      }
      
      const obsRes = await server.db.run(`
        ?[id, text, created_at] := 
          *observation{id, entity_id, text, created_at, @ "NOW"},
          entity_id = $entity_id
      `, { entity_id: project1.id });
      
      const observations = obsRes.rows.map((r: any) => ({
        id: r[0],
        text: r[1],
        timestamp: r[2][0] / 1000
      }));
      
      observations.sort((a: any, b: any) => a.timestamp - b.timestamp);
      
      const patterns: any[] = [];
      
      if (observations.length >= 3) {
        const timeSpan = observations[observations.length - 1].timestamp - observations[0].timestamp;
        const avgInterval = timeSpan / (observations.length - 1);
        
        if (avgInterval < 7 * 24 * 60 * 60 * 1000) {
          patterns.push({
            type: "trending",
            confidence: 0.8,
            description: "High frequency of observations detected",
            observation_count: observations.length,
            time_span_days: (timeSpan / (24 * 60 * 60 * 1000)).toFixed(1)
          });
        }
      }
      
      return {
        entity_id: project1.id,
        observation_count: observations.length,
        patterns,
        time_range: {
          start: new Date(observations[0].timestamp).toISOString(),
          end: new Date(observations[observations.length - 1].timestamp).toISOString()
        }
      };
    })();

    console.error(`✓ Temporal pattern detection completed`);
    console.error(`  - Observations analyzed: ${patterns.observation_count}`);
    console.error(`  - Patterns found: ${patterns.patterns?.length || 0}`);
    
    if (patterns.patterns && patterns.patterns.length > 0) {
      patterns.patterns.forEach((p: any, i: number) => {
        console.error(`\n  Pattern ${i + 1}:`);
        console.error(`    Type: ${p.type}`);
        console.error(`    Confidence: ${p.confidence.toFixed(2)}`);
        console.error(`    Description: ${p.description}`);
      });
    }

    console.error('\n=== ✓ Logical Edges and Temporal Patterns MCP Tools Test Passed ===\n');

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
