
import { CozoDb } from "cozo-node";
import fs from "fs";

async function testValidity() {
    const dbPath = "test-validity.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    const db = new CozoDb("sqlite", dbPath);
    const EMBEDDING_DIM = 4;

    try {
        console.log("Creating table with Validity...");
        await db.run(`{:create test_v {id: String, v: Validity => t: String}}`);

        const now = Date.now();
        const data = [
            ['id1', [now - 1000, true], 'typeA'],
            ['id2', [now, true], 'typeB']
        ];
        
        await db.run(`
            ?[id, v, t] <- $data
            :put test_v {id, v => t}
        `, { data });

        console.log("--- Querying Validity directly ---");
        const res = await db.run(`?[id, v] := *test_v{id, v}`);
        console.log("Raw results:", JSON.stringify(res.rows));

    } catch (e: any) {
        console.error("Global error:", e.message || e);
    }
}

testValidity();
