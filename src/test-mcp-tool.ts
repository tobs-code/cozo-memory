
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
    console.log("Verbinde zum MCP-Server...");
    await client.connect(transport);
    console.log("Verbunden!");

    // Erstmal Daten anlegen, falls die DB leer ist (test-advanced-search.ts hat sie evtl. gelöscht oder sie ist persistent)
    // Wir nutzen advancedSearch direkt auf den vorhandenen Daten von vorhin (memory_db.cozo.db)
    
    console.log("Führe 'add_observation' Tool-Call aus...");
    await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "add_observation",
        entity_name: "Alice",
        entity_type: "Person",
        text: "Alice ist eine erfahrene TypeScript-Entwicklerin.",
        metadata: { role: "Developer", expertise: "TypeScript" }
      }
    });

    console.log("Führe 'advancedSearch' Tool-Call aus...");
    const result = await client.callTool({
      name: "query_memory",
      arguments: {
        action: "advancedSearch",
        query: "Entwickler",
        limit: 5,
        filters: {
          entityTypes: ["Person"]
        }
      }
    });

    console.log("Ergebnis vom Tool:");
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error("Fehler beim Testen:", error);
  } finally {
    process.exit(0);
  }
}

runTest();
