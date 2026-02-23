
import { CozoDb } from "cozo-node";
import { HybridSearch } from "./hybrid-search";
import { EmbeddingService } from "./embedding-service";
import fs from "fs";

async function testAdvancedSearchFilters() {
    const dbPath = "test-advanced-filters.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    const db = new CozoDb("sqlite", dbPath);
    const embeddingService = new EmbeddingService();

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
        ['id1', [now, true], 'Alice', 'Person', vec, { role: 'Developer', level: 5 }],
        ['id2', [now, true], 'Bob', 'Person', vec, { role: 'Manager', level: 8 }],
        ['id3', [now, true], 'Project X', 'Project', vec, { status: 'active' }]
    ];
    await db.run(`?[id, created_at, name, type, embedding, metadata] <- $data :put entity {id, created_at => name, type, embedding, metadata}`, { data });
    await db.run(`?[entity_id, pagerank] <- [['id1', 0.5], ['id2', 0.5], ['id3', 0.5]] :put entity_rank {entity_id => pagerank}`);

    console.log("--- Testing Filter: Entity Type 'Person' ---");
    const res1 = await hybridSearch.advancedSearch({
        query: "test",
        filters: { entityTypes: ["Person"] }
    });
    console.log("Results 1 (Person):", res1.map(r => r.id));

    console.log("\n--- Testing Filter: Metadata role='Manager' ---");
    const res2 = await hybridSearch.advancedSearch({
        query: "test",
        filters: { metadata: { role: "Manager" } }
    });
    console.log("Results 2 (Manager):", res2.map(r => r.id));

    console.log("\n--- Testing Filter: Metadata level=5 ---");
    const res3 = await hybridSearch.advancedSearch({
        query: "test",
        filters: { metadata: { level: 5 } }
    });
    console.log("Results 3 (Level 5):", res3.map(r => r.id));

    console.log("\n--- Testing Multi-Filter: Type 'Person' + role='Developer' ---");
    const res4 = await hybridSearch.advancedSearch({
        query: "test",
        filters: { 
            entityTypes: ["Person"],
            metadata: { role: "Developer" }
        }
    });
    console.log("Results 4 (Dev Person):", res4.map(r => r.id));
}

testAdvancedSearchFilters();
