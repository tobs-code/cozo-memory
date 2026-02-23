
import { CozoDb } from "cozo-node";
import fs from "fs";

async function testIntFilter() {
    const dbPath = "test-int.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    const db = new CozoDb("sqlite", dbPath);
    const EMBEDDING_DIM = 4;

    try {
        console.log("Creating table with Int created_at...");
        await db.run(`{:create test_int {id: String, created_at: Int => type: String, embedding: <F32; ${EMBEDDING_DIM}>}}`);
        await db.run(`{::hnsw create test_int:semantic {dim: ${EMBEDDING_DIM}, m: 16, dtype: F32, fields: [embedding], distance: Cosine, ef_construction: 200}}`);

        const now = Date.now();
        const vec = [0.1, 0.2, 0.3, 0.4];
        
        const data = [
            ['old', now - 10000000, 'old_type', vec],
            ['new', now, 'new_type', vec]
        ];
        
        await db.run(`
            ?[id, created_at, type, embedding] <- $data
            :put test_int {id, created_at => type, embedding}
        `, { data });

        console.log("--- Test: Int filter in HNSW ---");
        try {
            const min_ts = now - 5000000;
            const res = await db.run(`
                ?[id, ca] := ~test_int:semantic{id, created_at | query: vec($vec), k: 10, ef: 100, filter: created_at > $min_ts}, ca = created_at
            `, { vec, min_ts });
            console.log("Results HNSW filter:", res.rows);
        } catch (e: any) {
            console.error("Error HNSW filter:", e.message || e);
        }

    } catch (e: any) {
        console.error("Global error:", e.message || e);
    }
}

testIntFilter();
