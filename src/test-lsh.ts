
import { MemoryServer } from "./index.js";
import path from "path";
import fs from "fs";

const TEST_DB_PATH = path.join(process.cwd(), "lsh_test_db");

async function runLSHTest() {
    console.log("🚀 Starte LSH (MinHash) Deduplikations-Test...");

    // Cleanup
    if (fs.existsSync(TEST_DB_PATH + ".db")) {
        fs.unlinkSync(TEST_DB_PATH + ".db");
    }

    const server = new MemoryServer(TEST_DB_PATH);
    
    try {
        await server.initPromise; // Sicherstellen, dass Schema fertig ist
        console.log("1. Erstelle Test-Entität...");
        const e1 = await server.createEntity({ name: "LSH Test Projekt", type: "Test", metadata: { version: 1 } }) as any;
        
        console.log("2. Ingestiere ersten Text...");
        await server.ingestFile({
            entity_id: e1.id,
            format: "markdown",
            content: "Das ist ein langer Text über die Entwicklung von künstlicher Intelligenz in der modernen Welt."
        });

        console.log("3. Teste Near-Duplicate (leicht verändert)...");
        // Nur ein Wort geändert: "langen" -> "langer", "KI" -> "künstlicher Intelligenz" etc.
        const res2 = await server.ingestFile({
            entity_id: e1.id,
            format: "markdown",
            content: "Das ist ein langer Text über die Entwicklung von KI in der modernen Welt.",
            deduplicate: true
        }) as any;

        console.log(`Ergebnis 2 (Near-Duplicate): ${res2.observations_added} hinzugefügt, ${res2.observations_skipped_duplicates} übersprungen`);
        if (res2.observations_skipped_duplicates > 0) {
            console.log("✅ LSH hat das Near-Duplicate erfolgreich erkannt.");
        } else {
            console.log("❌ LSH hat das Near-Duplicate NICHT erkannt.");
        }

        console.log("\n4. Teste JSON Update (v0.7 Feature)...");
        const updateRes = await server.updateEntity({
            id: e1.id,
            metadata: { new_field: "updated", version: 2 }
        }) as any;
        console.log("Update Status:", updateRes.status);

        const verifyRes = await server.db.run('?[meta] := *entity{id: $id, metadata: meta, @ "NOW"}', { id: e1.id });
        console.log("Verifizierte Metadaten:", JSON.stringify(verifyRes.rows[0][0]));
        if (verifyRes.rows[0][0].version === 2 && verifyRes.rows[0][0].new_field === "updated") {
            console.log("✅ JSON Merge (++) erfolgreich.");
        } else {
            console.log("❌ JSON Merge (++) fehlgeschlagen.");
        }

    } catch (error) {
        console.error("❌ Test fehlgeschlagen:", error);
        if ((error as any).display) console.error((error as any).display);
    } finally {
        console.log("\n✅ LSH & JSON Test abgeschlossen.");
        process.exit(0);
    }
}

runLSHTest();
