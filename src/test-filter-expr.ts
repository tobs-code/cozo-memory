
import { CozoDb } from "cozo-node";
import fs from "fs";

async function testFilterExpr() {
    const dbPath = "test-filter.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    const db = new CozoDb("sqlite", dbPath);
    const EMBEDDING_DIM = 1536;

    try {
        console.log("Creating table (type as PK)...");
        await db.run(`{:create test_entity {id: String, type: String => metadata: Json, embedding: <F32; ${EMBEDDING_DIM}>}}`);
        console.log("Creating HNSW index...");
        await db.run(`{::hnsw create test_entity:semantic {dim: ${EMBEDDING_DIM}, m: 16, dtype: F32, fields: [embedding], distance: Cosine, ef_construction: 200}}`);

        const vec1 = new Array(EMBEDDING_DIM).fill(0.1);
        const vec2 = new Array(EMBEDDING_DIM).fill(0.9);

        console.log("Inserting data...");
        const data = [
            ['id1', 'typeA', {status: 'active'}, vec1],
            ['id2', 'typeB', {status: 'inactive'}, vec2]
        ];
        
        await db.run(`
            ?[id, type, metadata, embedding] <- $data
            :put test_entity {id, type => metadata, embedding}
        `, { data });
        console.log("Data inserted.");

        console.log("--- Test: Filter with type (requesting it) ---");
        try {
            const res = await db.run(`
                ?[id, type] := ~test_entity:semantic{id, type | query: vec($vec1), k: 2, ef: 100, filter: type == 'typeA'}
            `, { vec1 });
            console.log("Results (type == 'typeA'):", res.rows);
        } catch (e: any) {
            console.error("Error (type == 'typeA'):", e.message || e);
        }

        console.log("--- Test: Filter with parameter (type in output) ---");
        try {
            const res = await db.run(`
                ?[id, type] := ~test_entity:semantic{id, type | query: vec($vec1), k: 2, ef: 100, filter: type == $allowed_type}
            `, { vec1, allowed_type: 'typeA' });
            console.log("Results (type == $allowed_type):", res.rows);
        } catch (e: any) {
            console.error("Error (type == $allowed_type):", e.message || e);
        }

        console.log("Creating table (with Validity)...");
        // Recreate with Validity to match actual schema
        await db.run(`{:create test_entity_v {id: String, created_at: Validity => type: String, metadata: Json, embedding: <F32; ${EMBEDDING_DIM}>}}`);
        await db.run(`{::hnsw create test_entity_v:semantic {dim: ${EMBEDDING_DIM}, m: 16, dtype: F32, fields: [embedding], distance: Cosine, ef_construction: 200}}`);

        const now = Date.now();
        const dataV = [
            ['id1', [now - 1000000, true], 'typeA', {status: 'active'}, vec1],
            ['id2', [now, true], 'typeB', {status: 'inactive'}, vec2]
        ];
        
        await db.run(`
            ?[id, created_at, type, metadata, embedding] <- $dataV
            :put test_entity_v {id, created_at => type, metadata, embedding}
        `, { dataV });

        console.log("--- Test: Filter with is_in ---");
        try {
            const allowed_types = ['typeA', 'typeC'];
            const res = await db.run(`
                ?[id, type] := ~test_entity_v:semantic{id, type | query: vec($vec1), k: 2, ef: 100, filter: is_in(type, $allowed_types)}
            `, { vec1, allowed_types });
            console.log("Results (is_in(type, ...)):", res.rows);
        } catch (e: any) {
            console.error("Error (is_in):", e.message || e);
        }

    } catch (e: any) {
        console.error("Global error:", e.message || e);
    }
}

testFilterExpr().then(() => console.log("Done."));
