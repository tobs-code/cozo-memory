
import { CozoDb } from "cozo-node";
import fs from "fs";

async function testFunctions() {
    const dbPath = "test-funcs.db";
    if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch (e) {}
    }
    const db = new CozoDb("sqlite", dbPath);

    try {
        const res = await db.run(`::functions`);
        console.log("Functions:", res.rows.map((r: any) => r[0]).sort());
    } catch (e: any) {
        console.error("Error:", e.message || e);
    }
}

testFunctions();
