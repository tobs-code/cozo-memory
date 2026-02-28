import { MemoryServer } from "./index";

async function run() {
    const server = new MemoryServer();
    await server.initPromise;

    console.log("Testing Agentic Retrieval Routing Logic...");

    // Expose the protected hybridSearch for testing (TypeScript hack)
    const hybridSearch = (server as any).hybridSearch;

    const queries = [
        { text: "Welches Datenbank-System nutzt das Backend Project B?", expected: ["vector_search", "hybrid"] },
        { text: "Wer arbeitet alles mit ReactJS oder was nutzt ReactJS?", expected: ["graph_walk", "hybrid"] },
        { text: "Wie ist der generelle Status aller Frontend-Projekte?", expected: ["community_summary"] }
    ];

    for (const q of queries) {
        console.log(`\n\n--- Query: "${q.text}" ---`);
        console.log(`Expected Route: ${q.expected.join(" or ")}`);

        const results = await hybridSearch.agenticRetrieve({ query: q.text, limit: 1 });

        if (results.length > 0) {
            console.log(`-> LLM Routed to:  ${results[0].metadata?.agentic_routing}`);
        } else {
            console.log(`\nNo results found. LLM might have routed to an empty strategy.`);
        }
    }

    process.exit(0);
}

run().catch(console.error);
