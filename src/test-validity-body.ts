
import { CozoDb } from "cozo-node";
import fs from "fs";

async function testValidityBody() {
    const dbPath = "test-validity-body.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    const db = new CozoDb("sqlite", dbPath);

    try {
        await db.run(`{:create test_v {id: String, created_at: Validity => t: String}}`);
        const now = Date.now();
        const data = [['id1', [now - 1000, true], 'typeA']];
        await db.run(`?[id, created_at, t] <- $data :put test_v {id, created_at => t}`, { data });

        console.log("--- Querying with Validity in body ---");
        try {
            const res = await db.run(`?[id] := *test_v{id, created_at: c}, c <- [[ts, _]], ts > 0`);
            console.log("c <- [[ts, _]] results:", res.rows);
        } catch (e: any) {
            console.log("c <- [[ts, _]] failed:", e.message || e);
        }

        try {
            const res = await db.run(`?[id] := *test_v{id, created_at: c}, [ts, _] = c, ts > 0`);
            console.log("Explicit decomposition results:", res.rows);
        } catch (e: any) {
            console.log("Explicit decomposition failed:", e.message || e);
        }

    } catch (e: any) {
        console.error("Global error:", e.message || e);
    }
}

testValidityBody();
