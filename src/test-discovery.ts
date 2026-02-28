
import { MemoryServer } from "../src/index";
import path from "path";
import fs from "fs";

async function runTest() {
    const testDbPath = path.resolve(__dirname, "discovery_test.cozo");

    // Cleanup previous test DB
    if (fs.existsSync(testDbPath + ".db")) fs.unlinkSync(testDbPath + ".db");

    const server = new MemoryServer(testDbPath);
    await server.initPromise;

    console.log("1. Creating test entities...");
    const aliceRes = await server.createEntity({
        name: "Alice",
        type: "Person",
        metadata: { role: "Developer" }
    });
    const aliceId = aliceRes.id;

    const phoenixRes = await server.createEntity({
        name: "Project Phoenix",
        type: "Project",
        metadata: { status: "active" }
    });
    const phoenixId = phoenixRes.id;

    console.log("2. Adding overlapping observations...");
    await server.addObservation({
        entity_id: aliceId,
        text: "Alice is currently focusing all her time on Project Phoenix."
    });

    console.log("3. Running reflection in 'discovery' mode...");
    // We specify the model to ensure it uses one that supports JSON mode if possible
    const reflectRes = await server.reflectMemory({
        entity_id: aliceId,
        mode: "discovery"
    });

    console.log("Result:", JSON.stringify(reflectRes, null, 2));

    console.log("4. Verifying relationship creation...");
    const relationsRes = await server.db.run(`
    ?[to_name, rel_type] := *relationship{from_id, to_id, relation_type: rel_type, @ "NOW"},
      from_id = $alice,
      *entity{id: to_id, name: to_name, @ "NOW"}
  `, { alice: aliceId });

    console.log("Relationships from Alice:", relationsRes.rows);

    // Cleanup
    if (fs.existsSync(testDbPath + ".db")) fs.unlinkSync(testDbPath + ".db");
    process.exit(0);
}

runTest().catch(console.error);
