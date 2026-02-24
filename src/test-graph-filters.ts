
import { CozoDb } from "cozo-node";
import { HybridSearch } from "./hybrid-search";
import { EmbeddingService } from "./embedding-service";
import fs from "fs";

async function testGraphRagFilters() {
    const dbPath = "test-graph-filters.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    const db = new CozoDb("sqlite", dbPath);
    const embeddingService = new EmbeddingService();
    const hybridSearch = new HybridSearch(db, embeddingService);

    try {
        const EMBEDDING_DIM = 1024;
        // Create schema
        await db.run(`
            {:create entity {id: String, created_at: Validity => name: String, type: String, embedding: <F32; ${EMBEDDING_DIM}>, metadata: Json}}
            {:create relationship {from_id: String, to_id: String, relation_type: String => metadata: Json}}
            {:create search_cache {query_hash: String => results: Json, options: Json, created_at: Int, embedding: <F32; ${EMBEDDING_DIM}>}}
            {:create entity_rank {entity_id: String => pagerank: Float}}
        `);

        // Create HNSW index
        await db.run(`::hnsw create entity:semantic {fields: [embedding], dim: ${EMBEDDING_DIM}, m: 16, ef_construction: 200, distance: Cosine}`);

        // Test data (Office scenario)
        // id1: Person (Developer), id2: Person (Manager), id3: Project (AI)
        // id1 -> id3 (works_on), id2 -> id1 (manages)
        const now = Date.now();
        const vec1 = new Array(EMBEDDING_DIM).fill(0).map((_, i) => i === 0 ? 1 : 0);
        const vec2 = new Array(EMBEDDING_DIM).fill(0).map((_, i) => i === 1 ? 1 : 0);
        const vec3 = new Array(EMBEDDING_DIM).fill(0).map((_, i) => i === 2 ? 1 : 0);

        console.log("Inserting entities...");
        await db.run(`
            ?[id, created_at, name, type, embedding, metadata] <- [
                ['id1', 'ASSERT', 'Alice', 'Person', $v1, $m1],
                ['id2', 'ASSERT', 'Bob', 'Person', $v2, $m2],
                ['id3', 'ASSERT', 'Project X', 'Project', $v3, $m3]
            ]
            :put entity {id, created_at => name, type, embedding, metadata}
        `, { 
            v1: vec1, v2: vec2, v3: vec3,
            m1: {role: 'Developer'},
            m2: {role: 'Manager'},
            m3: {status: 'active'}
        });
        console.log("Entities inserted.");

        console.log("Inserting relationships...");
        await db.run(`
            ?[from_id, to_id, relation_type, metadata] <- [
                ['id2', 'id1', 'manages', {}],
                ['id1', 'id3', 'works_on', {}]
            ]
            :put relationship {from_id, to_id, relation_type => metadata}
        `);
        console.log("Relationships inserted.");

        console.log("\n--- Testing Graph-RAG: No Filters (Query 'Alice') ---");
        // Should find Alice and via graph Bob (Manager) and Project X
        let results = await hybridSearch.graphRag({ query: "Alice", limit: 5 });
        console.log("Found:", results.map(r => `${r.id} (${r.name}, score: ${r.score.toFixed(4)})`));

        console.log("\n--- Testing Graph-RAG: Filter Type 'Project' ---");
        // Should only find Project X (as seed or via expansion, but here as seed)
        // If we search for Alice but only allow Projects, Alice will not be found as seed.
        // If Project X is similar enough to Alice, it will be found as seed.
        results = await hybridSearch.graphRag({ 
            query: "Project", 
            filters: { entityTypes: ['Project'] } 
        });
        console.log("Found:", results.map(r => `${r.id} (${r.name})`));

        console.log("\n--- Testing Graph-RAG: Filter Metadata role='Developer' ---");
        // Alice should be seed, Bob and Project X via expansion
        results = await hybridSearch.graphRag({ 
            query: "Alice", 
            filters: { metadata: { role: 'Developer' } } 
        });
        console.log("Found:", results.map(r => `${r.id} (${r.name})`));

    } catch (e: any) {
        console.error("Test failed:", e.message || e);
    }
}

testGraphRagFilters();
