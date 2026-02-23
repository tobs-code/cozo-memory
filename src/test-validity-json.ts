
import { CozoDb } from "cozo-node";
import fs from "fs";

async function testValidityToJson() {
    const dbPath = "test-validity-json.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    const db = new CozoDb("sqlite", dbPath);

    try {
        await db.run(`{:create test_v {id: String, v: Validity => t: String}}`);
        const now = Date.now();
        const data = [['id1', [now - 1000, true], 'typeA']];
        await db.run(`?[id, v, t] <- $data :put test_v {id, v => t}`, { data });

        console.log("--- Testing: start = get(to_json(v), 0) ---");
        try {
            const res = await db.run(`?[id, val] := *test_v{id, v}, val = get(to_json(v), 0)`);
            console.log(`Success:`, res.rows);
        } catch (e: any) {
            console.log(`Failed:`, e.message || e);
        }

    } catch (e: any) {
        console.error("Global error:", e.message || e);
    }
}

testValidityToJson();
