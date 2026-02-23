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
    console.log("Verbinde zum MCP-Server für Graph-RAG Test...");
    await client.connect(transport);
    console.log("Verbunden!");

    console.log("1. Erstelle Test-Daten (Graph)...");
    
    // Entitäten
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

    console.log(`IDs erstellt: Project-X=${projectXId}, Bob=${bobId}, Alice=${aliceId}`);

    // Beziehungen
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

    // Beobachtungen
    await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "add_observation",
        entity_id: aliceId,
        text: "Alice arbeitet an der Frontend-Architektur von Project-X."
      }
    });

    await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "add_observation",
        entity_id: projectXId,
        text: "Project-X ist eine neue E-Commerce Plattform."
      }
    });

    console.log("2. Führe 'graph_rag' Tool-Call aus...");
    console.log("Anfrage: 'Wer arbeitet an Project-X?'");
    
    const result = await client.callTool({
      name: "query_memory",
      arguments: {
        action: "graph_rag",
        query: "Project-X Architektur",
        limit: 5,
        max_depth: 2
      }
    });

    console.log("\n--- Graph-RAG Ergebnis ---");
    console.log(JSON.stringify(result, null, 2));
    
    if (result && (result as any).content) {
      const content = JSON.parse((result as any).content[0].text);
      console.log(`\nGefundene Einträge: ${content.length}`);
      
      const names = content.map((r: any) => r.name);
      console.log("Gefundene Entitäten:", [...new Set(names)]);
      
      if (names.some((n: string) => n.includes("Alice") || n === "Alice") && names.includes("Project-X")) {
        console.log("\n✅ Test ERFOLGREICH: Alice und Project-X wurden via Graph-Expansion gefunden.");
      } else {
        console.log("\n❌ Test FEHLGESCHLAGEN: Erwartete Entitäten nicht vollständig im Ergebnis.");
        console.log("Gesuchte Entitäten: Alice, Project-X");
      }
    }

  } catch (error) {
    console.error("Fehler beim Testen:", error);
  } finally {
    process.exit(0);
  }
}

runTest();
