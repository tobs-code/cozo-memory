import { CozoDb } from "cozo-node";
import * as fs from "fs";

/**
 * Comprehensive Delete Test
 * Tests the delete functionality with Validity tracking
 */
async function testDeleteComprehensive() {
    const dbPath = "test_delete_comprehensive.db";
    
    // Clean up
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    
    const db = new CozoDb("sqlite", dbPath);
    const EMBEDDING_DIM = 4;
    
    try {
        console.log("=== Comprehensive Delete Test ===\n");
        
        // 1. Setup Schema
        console.log("1. Setting up schema...");
        await db.run(`{:create entity {id: String, created_at: Validity => name: String, type: String, embedding: <F32; ${EMBEDDING_DIM}>, metadata: Json}}`);
        await db.run(`{:create observation {id: String, created_at: Validity => entity_id: String, text: String, metadata: Json}}`);
        await db.run(`{:create relationship {from_id: String, to_id: String, relation_type: String, created_at: Validity => strength: Float, metadata: Json}}`);
        console.log("✓ Schema created\n");
        
        // 2. Create Test Data
        console.log("2. Creating test entities...");
        const now = Date.now();
        await db.run(`
            ?[id, created_at, name, type, embedding, metadata] <-
            [['entity1', [${now}, true], 'Test Entity 1', 'test', [0.1, 0.2, 0.3, 0.4], {}],
             ['entity2', [${now}, true], 'Test Entity 2', 'test', [0.5, 0.6, 0.7, 0.8], {}]]
            :put entity {id: String, created_at: Validity => name: String, type: String, embedding: <F32; ${EMBEDDING_DIM}>, metadata: Json}
        `);
        
        await db.run(`
            ?[id, created_at, entity_id, text, metadata] <-
            [['obs1', [${now}, true], 'entity1', 'Observation 1', {}],
             ['obs2', [${now}, true], 'entity1', 'Observation 2', {}]]
            :put observation {id: String, created_at: Validity => entity_id: String, text: String, metadata: Json}
        `);
        
        await db.run(`
            ?[from_id, to_id, relation_type, created_at, strength, metadata] <-
            [['entity1', 'entity2', 'related_to', [${now}, true], 1.0, {}]]
            :put relationship {from_id: String, to_id: String, relation_type: String, created_at: Validity => strength: Float, metadata: Json}
        `);
        console.log("✓ Test data created\n");
        
        // 3. Verify Data Exists
        console.log("3. Verifying data exists...");
        const beforeEntity = await db.run('?[id, name] := *entity{id, name, @ "NOW"}');
        const beforeObs = await db.run('?[id, text] := *observation{id, text, @ "NOW"}');
        const beforeRel = await db.run('?[from_id, to_id] := *relationship{from_id, to_id, @ "NOW"}');
        
        console.log(`  Entities: ${beforeEntity.rows.length}`);
        console.log(`  Observations: ${beforeObs.rows.length}`);
        console.log(`  Relationships: ${beforeRel.rows.length}\n`);
        
        // 4. Delete Entity1 using :rm
        console.log("4. Deleting entity1 using :rm...");
        await db.run(`
            { ?[id, created_at] := *observation{id, entity_id, created_at}, entity_id = 'entity1' :rm observation {id, created_at} }
            { ?[from_id, to_id, relation_type, created_at] := *relationship{from_id, to_id, relation_type, created_at}, from_id = 'entity1' :rm relationship {from_id, to_id, relation_type, created_at} }
            { ?[from_id, to_id, relation_type, created_at] := *relationship{from_id, to_id, relation_type, created_at}, to_id = 'entity1' :rm relationship {from_id, to_id, relation_type, created_at} }
            { ?[id, created_at] := *entity{id, created_at}, id = 'entity1' :rm entity {id, created_at} }
        `);
        console.log("✓ Delete command executed\n");
        
        // 5. Verify Data After Delete with @ "NOW"
        console.log("5. Verifying data after delete (@ \"NOW\")...");
        const afterEntity = await db.run('?[id, name] := *entity{id, name, @ "NOW"}');
        const afterObs = await db.run('?[id, text] := *observation{id, text, @ "NOW"}');
        const afterRel = await db.run('?[from_id, to_id] := *relationship{from_id, to_id, @ "NOW"}');
        
        console.log(`  Entities: ${afterEntity.rows.length} (expected: 1)`);
        console.log(`  Observations: ${afterObs.rows.length} (expected: 0)`);
        console.log(`  Relationships: ${afterRel.rows.length} (expected: 0)\n`);
        
        // 6. Check if entity1 is still accessible without @ "NOW"
        console.log("6. Checking historical data (without @ \"NOW\")...");
        const historicalEntity = await db.run('?[id, name, created_at] := *entity{id, name, created_at}');
        console.log(`  Historical entities: ${historicalEntity.rows.length}`);
        historicalEntity.rows.forEach((row: any) => {
            console.log(`    - ${row[0]}: ${row[1]}, created_at: ${row[2]}`);
        });
        console.log();
        
        // 7. Try to query entity1 specifically with @ "NOW"
        console.log("7. Querying entity1 specifically with @ \"NOW\"...");
        const entity1Now = await db.run('?[id, name] := *entity{id, name, @ "NOW"}, id = "entity1"');
        console.log(`  Result: ${entity1Now.rows.length} rows (expected: 0)`);
        if (entity1Now.rows.length > 0) {
            console.log("  ❌ FAIL: Entity1 is still visible with @ \"NOW\"!");
        } else {
            console.log("  ✓ PASS: Entity1 is not visible with @ \"NOW\"");
        }
        console.log();
        
        // 8. Check Validity timestamps
        console.log("8. Checking Validity timestamps...");
        const validityCheck = await db.run('?[id, created_at] := *entity{id, created_at}');
        console.log(`  Validity entries: ${validityCheck.rows.length}`);
        validityCheck.rows.forEach((row: any) => {
            const id = row[0];
            const validity = row[1];
            console.log(`    - ${id}: ${JSON.stringify(validity)}`);
        });
        console.log();
        
        // 9. Summary
        console.log("=== Test Summary ===");
        const passed = afterEntity.rows.length === 1 && 
                      afterObs.rows.length === 0 && 
                      afterRel.rows.length === 0 &&
                      entity1Now.rows.length === 0;
        
        if (passed) {
            console.log("✓ ALL TESTS PASSED");
            console.log("Delete functionality works correctly with Validity tracking.");
        } else {
            console.log("❌ TESTS FAILED");
            console.log("Delete functionality has issues:");
            if (afterEntity.rows.length !== 1) console.log("  - Wrong number of entities remaining");
            if (afterObs.rows.length !== 0) console.log("  - Observations not deleted");
            if (afterRel.rows.length !== 0) console.log("  - Relationships not deleted");
            if (entity1Now.rows.length !== 0) console.log("  - Entity still visible with @ \"NOW\"");
        }
        
    } catch (error: any) {
        console.error("Error during test:", error.message);
        console.error(error);
    } finally {
        db.close();
        // Cleanup
        if (fs.existsSync(dbPath)) {
            try { fs.unlinkSync(dbPath); } catch (e) {}
        }
    }
}

testDeleteComprehensive();
