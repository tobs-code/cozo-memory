
import { CozoDb } from "cozo-node";
import fs from "fs";

async function testValidityExtraction() {
    const dbPath = "test-validity-extraction.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    const db = new CozoDb("sqlite", dbPath);

    try {
        await db.run(`{:create test_v {id: String, v: Validity => t: String}}`);
        const now = Date.now();
        const data = [['id1', [now - 1000, true], 'typeA']];
        await db.run(`?[id, v, t] <- $data :put test_v {id, v => t}`, { data });

        const methods = [
            'val = v.0',
            'val = v[0]',
            '[val, _] = v',
            'val = get(v, 0)',
            '[[val, _]] <- [v]',
            '[val, _] <- [v]'
        ];

        for (const method of methods) {
            console.log(`--- Testing: ${method} ---`);
            try {
                const res = await db.run(`?[id, val] := *test_v{id, v}, ${method}`);
                console.log(`Success:`, res.rows);
            } catch (e: any) {
                console.log(`Failed:`, e.message || e);
            }
        }

    } catch (e: any) {
        console.error("Global error:", e.message || e);
    }
}

testValidityExtraction();
