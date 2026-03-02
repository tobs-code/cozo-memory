import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';
import { ProactiveSuggestionsService, SuggestionSource, ConfidenceLevel } from './proactive-suggestions';
import * as fs from 'fs';

const DB_PATH = 'test_proactive.db';

async function runTests() {
  console.error('[Test] Starting Proactive Suggestions Tests...\n');

  // Clean up old database
  if (fs.existsSync(DB_PATH)) {
    try {
      fs.unlinkSync(DB_PATH);
    } catch (e) {}
  }

  const db = new CozoDb('sqlite', DB_PATH);
  const embeddings = new EmbeddingService();
  
  // Create a wrapper to make ProactiveSuggestionsService work with CozoDb
  const dbWrapper = {
    getEntity: async (id: string) => {
      const res = await db.run('?[name, type, embedding] := *entity{id: $id, name, type, embedding, @ "NOW"}', { id });
      if (res.rows.length === 0) return null;
      return {
        id,
        name: res.rows[0][0],
        type: res.rows[0][1],
        embedding: res.rows[0][2],
      };
    },
    getRelations: async (fromId?: string, toId?: string) => {
      let query = '?[from_id, to_id, relation_type, strength] := *relationship{from_id, to_id, relation_type, strength, @ "NOW"}';
      const params: any = {};
      
      if (fromId) {
        query += ', from_id = $from_id';
        params.from_id = fromId;
      }
      if (toId) {
        query += ', to_id = $to_id';
        params.to_id = toId;
      }
      
      const res = await db.run(query, params);
      return res.rows.map((r: any) => ({
        from_id: r[0],
        to_id: r[1],
        relation_type: r[2],
        strength: r[3],
      }));
    },
    vectorSearchEntity: async (embedding: number[], limit: number) => {
      const res = await db.run('?[id, name, type] := *entity{id, name, type, @ "NOW"} :limit $limit', { limit });
      return res.rows.map((r: any) => [r[0], r[1], r[2], {}, 0.8]);
    },
  } as any;

  const suggestions = new ProactiveSuggestionsService(dbWrapper, embeddings, {
    maxSuggestions: 5,
    minConfidence: 0.5,
    enableVectorSimilarity: true,
    enableCommonNeighbors: true,
    enableInference: true,
    enableGraphProximity: true,
  });

  try {
    // Setup: Create test entities and relationships
    console.error('[Test] Setting up test data...');

    const EMBEDDING_DIM = embeddings.getDimensions();

    // Create entity table
    try {
      await db.run(`{:create entity {id: String, created_at: Validity => name: String, type: String, embedding: <F32; ${EMBEDDING_DIM}>, name_embedding: <F32; ${EMBEDDING_DIM}>, metadata: Json}}`);
    } catch (e) {}

    // Create relationship table
    try {
      await db.run('{:create relationship {from_id: String, to_id: String, relation_type: String, created_at: Validity => strength: Float, metadata: Json}}');
    } catch (e) {}

    // Create entities
    const aliceEmb = await embeddings.embed('Alice Developer');
    const bobEmb = await embeddings.embed('Bob Engineer');
    const charlieEmb = await embeddings.embed('Charlie Manager');
    const projectXEmb = await embeddings.embed('Project X Development');
    const projectYEmb = await embeddings.embed('Project Y Research');

    const now = Date.now() * 1000;

    await db.run(`
      ?[id, created_at, name, type, embedding, name_embedding, metadata] <- [
        ['alice-id', [${now}, true], 'Alice', 'Person', $emb, $emb, {}]
      ] :insert entity {id, created_at => name, type, embedding, name_embedding, metadata}
    `, { emb: aliceEmb });

    await db.run(`
      ?[id, created_at, name, type, embedding, name_embedding, metadata] <- [
        ['bob-id', [${now}, true], 'Bob', 'Person', $emb, $emb, {}]
      ] :insert entity {id, created_at => name, type, embedding, name_embedding, metadata}
    `, { emb: bobEmb });

    await db.run(`
      ?[id, created_at, name, type, embedding, name_embedding, metadata] <- [
        ['charlie-id', [${now}, true], 'Charlie', 'Person', $emb, $emb, {}]
      ] :insert entity {id, created_at => name, type, embedding, name_embedding, metadata}
    `, { emb: charlieEmb });

    await db.run(`
      ?[id, created_at, name, type, embedding, name_embedding, metadata] <- [
        ['project-x-id', [${now}, true], 'Project X', 'Project', $emb, $emb, {}]
      ] :insert entity {id, created_at => name, type, embedding, name_embedding, metadata}
    `, { emb: projectXEmb });

    await db.run(`
      ?[id, created_at, name, type, embedding, name_embedding, metadata] <- [
        ['project-y-id', [${now}, true], 'Project Y', 'Project', $emb, $emb, {}]
      ] :insert entity {id, created_at => name, type, embedding, name_embedding, metadata}
    `, { emb: projectYEmb });

    // Create relationships
    await db.run(`
      ?[from_id, to_id, relation_type, created_at, strength, metadata] <- [
        ['alice-id', 'project-x-id', 'works_on', [${now}, true], 1.0, {}],
        ['bob-id', 'project-x-id', 'works_on', [${now}, true], 1.0, {}],
        ['charlie-id', 'alice-id', 'manages', [${now}, true], 0.9, {}],
        ['bob-id', 'project-y-id', 'works_on', [${now}, true], 0.8, {}],
        ['alice-id', 'bob-id', 'colleague_of', [${now}, true], 0.85, {}]
      ] :insert relationship {from_id, to_id, relation_type, created_at => strength, metadata}
    `);

    console.error('[Test] Test data created.\n');

    // Test 1: Vector Similarity
    console.error('[Test 1] Vector Similarity Discovery');
    const vectorSuggestions = await suggestions.suggestConnections('alice-id');
    console.error(`  Found ${vectorSuggestions.length} suggestions for Alice`);
    vectorSuggestions.forEach(s => {
      console.error(`    - ${s.entity_name} (${s.source}): confidence=${s.confidence.toFixed(2)}`);
    });
    console.error('');

    // Test 2: Common Neighbors
    console.error('[Test 2] Common Neighbors Detection');
    const commonNeighborSuggestions = vectorSuggestions.filter(s => s.source === SuggestionSource.COMMON_NEIGHBORS);
    console.error(`  Found ${commonNeighborSuggestions.length} common neighbor suggestions`);
    commonNeighborSuggestions.forEach(s => {
      console.error(`    - ${s.entity_name}: ${s.reason}`);
    });
    console.error('');

    // Test 3: Graph Proximity
    console.error('[Test 3] Graph Proximity Search');
    const graphProximitySuggestions = vectorSuggestions.filter(s => s.source === SuggestionSource.GRAPH_PROXIMITY);
    console.error(`  Found ${graphProximitySuggestions.length} graph proximity suggestions`);
    graphProximitySuggestions.forEach(s => {
      console.error(`    - ${s.entity_name}: ${s.reason}`);
    });
    console.error('');

    // Test 4: Inference
    console.error('[Test 4] Inference-Based Suggestions');
    const inferenceSuggestions = vectorSuggestions.filter(s => s.source === SuggestionSource.INFERENCE);
    console.error(`  Found ${inferenceSuggestions.length} inferred suggestions`);
    inferenceSuggestions.forEach(s => {
      console.error(`    - ${s.entity_name}: ${s.reason}`);
    });
    console.error('');

    // Test 5: Confidence Levels
    console.error('[Test 5] Confidence Level Distribution');
    const highConfidence = vectorSuggestions.filter(s => s.confidence_level === ConfidenceLevel.HIGH);
    const mediumConfidence = vectorSuggestions.filter(s => s.confidence_level === ConfidenceLevel.MEDIUM);
    const lowConfidence = vectorSuggestions.filter(s => s.confidence_level === ConfidenceLevel.LOW);
    console.error(`  High: ${highConfidence.length}, Medium: ${mediumConfidence.length}, Low: ${lowConfidence.length}`);
    console.error('');

    // Test 6: Batch Operations
    console.error('[Test 6] Batch Suggestions');
    const batchResults = await suggestions.suggestConnectionsBatch(['alice-id', 'bob-id', 'charlie-id']);
    console.error(`  Processed ${batchResults.size} entities`);
    for (const [entityId, suggs] of batchResults.entries()) {
      console.error(`    ${entityId}: ${suggs.length} suggestions`);
    }
    console.error('');

    // Test 7: Configuration
    console.error('[Test 7] Configuration Management');
    const config = suggestions.getConfig();
    console.error(`  Max Suggestions: ${config.maxSuggestions}`);
    console.error(`  Min Confidence: ${config.minConfidence}`);
    console.error(`  Vector Similarity Weight: ${config.vectorSimilarityWeight}`);
    console.error(`  Common Neighbors Weight: ${config.commonNeighborsWeight}`);
    console.error(`  Inference Weight: ${config.inferenceWeight}`);
    console.error(`  Graph Proximity Weight: ${config.graphProximityWeight}`);
    console.error('');

    // Test 8: Updated Configuration
    console.error('[Test 8] Updated Configuration');
    suggestions.updateConfig({
      maxSuggestions: 3,
      minConfidence: 0.7,
    });
    const updatedConfig = suggestions.getConfig();
    console.error(`  Max Suggestions (updated): ${updatedConfig.maxSuggestions}`);
    console.error(`  Min Confidence (updated): ${updatedConfig.minConfidence}`);
    const updatedSuggestions = await suggestions.suggestConnections('alice-id');
    console.error(`  Suggestions with new config: ${updatedSuggestions.length}`);
    console.error('');

    console.error('[Test] ✅ All tests completed successfully!\n');

  } catch (error) {
    console.error('[Test] ❌ Error during testing:', error);
  } finally {
    await db.close();
    // Clean up
    if (fs.existsSync(DB_PATH)) {
      try {
        fs.unlinkSync(DB_PATH);
      } catch (e) {}
    }
  }
}

// Run tests
runTests().catch(console.error);
