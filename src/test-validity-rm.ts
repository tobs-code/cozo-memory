import { CozoDb } from "cozo-node";
import fs from "fs";

async function testValidityRm() {
    const dbPath = "test-validity-rm.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) { }
    }
    const db = new CozoDb("sqlite", dbPath);

    try {
        await db.run(`{:create test_v {id: String, v: Validity => t: String}}`);

        const time1 = 1000;
        const time2 = 2000;
        const time3 = 3000;

        // 1. Insert at time1 (valid from time1 to eternity)
        await db.run(`?[id, v, t] <- [['id1', [${time1}, true], 'typeA']] :put test_v {id, v => t}`);

        console.log("--- Query @ 1500 (expect 1 result) ---");
        let res = await db.run(`?[id, t] := *test_v{id, t} @ ${time1 + 500}`);
        console.log("1500:", res.rows);

        console.log("--- Query @ 2500 (expect 1 result) ---");
        res = await db.run(`?[id, t] := *test_v{id, t} @ ${time2 + 500}`);
        console.log("2500:", res.rows);

        // 2. Invalidate at time2. Will this close the Validity interval?
        // Let's try inserting the exact opposite: :rm
        // But in Cozo, :rm with Validity deletes the record's validity from time2 onwards?
        await db.run(`?[id, v] <- [['id1', [${time2}, true]]] :rm test_v {id, v}`);

        console.log("--- Query @ 1500 after :rm (expect 1 result) ---");
        res = await db.run(`?[id, t] := *test_v{id, t} @ ${time1 + 500}`);
        console.log("1500:", res.rows);

        console.log("--- Query @ 2500 after :rm (expect 0 results) ---");
        res = await db.run(`?[id, t] := *test_v{id, t} @ ${time2 + 500}`);
        console.log("2500:", res.rows);

        // Query everything without time-travel (default to NOW)
        console.log("--- Query NOW (expect 0 results, it is invalidated) ---");
        res = await db.run(`?[id, t] := *test_v{id, t}`);
        console.log("NOW:", res.rows);

    } catch (e: any) {
        console.error("Global error:", e.message || e);
    }
}

testValidityRm();
