import { MemoryServer } from './index';

async function testMultiLevelMemory() {
    console.log("=== Testing Multi-Level Memory (v2.0) ===\n");

    const server = new MemoryServer();
    await server.start();

    try {
        // 1. Session Management
        console.log("--- 1. Testing Session Management ---");
        const sessionRes = await server.startSession({ name: "Research Session", metadata: { user: "test_user" } });
        const sessionId = (sessionRes as any).id;
        console.log(`Started session: ${sessionId}`);

        // 2. Task Management
        console.log("\n--- 2. Testing Task Management ---");
        const taskRes = await server.startTask({ name: "Analyze Multi-Level Memory", session_id: sessionId });
        const taskId = (taskRes as any).id;
        console.log(`Started task: ${taskId}`);

        // 3. Observations with Context
        console.log("\n--- 3. Adding observations with session and task IDs ---");
        await server.addObservation({
            entity_name: "Multi-Level Memory",
            entity_type: "Concept",
            text: "Multi-Level Memory is implemented in v2.0.",
            session_id: sessionId,
            task_id: taskId,
            metadata: { importance: "high" }
        });
        console.log("Added observation for Multi-Level Memory with session and task context.");

        await server.addObservation({
            entity_name: "Janitor",
            entity_type: "Service",
            text: "Janitor now handles session compression.",
            session_id: sessionId,
            metadata: { importance: "medium" }
        });
        console.log("Added observation for Janitor with session context.");

        // 4. Search with Context Boost
        console.log("\n--- 4. Testing Context-Aware Search (Boosting) ---");
        console.log("Case A: Search with session and task boost");
        const searchResA = await server.advancedSearch({
            query: "Multi-Level Memory",
            session_id: sessionId,
            task_id: taskId,
            limit: 5
        });
        console.log("Search results (A):");
        searchResA.forEach((r: any, i: number) => {
            console.log(`  [${i + 1}] Score: ${r.score.toFixed(4)}, Text: ${r.text || r.name}, Explanation: ${r.explanation}`);
        });

        // 5. Session Compression
        console.log("\n--- 5. Testing Session Compression (Janitor) ---");
        console.log("Stopping session to prepare for compression...");
        await server.stopSession({ id: sessionId });

        console.log("Manually aging session activity in session_state table...");
        const oldTs = Date.now() - 40 * 60 * 1000; // 40 minutes ago
        await server['db'].run(
            `?[session_id, last_active, status, metadata] <- [[$id, $ts, 'open', $meta]]
       :put session_state {session_id, last_active, status, metadata}`,
            { id: sessionId, ts: oldTs, meta: { user: "test_user" } }
        );

        console.log("Running Janitor cleanup with confirm=true...");
        const janitorRes = await server.janitorCleanup({ confirm: true });
        console.log("Janitor result:", JSON.stringify(janitorRes, null, 2));

        // 6. Verify Compression Result
        console.log("\n--- 6. Verifying compression summary in User Profile ---");
        const profileRes = await server.advancedSearch({ query: "Session Summary", entityTypes: ["Observation"] });
        console.log("Profile search results:");
        profileRes.forEach((r: any, i: number) => {
            if (r.text?.includes(sessionId)) {
                console.log(`  [MATCH] ${r.text}`);
            }
        });

        console.log("\n=== Multi-Level Memory Test completed successfully ===");

    } catch (error) {
        console.error("Test failed:", error);
    } finally {
        process.exit(0);
    }
}

testMultiLevelMemory();
