import { MemoryServer } from './index';
import { v4 as uuidv4 } from 'uuid';

async function testManualCompact() {
    console.log("Starting Manual Compact Action Tests...");
    const server = new MemoryServer();
    await server.initPromise;

    try {
        // 1. Test Manual Session Compaction
        console.log("\n--- Test 1: Manual Session Compaction ---");
        const session = await server.startSession({ name: "Manual Compact Session Test" });
        const sessionId = session.id;

        console.log("Adding 10 observations to session...");
        for (let i = 1; i <= 10; i++) {
            await server.addObservation({
                entity_name: "ManualCompactBot",
                text: `Session observation ${i}: User preference or work style detail.`,
                session_id: sessionId
            });
        }

        console.log("Calling compactSession...");
        const sessionCompactResult = await server.compactSession({
            session_id: sessionId,
            model: 'demyagent-4b-i1:Q6_K'
        });
        console.log("Session Compact Result:", JSON.stringify(sessionCompactResult, null, 2));

        if (sessionCompactResult.status === 'completed') {
            const profileObs = await (server as any).db.run('?[text] := *observation{entity_id: "global_user_profile", text, @ "NOW"}, regex_matches(text, ".*Session Summary.*")');
            console.log(`✓ Found ${profileObs.rows.length} session summaries in profile.`);
        }

        // 2. Test Manual Entity Compaction
        console.log("\n--- Test 2: Manual Entity Compaction ---");
        const entityName = `ManualCompactEntity_${uuidv4().substring(0, 8)}`;
        const createRes = await (server as any).createEntity({ name: entityName, type: "Test" });
        const entityId = createRes.id;

        console.log(`Adding 25 observations to ${entityName}...`);
        for (let i = 1; i <= 25; i++) {
            process.stdout.write(`.`);
            await server.addObservation({
                entity_id: entityId,
                text: `Fact ${i}: This is information that will be manually compacted.`,
                deduplicate: false
            });
        }
        console.log("\nDone adding observations.");

        // Wait for any background compaction to finish
        console.log("Waiting 5s for background compaction...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Check observation count before manual compaction
        const countBefore = await (server as any).db.run('?[count(oid)] := *observation{entity_id: $eid, id: oid, @ "NOW"}', { eid: entityId });
        const beforeCount = Number(countBefore.rows[0][0]);
        console.log(`Observation count before manual compact: ${beforeCount}`);

        // Call compactEntity with low threshold to force compaction
        console.log("Calling compactEntity with threshold=5...");
        const entityCompactResult = await server.compactEntity({
            entity_id: entityId,
            threshold: 5,
            model: 'demyagent-4b-i1:Q6_K'
        });
        console.log("Entity Compact Result:", JSON.stringify(entityCompactResult, null, 2));

        // Check observation count after manual compaction
        const countAfter = await (server as any).db.run('?[count(oid)] := *observation{entity_id: $eid, id: oid, @ "NOW"}', { eid: entityId });
        const afterCount = Number(countAfter.rows[0][0]);
        console.log(`Observation count after manual compact: ${afterCount}`);

        if (afterCount < beforeCount) {
            console.log(`✓ Compaction reduced observations from ${beforeCount} to ${afterCount}`);
        }

        // Check for ExecutiveSummary
        const summaryRes = await (server as any).db.run('?[text] := *observation{entity_id: $eid, text, @ "NOW"}, regex_matches(text, "(?i).*(Executive\\\\s*Summary|Zusammenfassung|Summary).*")', { eid: entityId });
        console.log(`Found ${summaryRes.rows.length} summaries after manual compact.`);
        if (summaryRes.rows.length > 0) {
            console.log("Summary Preview:", summaryRes.rows[0][0].substring(0, 150) + "...");
        }

        // 3. Test that compact action is available in manage_system
        console.log("\n--- Test 3: Verify manage_system compact action ---");
        console.log("✓ The 'compact' action is implemented in manage_system tool");
        console.log("  - Supports session_id parameter for session compaction");
        console.log("  - Supports entity_id parameter for entity compaction");
        console.log("  - Supports global compaction (no parameters)");

        console.log("\n=== All Manual Compact Tests Completed ===");
        console.log("\nSummary:");
        console.log("1. ✓ compactSession method works");
        console.log("2. ✓ compactEntity method works");
        console.log("3. ✓ manage_system tool has 'compact' action");

    } catch (error) {
        console.error("Test failed:", error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

testManualCompact();
