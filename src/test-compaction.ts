import { MemoryServer } from './index';
import { v4 as uuidv4 } from 'uuid';

async function testCompaction() {
    console.log("Starting Context Compaction Tests...");
    const server = new MemoryServer();
    await server.initPromise;

    try {
        // 1. Test Session Compaction
        console.log("\n--- Testing Session Compaction ---");
        const session = await server.startSession({ name: "Compaction Test Session" });
        const sessionId = session.id;

        console.log("Adding observations to session...");
        await server.addObservation({
            entity_name: "CompactionBot",
            text: "Users prefers dark mode for all interfaces.",
            session_id: sessionId
        });
        await server.addObservation({
            entity_name: "CompactionBot",
            text: "User is a senior software engineer specialized in TypeScript.",
            session_id: sessionId
        });
        await server.addObservation({
            entity_name: "CompactionBot",
            text: "User likes concise documentation with many examples.",
            session_id: sessionId
        });

        console.log("Stopping session (should trigger compaction)...");
        const stopResult = await server.stopSession({ id: sessionId });
        console.log("Stop Result:", JSON.stringify(stopResult, null, 2));

        // Check if summary exists in global_user_profile
        const profileObs = await (server as any).db.run('?[text] := *observation{entity_id: "global_user_profile", text, metadata, @ "NOW"}, regex_matches(text, ".*Session Summary.*")');
        console.log(`Found ${profileObs.rows.length} session summaries in profile.`);
        if (profileObs.rows.length > 0) {
            console.log("Latest Summary:", profileObs.rows[0][0]);
        }

        // 2. Test Entity Compaction (Threshold-based)
        console.log("\n--- Testing Entity Compaction ---");
        const entityName = `HeavyEntity_${uuidv4().substring(0, 8)}`;
        const createRes = await (server as any).createEntity({ name: entityName, type: "Test" });
        const entityId = createRes.id;

        console.log(`Adding 25 observations to ${entityName} (Threshold is 20)...`);
        for (let i = 1; i <= 25; i++) {
            process.stdout.write(`.`);
            await server.addObservation({
                entity_id: entityId,
                text: `Fact number ${i}: This is a piece of information about the heavy entity that needs to be compacted eventually.`,
                deduplicate: false
            });
        }
        console.log("\nDone adding observations.");

        // The last few should have triggered compaction in background
        console.log("Waiting for background compaction (30s for Ollama)...");
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Check observation count
        const countRes = await (server as any).db.run('?[count(oid)] := *observation{entity_id: $eid, id: oid, @ "NOW"}', { eid: entityId });
        const finalCount = Number(countRes.rows[0][0]);
        console.log(`Final observation count for ${entityName}: ${finalCount}`);

        // Check for ExecutiveSummary
        // Check for ExecutiveSummary (Ollama might use bold, lowercase, or slightly different labels)
        const summaryRes = await (server as any).db.run('?[text] := *observation{entity_id: $eid, text, @ "NOW"}, regex_matches(text, "(?i).*(Executive\\\\s*Summary|Zusammenfassung|ExecutiveSummary).*")', { eid: entityId });
        console.log(`Found ${summaryRes.rows.length} ExecutiveSummaries.`);
        if (summaryRes.rows.length > 0) {
            console.log("Executive Summary Content Preview:", summaryRes.rows[0][0].substring(0, 100) + "...");
        } else if (finalCount > 0) {
            // Debug: Print what we actually have
            const allObs = await (server as any).db.run('?[text] := *observation{entity_id: $eid, text, @ "NOW"}', { eid: entityId });
            console.log("Actual observations found for entity:");
            allObs.rows.forEach((row: any, i: number) => {
                console.log(`[${i}] ${row[0].substring(0, 200)}...`);
            });
        }

        // 3. Test Manual Compaction via direct call (bypass MCP wrapper for test)
        console.log("\n--- Testing Manual Compaction ---");
        const manageResult = await (server as any).compactEntity({
            entity_id: entityId,
            threshold: 2 // force compaction on remaining context
        });
        console.log("Manual Compact Result:", JSON.stringify(manageResult, null, 2));

    } catch (error) {
        console.error("Test failed:", error);
    } finally {
        process.exit(0);
    }
}

testCompaction();
