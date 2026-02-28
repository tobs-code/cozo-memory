import { MemoryServer } from "./index";
import { v4 as uuidv4 } from "uuid";

async function run() {
    const server = new MemoryServer();
    await server.initPromise;

    console.log("Setting up Test Clusters for GraphRAG Community Summaries...");

    // Cluster 1: Frontend
    const fe1 = await server.createEntity({ name: "ReactJS", type: "technology", metadata: {} });
    const fe2 = await server.createEntity({ name: "Redux", type: "technology", metadata: {} });
    const fe3 = await server.createEntity({ name: "Frontend Project A", type: "project", metadata: {} });

    await server.addObservation({ entity_id: (fe1 as any).id, text: "ReactJS is used for building UIs." });
    await server.addObservation({ entity_id: (fe2 as any).id, text: "Redux is used for state management in React." });
    await server.addObservation({ entity_id: (fe3 as any).id, text: "Project A is a heavy frontend SPA using React and Redux." });

    await server.createRelation({ from_id: (fe3 as any).id, to_id: (fe1 as any).id, relation_type: "uses", strength: 1.0 });
    await server.createRelation({ from_id: (fe3 as any).id, to_id: (fe2 as any).id, relation_type: "uses", strength: 1.0 });
    await server.createRelation({ from_id: (fe1 as any).id, to_id: (fe2 as any).id, relation_type: "integrates_with", strength: 1.0 });

    console.log("Created Frontend Cluster");

    // Cluster 2: Backend
    const be1 = await server.createEntity({ name: "PostgreSQL", type: "database", metadata: {} });
    const be2 = await server.createEntity({ name: "CozoDB", type: "database", metadata: {} });
    const be3 = await server.createEntity({ name: "Backend Project B", type: "project", metadata: {} });

    await server.addObservation({ entity_id: (be1 as any).id, text: "PostgreSQL is a robust relational database." });
    await server.addObservation({ entity_id: (be2 as any).id, text: "CozoDB is a graph database with Datalog." });
    await server.addObservation({ entity_id: (be3 as any).id, text: "Project B relies heavily on complex queries across PG and CozoDB." });

    await server.createRelation({ from_id: (be3 as any).id, to_id: (be1 as any).id, relation_type: "uses", strength: 1.0 });
    await server.createRelation({ from_id: (be3 as any).id, to_id: (be2 as any).id, relation_type: "uses", strength: 1.0 });
    await server.createRelation({ from_id: (be1 as any).id, to_id: (be2 as any).id, relation_type: "migrating_to", strength: 1.0 });

    console.log("Created Backend Cluster");

    console.log("Initiating Community Summarization...");
    const result = await server.summarizeCommunities({ min_community_size: 3 });

    console.log("Community Summarization Result:", JSON.stringify(result, null, 2));

    process.exit(0);
}

run().catch(console.error);
