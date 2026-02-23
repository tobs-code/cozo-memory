
import { CozoDb } from "cozo-node";
import fs from "fs";

async function testTimeFilter() {
    const dbPath = "test-time.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    const db = new CozoDb("sqlite", dbPath);
    const EMBEDDING_DIM = 4;

    try {
        console.log("Creating table with Validity...");
        await db.run(`{:create test_time {id: String, created_at: Validity => type: String, embedding: <F32; ${EMBEDDING_DIM}>}}`);
        await db.run(`{::hnsw create test_time:semantic {dim: ${EMBEDDING_DIM}, m: 16, dtype: F32, fields: [embedding], distance: Cosine, ef_construction: 200}}`);

        const now = Date.now();
        const vec = [0.1, 0.2, 0.3, 0.4];
        
        // CozoDB uses microseconds for timestamps if they are integers? 
        // Or ISO strings? Let's use integers for now.
        // Actually CozoDB Validity often uses integers as unix timestamps in milliseconds or microseconds.
        
        const data = [
            ['old', [now - 10000000, true], 'old_type', vec],
            ['new', [now, true], 'new_type', vec]
        ];
        
        await db.run(`
            ?[id, created_at, type, embedding] <- $data
            :put test_time {id, created_at => type, embedding}
        `, { data });

        console.log("--- Test 1: Validity lower() in body ---");
        try {
            const min_ts = now - 5000000;
            const res = await db.run(`
                ?[id, start_ts] := *test_time{id, created_at, @ "NOW"}, start_ts = lower(created_at), start_ts > $min_ts
            `, { min_ts });
            console.log("Results body filter:", res.rows);
        } catch (e: any) {
            console.error("Error body filter:", e.message || e);
        }

        console.log("--- Test 3: Direct Validity comparison in HNSW filter ---");
        try {
            const min_ts = now - 5000000;
            const res = await db.run(`
                ?[id] := ~test_time:semantic{id, created_at | query: vec($vec), k: 10, ef: 100, filter: created_at > $min_ts}
            `, { vec, min_ts });
            console.log("Results direct HNSW filter:", res.rows);
        } catch (e: any) {
            console.error("Error direct HNSW filter:", e.message || e);
        }

    } catch (e: any) {
        console.error("Global error:", e.message || e);
    } finally {
        // Cleanup
        // db.close(); // Cozo-node doesn't have close()?
    }
}

testTimeFilter();
