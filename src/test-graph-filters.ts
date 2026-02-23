
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
        // Schema erstellen
        await db.run(`
            {:create entity {id: String, created_at: Validity => name: String, type: String, embedding: <F32; ${EMBEDDING_DIM}>, metadata: Json}}
            {:create relationship {from_id: String, to_id: String, relation_type: String => metadata: Json}}
            {:create search_cache {query_hash: String => results: Json, options: Json, created_at: Int, embedding: <F32; ${EMBEDDING_DIM}>}}
            {:create entity_rank {entity_id: String => pagerank: Float}}
        `);

        // HNSW Index erstellen
        await db.run(`::hnsw create entity:semantic {fields: [embedding], dim: ${EMBEDDING_DIM}, m: 16, ef_construction: 200, distance: Cosine}`);

        // Test-Daten (Büro-Szenario)
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
        // Sollte Alice finden und via Graph Bob (Manager) und Project X finden
        let results = await hybridSearch.graphRag({ query: "Alice", limit: 5 });
        console.log("Found:", results.map(r => `${r.id} (${r.name}, score: ${r.score.toFixed(4)})`));

        console.log("\n--- Testing Graph-RAG: Filter Type 'Project' ---");
        // Sollte nur Project X finden (als Seed oder via Expansion, aber hier als Seed)
        // Wenn wir Alice suchen, aber nur Projects erlauben, wird Alice nicht als Seed gefunden.
        // Wenn Project X Alice ähnlich genug ist, wird es als Seed gefunden.
        results = await hybridSearch.graphRag({ 
            query: "Project", 
            filters: { entityTypes: ['Project'] } 
        });
        console.log("Found:", results.map(r => `${r.id} (${r.name})`));

        console.log("\n--- Testing Graph-RAG: Filter Metadata role='Developer' ---");
        // Alice sollte Seed sein, Bob und Project X via Expansion
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
