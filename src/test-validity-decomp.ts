
import { CozoDb } from "cozo-node";
import fs from "fs";

async function testValidityDecomposition() {
    const dbPath = "test-validity-decomp.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    const db = new CozoDb("sqlite", dbPath);

    try {
        await db.run(`{:create test_v {id: String, v: Validity => t: String}}`);
        const now = Date.now();
        const data = [['id1', [now - 1000, true], 'typeA']];
        await db.run(`?[id, v, t] <- $data :put test_v {id, v => t}`, { data });

        console.log("--- Testing v as a list/array ---");
        try {
            // In CozoDB, Validity is often handled via special temporal joins (@)
            // But let's see if we can just treat it as a list if we don't use @
            const res = await db.run(`?[id, v_start] := *test_v{id, v}, [v_start, _] = v`);
            console.log("Decomposition results:", res.rows);
        } catch (e: any) {
            console.log("Decomposition failed:", e.message || e);
        }

    } catch (e: any) {
        console.error("Global error:", e.message || e);
    }
}

testValidityDecomposition();
