
import { CozoDb } from "cozo-node";
import { HybridSearch } from "./hybrid-search";
import { EmbeddingService } from "./embedding-service";
import fs from "fs";

async function testAdvancedSearchTime() {
    const dbPath = "test-advanced-time.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    const db = new CozoDb("sqlite", dbPath);
    const embeddingService = new EmbeddingService(); // Assuming it works with default or mock

    // Setup schema
    const EMBEDDING_DIM = 1024;
    await db.run(`{:create entity {id: String, created_at: Validity => name: String, type: String, embedding: <F32; ${EMBEDDING_DIM}>, metadata: Json}}`);
    await db.run(`{::hnsw create entity:semantic {dim: ${EMBEDDING_DIM}, m: 16, dtype: F32, fields: [embedding], distance: Cosine, ef_construction: 200}}`);
    await db.run(`{:create entity_rank {entity_id: String => pagerank: Float}}`);

    const hybridSearch = new HybridSearch(db, embeddingService);

    // Insert some data
    const now = Date.now();
    const vec = new Array(EMBEDDING_DIM).fill(0.1);
    const data = [
        ['id1', [now - 10000000, true], 'Old Entity', 'typeA', vec, {}],
        ['id2', [now, true], 'New Entity', 'typeB', vec, {}]
    ];
    await db.run(`?[id, created_at, name, type, embedding, metadata] <- $data :put entity {id, created_at => name, type, embedding, metadata}`, { data });
    await db.run(`?[entity_id, pagerank] <- [['id1', 0.5], ['id2', 0.5]] :put entity_rank {entity_id => pagerank}`);

    console.log("--- Testing Advanced Search with Time Filter ---");
    try {
        const results = await hybridSearch.advancedSearch({
            query: "test",
            timeRangeHours: 1 // Only new entity should match
        });
        console.log("Results:", results.map(r => r.id));
    } catch (e: any) {
        console.error("Advanced Search Error:", e.message || e);
    }
}

testAdvancedSearchTime();
