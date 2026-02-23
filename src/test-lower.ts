
import { CozoDb } from "cozo-node";
import fs from "fs";

async function testValidityLower() {
    const dbPath = "test-lower.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    const db = new CozoDb("sqlite", dbPath);

    try {
        await db.run(`{:create test_v {id: String, v: Validity => t: String}}`);
        const now = Date.now();
        const data = [['id1', [now - 1000, true], 'typeA']];
        await db.run(`?[id, v, t] <- $data :put test_v {id, v => t}`, { data });

        console.log("--- Test lower(v) without @ ---");
        try {
            const res = await db.run(`?[id, start] := *test_v{id, v}, start = lower(v)`);
            console.log("lower(v) results:", res.rows);
        } catch (e: any) {
            console.error("lower(v) error:", e.message || e);
        }

    } catch (e: any) {
        console.error("Global error:", e.message || e);
    }
}

testValidityLower();
