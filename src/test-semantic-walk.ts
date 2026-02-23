import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";

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
    console.log("Verbinde zum MCP-Server für Semantic Walk Test...");
    await client.connect(transport);
    console.log("Verbunden!");

    console.log("\n1. Bereite Test-Daten vor...");
    
    // Cleanup
    await client.callTool({
      name: "manage_system",
      arguments: { action: "clear_memory", confirm: true }
    });

    // Erstelle Entitäten
    // Wir wollen Pfade testen:
    // A (Start) -> B (Explizit)
    // A (Start) ~ C (Semantisch)
    // B -> D (Explizit) => A -> B -> D (Explizit Pfad Tiefe 2)
    // B ~ E (Semantisch) => A -> B ~ E (Mixed Pfad)
    
    const entities = [
      { name: "Apfel", type: "Fruit", text: "Ein roter Apfel, eine beliebte Frucht." }, // Start
      { name: "Obstbaum", type: "Plant", text: "Ein Baum an dem Früchte wachsen." }, // Verbunden mit Apfel
      { name: "Birne", type: "Fruit", text: "Eine grüne Birne, ähnlich wie ein Apfel." }, // Semantisch ähnlich zu Apfel
      { name: "Garten", type: "Location", text: "Ein Ort wo Pflanzen wachsen." }, // Verbunden mit Obstbaum
      { name: "Banane", type: "Fruit", text: "Eine gelbe krumme Frucht." }, // Semantisch ähnlich zu Birne (und Apfel?)
      { name: "Birnenbaum", type: "Plant", text: "Ein Baum an dem Birnen wachsen." } // Mixed Path Test
    ];

    const entityIds: Record<string, string> = {};

    console.log("Erstelle Entitäten...");
    for (const ent of entities) {
      const res: any = await client.callTool({
        name: "mutate_memory",
        arguments: {
          action: "add_observation",
          entity_name: ent.name,
          entity_type: ent.type,
          text: ent.text
        }
      });
      
      const content = JSON.parse(res.content[0].text);
      const id = content.entity_id || content.id;
      entityIds[ent.name] = id;
      console.log(`  - ${ent.name}: ${id}`);
    }

    // Beziehungen erstellen
    console.log("\nErstelle Beziehungen...");
    
    // Apfel -> wächst an -> Obstbaum (Explizit)
    await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "create_relation",
        from_id: entityIds["Apfel"],
        to_id: entityIds["Obstbaum"],
        relation_type: "grows_on",
        strength: 1.0
      }
    });

    // Obstbaum -> steht in -> Garten (Explizit)
    await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "create_relation",
        from_id: entityIds["Obstbaum"],
        to_id: entityIds["Garten"],
        relation_type: "located_in",
        strength: 1.0
      }
    });

    // Birne -> wächst an -> Birnenbaum (Explizit)
    await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "create_relation",
        from_id: entityIds["Birne"],
        to_id: entityIds["Birnenbaum"],
        relation_type: "grows_on",
        strength: 1.0
      }
    });

    console.log("Daten vorbereitet.");

    // Test 1: Semantic Walk ab "Apfel"
    console.log("\n2. Starte Semantic Graph Walk (Start: Apfel)...");
    
    const walkRes: any = await client.callTool({
      name: "analyze_graph",
      arguments: {
        action: "semantic_walk",
        start_entity: entityIds["Apfel"],
        max_depth: 3,
        min_similarity: 0.6 // Etwas niedriger für den Test
      }
    });

    const result = JSON.parse(walkRes.content[0].text);
    console.log(`\nGefundene Entitäten: ${result.found_entities}`);
    
    console.log("\nErgebnisse:");
    const foundNames = new Set();
    
    for (const r of result.results) {
      console.log(`- ${r.entity_name} (${r.entity_type})`);
      console.log(`  Tiefe: ${r.distance}, Score: ${r.path_score.toFixed(3)}, Typ: ${r.path_type}`);
      foundNames.add(r.entity_name);
    }

    // Validierung
    console.log("\nValidierung:");
    
    // 1. Obstbaum sollte gefunden werden (Explicit, Tiefe 1)
    if (foundNames.has("Obstbaum")) console.log("✅ Obstbaum gefunden (Explizit)");
    else console.error("❌ Obstbaum NICHT gefunden");

    // 2. Birne sollte gefunden werden (Semantisch, Tiefe 1)
    if (foundNames.has("Birne")) console.log("✅ Birne gefunden (Semantisch)");
    else console.error("❌ Birne NICHT gefunden (Vielleicht Embedding-Problem?)");

    // 3. Garten sollte gefunden werden (Explicit Pfad: Apfel -> Obstbaum -> Garten, Tiefe 2)
    if (foundNames.has("Garten")) console.log("✅ Garten gefunden (Transitiv Explizit)");
    else console.error("❌ Garten NICHT gefunden");

    // 4. Banane könnte gefunden werden (Semantisch oder Mixed)
    if (foundNames.has("Banane")) console.log("✅ Banane gefunden");
    else console.log("ℹ️ Banane nicht gefunden (OK, hängt von Similarity ab)");

  } catch (error) {
    console.error("Test fehlgeschlagen:", error);
  } finally {
    await transport.close();
    process.exit(0);
  }
}

runTest();
