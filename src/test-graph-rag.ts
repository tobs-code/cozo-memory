import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const serverPath = path.join(__dirname, "../dist/index.js");

async function runTest() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
    env: { ...process.env, NODE_ENV: "development" }
  });

  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    console.log("Connecting to MCP server for Graph-RAG Test...");
    await client.connect(transport);
    console.log("Connected!");

    console.log("1. Create test data (Graph)...");
    
    // Entities
    const projectXRes = await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "create_entity",
        name: "Project-X",
        type: "Project",
        metadata: { priority: "high" }
      }
    });
    const projectXId = (JSON.parse((projectXRes as any).content[0].text) as any).id;

    const bobRes = await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "create_entity",
        name: "Bob",
        type: "Person",
        metadata: { role: "Manager" }
      }
    });
    const bobId = (JSON.parse((bobRes as any).content[0].text) as any).id;

    const aliceRes = await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "create_entity",
        name: "Alice",
        type: "Person",
        metadata: { role: "Developer" }
      }
    });
    const aliceId = (JSON.parse((aliceRes as any).content[0].text) as any).id;

    console.log(`IDs created: Project-X=${projectXId}, Bob=${bobId}, Alice=${aliceId}`);

    // Relationships
    await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "create_relation",
        from_id: aliceId,
        to_id: projectXId,
        relation_type: "works_on"
      }
    });

    await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "create_relation",
        from_id: bobId,
        to_id: projectXId,
        relation_type: "manages"
      }
    });

    // Observations
    await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "add_observation",
        entity_id: aliceId,
        text: "Alice works on the frontend architecture of Project-X."
      }
    });

    await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "add_observation",
        entity_id: projectXId,
        text: "Project-X is a new e-commerce platform."
      }
    });

    console.log("2. Execute 'graph_rag' tool call...");
    console.log("Query: 'Who works on Project-X?'");
    
    const result = await client.callTool({
      name: "query_memory",
      arguments: {
        action: "graph_rag",
        query: "Project-X architecture",
        limit: 5,
        max_depth: 2
      }
    });

    console.log("\n--- Graph-RAG Result ---");
    console.log(JSON.stringify(result, null, 2));
    
    if (result && (result as any).content) {
      const content = JSON.parse((result as any).content[0].text);
      console.log(`\nFound entries: ${content.length}`);
      
      const names = content.map((r: any) => r.name);
      console.log("Found entities:", [...new Set(names)]);
      
      if (names.some((n: string) => n.includes("Alice") || n === "Alice") && names.includes("Project-X")) {
        console.log("\n✅ Test SUCCESSFUL: Alice and Project-X were found via graph expansion.");
      } else {
        console.log("\n❌ Test FAILED: Expected entities not fully in result.");
        console.log("Sought entities: Alice, Project-X");
      }
    }

  } catch (error) {
    console.error("Error testing:", error);
  } finally {
    process.exit(0);
  }
}

runTest();
