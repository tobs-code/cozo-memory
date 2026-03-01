import { CozoDb } from "cozo-node";
import fs from "fs";

async function testValidityRetract() {
    const dbPath = "test-validity-retract.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) { }
    }
    const db = new CozoDb("sqlite", dbPath);

    try {
        await db.run(`{:create test_v {id: String, v: Validity => t: String}}`);

        const time1 = 1000;
        const time2 = 2000;

        // 1. Assert at time1 (valid from time1)
        await db.run(`?[id, v, t] <- [['id1', [${time1}, true], 'typeA']] :put test_v {id, v => t}`);

        console.log("--- Query @ 1500 (expect 1) ---");
        let res = await db.run(`?[id, t] := *test_v{id, t, @ ${time1 + 500}}`);
        console.log("1500:", res.rows);

        // 2. Retract at time2 (insert row with assertive=false)
        await db.run(`?[id, v, t] <- [['id1', [${time2}, false], 'typeA']] :put test_v {id, v => t}`);

        console.log("--- Query @ 1500 after retract (expect 1) ---");
        res = await db.run(`?[id, t] := *test_v{id, t, @ ${time1 + 500}}`);
        console.log("1500:", res.rows);

        console.log("--- Query @ 2500 after retract (expect 0) ---");
        res = await db.run(`?[id, t] := *test_v{id, t, @ ${time2 + 500}}`);
        console.log("2500:", res.rows);

        console.log("--- Query NOW (expect 0) ---");
        res = await db.run(`?[id, t] := *test_v{id, t, @ "NOW"}`);
        console.log("NOW:", res.rows);

        console.log("--- Raw table contents ---");
        res = await db.run(`?[id, v, t] := *test_v{id, v, t}`);
        console.log("Raw:", JSON.stringify(res.rows));

    } catch (e: any) {
        console.error("Global error:", e.message || e);
    }
}

testValidityRetract();
