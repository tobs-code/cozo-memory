
import { MemoryServer } from "./index.js";
import path from "path";
import fs from "fs";

const TEST_DB_PATH = path.join(process.cwd(), "lsh_test_db");

async function runLSHTest() {
    console.log("🚀 Starting LSH (MinHash) Deduplication Test...");

    // Cleanup
    if (fs.existsSync(TEST_DB_PATH + ".db")) {
        fs.unlinkSync(TEST_DB_PATH + ".db");
    }

    const server = new MemoryServer(TEST_DB_PATH);
    
    try {
        await server.initPromise; // Ensure schema is ready
        console.log("1. Creating Test Entity...");
        const e1 = await server.createEntity({ name: "LSH Test Project", type: "Test", metadata: { version: 1 } }) as any;
        
        console.log("2. Ingesting first text...");
        await server.ingestFile({
            entity_id: e1.id,
            format: "markdown",
            content: "This is a very long text about the development of artificial intelligence in the modern world."
        });

        console.log("3. Testing Near-Duplicate (slightly modified)...");
        // Just one word changed or slightly modified
        const res2 = await server.ingestFile({
            entity_id: e1.id,
            format: "markdown",
            content: "This is a very long text about the development of AI in the modern world.",
            deduplicate: true
        }) as any;

        console.log(`Result 2 (Near-Duplicate): ${res2.observations_added} added, ${res2.observations_skipped_duplicates} skipped`);
        if (res2.observations_skipped_duplicates > 0) {
            console.log("✅ LSH successfully detected the near-duplicate.");
        } else {
            console.log("❌ LSH did NOT detect the near-duplicate.");
        }

        console.log("\n4. Testing JSON Update (v0.7 Feature)...");
        const updateRes = await server.updateEntity({
            id: e1.id,
            metadata: { new_field: "updated", version: 2 }
        }) as any;
        console.log("Update Status:", updateRes.status);

        const verifyRes = await server.db.run('?[meta] := *entity{id: $id, metadata: meta, @ "NOW"}', { id: e1.id });
        console.log("Verified Metadata:", JSON.stringify(verifyRes.rows[0][0]));
        if (verifyRes.rows[0][0].version === 2 && verifyRes.rows[0][0].new_field === "updated") {
            console.log("✅ JSON Merge (++) successful.");
        } else {
            console.log("❌ JSON Merge (++) failed.");
        }

    } catch (error) {
        console.error("❌ Test failed:", error);
        if ((error as any).display) console.error((error as any).display);
    } finally {
        console.log("\n✅ LSH & JSON Test completed.");
        process.exit(0);
    }
}

runLSHTest();
