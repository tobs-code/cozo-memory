
import { CozoDb } from "cozo-node";
import fs from "fs";

async function testValidityAccess() {
    const dbPath = "test-validity-access.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    const db = new CozoDb("sqlite", dbPath);

    try {
        await db.run(`{:create test_v {id: String, v: Validity => t: String}}`);
        const now = Date.now();
        const data = [['id1', [now - 1000, true], 'typeA']];
        await db.run(`?[id, v, t] <- $data :put test_v {id, v => t}`, { data });

        console.log("--- Test get(v, 0) ---");
        try {
            const res = await db.run(`?[id, start] := *test_v{id, v}, start = get(v, 0)`);
            console.log("get(v, 0) results:", res.rows);
        } catch (e: any) {
            console.error("get(v, 0) error:", e.message || e);
        }

    } catch (e: any) {
        console.error("Global error:", e.message || e);
    }
}

testValidityAccess();
