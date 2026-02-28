import { MemoryServer } from "./index";
import { v4 as uuidv4 } from "uuid";

async function run() {
    const server = new MemoryServer();
    await server.initPromise;

    console.log("Directly inserting old entity and observations via CozoDB...");

    const fortyDaysAgo = Math.floor(Date.now() - 40 * 24 * 60 * 60 * 1000) * 1000;

    const entityId = uuidv4();
    const name = "Very Old Project";
    const type = "Project";
    const metadata = { purpose: "testing janitor" };
    const zeroVec = new Array(1024).fill(0);

    try {
        await server.db.run(`
      ?[id, name, type, embedding, name_embedding, metadata, created_at] <- [[$id, $name, $type, $embedding, $name_embedding, $metadata, [$fortyDaysAgo, true]]]
      :insert entity {id, name, type, embedding, name_embedding, metadata, created_at}
    `, {
            id: entityId,
            name,
            type,
            embedding: zeroVec,
            name_embedding: zeroVec,
            metadata,
            fortyDaysAgo
        });

        console.log("Old entity inserted: " + entityId);

        const obsTexts = [
            "This is a really old architecture note.",
            "We decided to use subversion for version control.",
            "The server is a physical machine in the basement.",
            "We wrote our own ORM from scratch.",
            "Deployment takes 3 days and a lot of manual steps."
        ];

        for (const text of obsTexts) {
            const obsId = uuidv4();
            await server.db.run(`
        ?[id, entity_id, text, embedding, metadata, created_at] <- [[$id, $entity_id, $text, $embedding, $metadata, [$fortyDaysAgo, true]]]
        :insert observation {id, entity_id, text, embedding, metadata, created_at}
      `, {
                id: obsId,
                entity_id: entityId,
                text,
                embedding: zeroVec,
                metadata: {},
                fortyDaysAgo
            });
            console.log("Old observation inserted: " + obsId);
        }

        console.log("Successfully inserted old data!");
    } catch (e: any) {
        console.error("DB error:", e.message);
    }

    process.exit(0);
}

run().catch(console.error);
