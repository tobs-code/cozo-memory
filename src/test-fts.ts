
import { MemoryServer } from "./index.js";
import path from "path";
import fs from "fs";

const TEST_DB_PATH = path.join(process.cwd(), "fts_test_db");

async function runFTSTest() {
    console.log("🚀 Starte FTS (Full-Text Search) Test...");

    // Cleanup
    if (fs.existsSync(TEST_DB_PATH + ".db")) {
        fs.unlinkSync(TEST_DB_PATH + ".db");
    }

    const server = new MemoryServer(TEST_DB_PATH);
    
    try {
        console.log("Warte auf Schema...");
        await server.initPromise; 
        console.log("--- Schema bereit ---");
        
        console.log("1. Erstelle Test-Daten...");
        const e1 = await server.createEntity({ name: "Berlin Projekt", type: "Stadt", metadata: { priority: "hoch" } }) as any;
        console.log("Entity 1 erstellt:", e1.id || e1.error);
        
        const e2 = await server.createEntity({ name: "Software Entwicklung", type: "Thema", metadata: { category: "IT" } }) as any;
        console.log("Entity 2 erstellt:", e2.id || e2.error);
        
        console.log("Füge Observations hinzu...");
        await server.addObservation({ entity_id: e1.id, text: "Berlin ist die Hauptstadt von Deutschland." });
        await server.addObservation({ entity_id: e2.id, text: "Moderne Software-Entwicklung nutzt oft künstliche Intelligenz." });
        await server.addObservation({ entity_id: e2.id, text: "TypeScript ist eine wichtige Sprache für Web-Entwickler." });
        console.log("Daten erstellt.");

        console.log("\n2. Teste FTS Suche...");
        // Test 1: Exakter Match
        console.log("\n--- Test 1: Suche nach 'Hauptstadt' ---");
        const res1 = await server.hybridSearch.search({ query: "Hauptstadt", limit: 5 });
        console.log(`Gefunden: ${res1.length} Ergebnisse`);
        res1.forEach(r => console.log(` - [${r.source}] ${r.text?.substring(0, 50)}... (Score: ${r.score.toFixed(4)})`));

        // Test 2: Stemming Test ('entwickelt' sollte 'Entwicklung' finden)
        console.log("\n--- Test 2: Stemming Test ('entwickelt' sollte 'Entwicklung' finden) ---");
        const res2 = await server.hybridSearch.search({ query: "entwickelt", limit: 5 });
        console.log(`Gefunden: ${res2.length} Ergebnisse`);
        res2.forEach(r => console.log(` - [${r.source}] ${r.text?.substring(0, 50)}... (Score: ${r.score.toFixed(4)})`));

        // Test 3: Multiple Keywords ('Beta stabil')
        console.log("\n--- Test 3: Multiple Keywords ('Beta stabil') ---");
        const res3 = await server.hybridSearch.search({ query: "Beta stabil", limit: 5 });
        console.log(`Gefunden: ${res3.length} Ergebnisse`);
        res3.forEach(r => console.log(` - [${r.source}] ${r.text?.substring(0, 50)}... (Score: ${r.score.toFixed(4)})`));

        // Test 4: Stopwords ('und die das') - sollte keine irrelevanten Treffer pushen
        console.log("\n--- Test 4: Stopwords Test ('die das') ---");
        const res4 = await server.hybridSearch.search({ query: "die das", limit: 5 });
        console.log(`Gefunden: ${res4.length} Ergebnisse (sollte niedrig sein oder 0, wenn nur Stopwords)`);

    } catch (error) {
        console.error("❌ Test fehlgeschlagen:", error);
        if ((error as any).display) console.error((error as any).display);
    } finally {
        // DB schließen ist bei Cozo-Node automatisch/nicht explizit nötig in diesem Script
        console.log("\n✅ FTS Test abgeschlossen.");
        process.exit(0);
    }
}

runFTSTest();
