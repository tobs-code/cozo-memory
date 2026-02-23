import { CozoDb } from "cozo-node";
import path from "path";

async function main() {
    const dbPath = path.resolve(__dirname, "..", "memory_db.cozo.db");
    console.log("DB Path:", dbPath);
    
    try {
        const db = new CozoDb("sqlite", dbPath);
        
        const keys = await db.run("?[hash] := *search_cache{query_hash: hash}");
        console.log(`Gefunden ${keys.rows.length} Cache Einträge.`);
        
        if (keys.rows.length > 0) {
            await db.run("?[hash] <- $hashes :delete search_cache {query_hash: hash}", {
                hashes: keys.rows
            });
            console.log("Cache geleert.");
        } else {
            console.log("Cache ist bereits leer.");
        }
        
    } catch (e: any) {
        console.error("Fehler:", e.message);
    }
}

main();
