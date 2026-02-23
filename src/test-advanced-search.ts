
import { MemoryServer } from './index';

async function main() {
    // MemoryServer erwartet einen Pfad-String, .db wird automatisch angehängt
    const memory = new MemoryServer('memory_test');

    try {
        // Warten auf Initialisierung
        await memory.initPromise;
        console.log("--- Testdaten hinzufügen ---");

        // 1. Entitäten erstellen
        const alice = await memory.createEntity({
            name: "Alice",
            type: "Person",
            metadata: { role: "Developer", expertise: "TypeScript" }
        });
        const bob = await memory.createEntity({
            name: "Bob",
            type: "Person",
            metadata: { role: "Manager", expertise: "Agile" }
        });
        const projectX = await memory.createEntity({
            name: "Projekt X",
            type: "Projekt",
            metadata: { status: "Aktiv" }
        });

        console.log("Entitäten erstellt:", { alice: alice.id, bob: bob.id, projectX: projectX.id });

        // 2. Beobachtungen hinzufügen (addObservation nutzt 'text')
        await memory.addObservation({
            entity_id: alice.id,
            text: "Alice arbeitet an Projekt X.",
            metadata: { type: "work" }
        });
        await memory.addObservation({
            entity_id: bob.id,
            text: "Bob leitet Projekt X.",
            metadata: { type: "management" }
        });

        console.log("\n--- Suche 1: Einfache Suche nach Alice ---");
        const res1 = await memory.advancedSearch({
            query: "Wer ist Alice?",
            limit: 2
        });
        console.log("Ergebnisse 1:", JSON.stringify(res1, null, 2));

        console.log("\n--- Suche 2: Filter auf Typ 'Person' ---");
        const res2 = await memory.advancedSearch({
            query: "Projektmitarbeiter",
            limit: 5,
            filters: {
                entityTypes: ["Person"]
            }
        });
        console.log("Ergebnisse 2:", JSON.stringify(res2, null, 2));

        console.log("\n--- Suche 3: Filter auf Metadaten ---");
        const res3 = await memory.advancedSearch({
            query: "Entwickler",
            limit: 5,
            filters: {
                metadata: { role: "Developer" }
            }
        });
        console.log("Ergebnisse 3:", JSON.stringify(res3, null, 2));

        console.log("\n--- Suche 4: Graph-Constraints (Relationen) ---");
        // Wir erstellen eine Relation zwischen Alice und Bob
        await memory.createRelation({
            from_id: alice.id!,
            to_id: bob.id!,
            relation_type: "works_with",
            strength: 1.0
        });

        const res4 = await memory.advancedSearch({
            query: "Manager",
            limit: 5,
            graphConstraints: {
                requiredRelations: ["works_with"]
            }
        });
        console.log("Ergebnisse 4:", JSON.stringify(res4, null, 2));

        console.log("\n--- Suche 5: Graph-Constraints (Target IDs) ---");
        const res5 = await memory.advancedSearch({
            query: "Entwickler",
            limit: 5,
            graphConstraints: {
                targetEntityIds: [bob.id!]
            }
        });
        console.log("Ergebnisse 5:", JSON.stringify(res5, null, 2));

    } catch (error) {
        console.error("Fehler im Test:", error);
    }
}

main();
