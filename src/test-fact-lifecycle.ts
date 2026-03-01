import { MemoryServer } from "./index";
import fs from "fs";

async function testFactLifecycle() {
    console.log("=== Testing Fact Lifecycle Management ===");
    const dbPath = "test-fact-lifecycle"; // .db is added by constructor for sqlite
    if (fs.existsSync(dbPath + ".db")) {
        try { fs.unlinkSync(dbPath + ".db"); } catch (e) { }
    }

    const server = new MemoryServer(dbPath);
    await server.initPromise;

    try {
        // 1. Create an entity
        console.log("\n1. Creating entity...");
        const entityRes = await server.createEntity({ name: "Test Entity", type: "Person", metadata: { age: 30 } });
        const entityId = (entityRes as any).id;
        console.log("Entity ID:", entityId);

        // 2. Add an observation
        console.log("\n2. Adding observation...");
        const obsRes = await server.addObservation({ entity_id: entityId, text: "This is a temporary fact." });
        const obsId = (obsRes as any).id;
        console.log("Observation ID:", obsId);

        // 3. Verify observation exists
        console.log("\n3. Verifying observation exists...");
        let checkObs = await (server as any).db.run(`?[id, text] := *observation{id, text, @ "NOW"}, id = $id`, { id: obsId });
        console.log("Observation found (NOW):", checkObs.rows.length === 1);

        // 4. Invalidate observation
        console.log("\n4. Invalidating observation...");
        const invRes = await server.invalidateObservation({ observation_id: obsId });
        console.log("Invalidation result:", invRes);

        // 5. Verify observation is gone from "NOW"
        console.log("\n5. Verifying observation is gone (NOW)...");
        checkObs = await (server as any).db.run(`?[id, text] := *observation{id, text, @ "NOW"}, id = $id`, { id: obsId });
        console.log("Observation found (NOW) after invalidation:", checkObs.rows.length === 1);

        // 6. Verify observation still exists in history
        console.log("\n6. Verifying observation exists in history...");
        const histObs = await (server as any).db.run(`?[id, text, v] := *observation{id, text, created_at: v}, id = $id`, { id: obsId });
        console.log("History rows:", histObs.rows.length);
        console.log("History data:", JSON.stringify(histObs.rows));

        // 7. Test Relation Invalidation
        console.log("\n7. Testing Relation Invalidation...");
        const entity2Res = await server.createEntity({ name: "Other Entity", type: "Project" });
        const entity2Id = (entity2Res as any).id;

        await server.createRelation({ from_id: entityId, to_id: entity2Id, relation_type: "works_on" });

        console.log("Checking relation exists...");
        let checkRel = await (server as any).db.run(`?[f, t, type] := *relationship{from_id: f, to_id: t, relation_type: type, @ "NOW"}, f = $f, t = $t, type = 'works_on'`, { f: entityId, t: entity2Id });
        console.log("Relation found (NOW):", checkRel.rows.length === 1);

        console.log("Invalidating relation...");
        await server.invalidateRelationship({ from_id: entityId, to_id: entity2Id, relation_type: "works_on" });

        console.log("Checking relation gone (NOW)...");
        checkRel = await (server as any).db.run(`?[f, t, type] := *relationship{from_id: f, to_id: t, relation_type: type, @ "NOW"}, f = $f, t = $t, type = 'works_on'`, { f: entityId, t: entity2Id });
        console.log("Relation found (NOW) after invalidation:", checkRel.rows.length === 1);

        // 8. Test Transaction Invalidation
        console.log("\n8. Testing Transaction Invalidation...");
        const obs2Res = await server.addObservation({ entity_id: entityId, text: "Transaction fact." });
        const obs2Id = (obs2Res as any).id;

        console.log("Invalidating via transaction...");
        const transRes = await server.runTransaction({
            operations: [
                { action: "invalidate_observation", params: { observation_id: obs2Id } }
            ]
        });
        console.log("Transaction result:", JSON.stringify(transRes));

        console.log("Checking transaction observation gone...");
        checkObs = await (server as any).db.run(`?[id, text] := *observation{id, text, @ "NOW"}, id = $id`, { id: obs2Id });
        console.log("Observation found (NOW) after transaction:", checkObs.rows.length === 1);

    } catch (e: any) {
        console.error("Test Error:", e);
    } finally {
        process.exit(0);
    }
}

testFactLifecycle();
