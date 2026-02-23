import { MemoryServer } from './index';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';

async function runFullSystemTest() {
  const dbPath = path.join(process.cwd(), 'full_system_test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  console.log("🚀 Starte Full System Test (v0.8.5)...");
  const server = new MemoryServer(dbPath);
  
  try {
    // 1. Setup & Initialisierung
    console.log("\n--- 1. Setup & Schema ---");
    // MemoryServer initialisiert sich im Constructor (via initPromise)
    await server.initPromise;
    console.log("✅ Schema initialisiert.");

    // 2. Daten Ingest
    console.log("\n--- 2. Data Ingest & Memory Creation ---");
    await server.addObservation({
      entity_name: 'Node.js',
      entity_type: 'Technologie',
      text: 'Node.js verwendet eine Event-gesteuerte, nicht-blockierende I/O-Architektur.',
      metadata: { category: 'performance' }
    });
    console.log("✅ Observation 1 hinzugefügt.");

    // 3. Cache Tests
    console.log("\n--- 3. Cache System (L1, L2, Semantic) ---");
    
    const query1 = "Wie funktioniert die Architektur von Node.js?";
    const query2 = "Wie funktioniert die Architektur von Nodejs?"; // Fast gleich (Semantic Hit)
    
    // Erster Run (Kalt)
    console.log("Query 1 (Kaltstart)...");
    const t1 = performance.now();
    await server.hybridSearch.search({ query: query1, limit: 5 });
    const d1 = performance.now() - t1;
    console.log(`⏱️ Dauer: ${d1.toFixed(2)}ms`);

    // Zweiter Run (L1 Memory Hit)
    console.log("\nQuery 1 (L1 Memory Cache)...");
    const t2 = performance.now();
    await server.hybridSearch.search({ query: query1, limit: 5 });
    const d2 = performance.now() - t2;
    console.log(`⏱️ Dauer: ${d2.toFixed(2)}ms`);
    if (d2 < 5) console.log("✅ SUCCESS: L1 Cache Hit (< 5ms)");

    // Dritter Run (Semantic Hit)
    console.log("\nQuery 2 (Semantic Hit - Ähnliche Query)...");
    const t3 = performance.now();
    await server.hybridSearch.search({ query: query2, limit: 5 });
    const d3 = performance.now() - t3;
    console.log(`⏱️ Dauer: ${d3.toFixed(2)}ms`);
    // Semantic Hit braucht Embedding-Generierung (~100-200ms), aber spart DB-Suche
    if (d3 < 250) console.log("✅ SUCCESS: Semantic Cache Hit (< 250ms)");

    // Vierter Run (L2 Persistent Hit)
    console.log("\nQuery 1 (L2 Persistent Cache nach Memory-Wipe)...");
    (server.hybridSearch as any).searchCache.clear();
    const t4 = performance.now();
    await server.hybridSearch.search({ query: query1, limit: 5 });
    const d4 = performance.now() - t4;
    console.log(`⏱️ Dauer: ${d4.toFixed(2)}ms`);
    if (d4 < 100) console.log("✅ SUCCESS: L2 Cache Hit (< 100ms)");

    // 4. Janitor & Cache TTL
    console.log("\n--- 4. Janitor & Cache TTL ---");
    // Wir simulieren einen alten Cache-Eintrag direkt in der DB
    const oldTs = Math.floor((Date.now() - 10 * 24 * 3600 * 1000) / 1000); // 10 Tage alt
    console.log(`Debug: Simuliere alten Eintrag mit ts=${oldTs} (Datum: ${new Date(oldTs * 1000).toISOString()})`);
    
    await server.db.run(`
      input[query_hash, query_text, results, options, embedding, created_at] <- [[ "old_hash", "old query", [], {}, vec([${new Array(1024).fill(0).join(',')}]), $ts ]]
      ?[query_hash, query_text, results, options, embedding, created_at] := input[query_hash, query_text, results, options, embedding, created_at]
      :put search_cache {query_hash, query_text, results, options, embedding, created_at}
    `, { ts: oldTs });
    
    const countBeforeRes = await server.db.run("?[count(h)] := *search_cache{query_hash: h}");
    const countBefore = Number(countBeforeRes.rows[0][0]);
    console.log(`Einträge vor Cleanup: ${countBefore}`);
    
    // Wir rufen Janitor mit older_than_days: 1 auf.
    const cleanupDays = 1;
    const cutoffDebug = Math.floor((Date.now() - cleanupDays * 24 * 3600 * 1000) / 1000);
    console.log(`Debug: Cleanup cutoff für older_than_days=${cleanupDays} ist ts=${cutoffDebug} (Datum: ${new Date(cutoffDebug * 1000).toISOString()})`);
    
    await server.janitorCleanup({ confirm: true, older_than_days: cleanupDays });
    
    const countAfterRes = await server.db.run("?[count(h)] := *search_cache{query_hash: h}");
    const countAfter = Number(countAfterRes.rows[0][0]);
    console.log(`Einträge nach Cleanup: ${countAfter}`);
    if (countAfter < countBefore) {
      console.log("✅ SUCCESS: Veraltete Cache-Einträge gelöscht.");
    } else {
      console.log("❌ FAILURE: Janitor hat keine Cache-Einträge gelöscht.");
      // Debug-Info
      const debugRes = await server.db.run("?[query_hash, created_at] := *search_cache{query_hash, created_at}");
      console.log("Aktuelle Cache-Einträge (Hash, CreatedAt):", debugRes.rows);
    }

    // 5. Stabilität: Gleichzeitige Anfragen
    console.log("\n--- 5. Concurrency & Stability ---");
    console.log("Führe 3 parallele Suchen aus...");
    const pStart = performance.now();
    await Promise.all([
      server.hybridSearch.search({ query: "Node.js Performance", limit: 3 }),
      server.hybridSearch.search({ query: "Node.js I/O", limit: 3 }),
      server.hybridSearch.search({ query: "Event-Loop", limit: 3 })
    ]);
    console.log(`✅ Parallel-Test abgeschlossen in ${(performance.now() - pStart).toFixed(2)}ms`);

  } catch (error) {
    console.error("\n❌ TEST FAILED:", error);
  } finally {
    // Cleanup
    if (fs.existsSync(dbPath)) {
      try {
        // CozoDB schließt Dateihandles beim Prozess-Ende, aber wir versuchen es sauber
        console.log("\nTest beendet.");
      } catch (e) {}
    }
  }
}

runFullSystemTest();
