
import { CozoDb } from "cozo-node";
import fs from "fs";

async function testTimeFunctions() {
    const dbPath = "test-time-funcs.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    const db = new CozoDb("sqlite", dbPath);

    try {
        await db.run(`{:create test_v {id: String, v: Validity => t: String}}`);
        const now = Date.now();
        const data = [['id1', [now - 1000, true], 'typeA']];
        await db.run(`?[id, v, t] <- $data :put test_v {id, v => t}`, { data });

        const functionsToTest = ['valid_from', 'start', 'beginning', 'lower_bound'];

        for (const fn of functionsToTest) {
            console.log(`--- Testing ${fn}(v) ---`);
            try {
                const res = await db.run(`?[id, val] := *test_v{id, v}, val = ${fn}(v)`);
                console.log(`${fn}(v) success:`, res.rows);
            } catch (e: any) {
                console.log(`${fn}(v) failed:`, e.message || e);
            }
        }

    } catch (e: any) {
        console.error("Global error:", e.message || e);
    }
}

testTimeFunctions();
