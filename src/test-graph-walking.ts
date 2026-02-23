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
    console.log("Verbinde zum MCP-Server für Graph-Walking Test...");
    await client.connect(transport);
    console.log("Verbunden!");

    console.log("1. Bereite Test-Daten vor...");
    
    // Cleanup
    await client.callTool({
      name: "manage_system",
      arguments: { action: "clear_memory", confirm: true }
    });

    // Erstelle ein semantisches Netzwerk
    // Thema: Künstliche Intelligenz und deren Anwendungen
    
    const entities = [
      { name: "KI-Forschung", type: "Field", text: "Forschung an künstlicher Intelligenz und maschinellem Lernen." },
      { name: "Neural Networks", type: "Technology", text: "Neuronale Netze sind die Basis für modernes Deep Learning." },
      { name: "Transformer-Architektur", type: "Architecture", text: "Transformer sind spezialisierte neuronale Netze für Sprachverarbeitung." },
      { name: "Large Language Models", type: "Application", text: "LLMs nutzen Transformer, um menschenähnlichen Text zu generieren." },
      { name: "GPT-4", type: "Model", text: "GPT-4 ist ein leistungsfähiges Large Language Model von OpenAI." },
      { name: "Ethik in der KI", type: "Topic", text: "Diskussion über verantwortungsvolle Entwicklung von KI-Systemen." },
      { name: "Quantencomputing", type: "Field", text: "Quantencomputer nutzen Quantenmechanik für Berechnungen." } // Etwas weiter weg
    ];

    const entityIds: Record<string, string> = {};

    console.log("Erstelle Entitäten über 'add_observation'...");
    for (const ent of entities) {
      const res: any = await client.callTool({
        name: "mutate_memory",
        arguments: {
          action: "add_observation",
          entity_name: ent.name,
          entity_type: ent.type,
          text: ent.text,
          metadata: { description: ent.text }
        }
      });
      
      const content = res.content[0].text;
      const parsed = JSON.parse(content);
      
      if (parsed.error) {
        console.error(`Fehler beim Erstellen von ${ent.name}:`, parsed.error);
        continue;
      }

      const id = parsed.entity_id || parsed.id;
      if (!id) {
        console.error(`Keine ID erhalten für ${ent.name}. Response:`, JSON.stringify(parsed, null, 2));
      }
      entityIds[ent.name] = id;
    }

    console.log("Erstellte Entitäten:", Object.keys(entityIds));

    // Beziehungen erstellen (Graph-Struktur)
    const relations = [
      ["KI-Forschung", "Neural Networks", "entwickelt"],
      ["Neural Networks", "Transformer-Architektur", "ermöglicht"],
      ["Transformer-Architektur", "Large Language Models", "ist Basis von"],
      ["Large Language Models", "GPT-4", "beinhaltet"],
      ["GPT-4", "Ethik in der KI", "diskutiert in"],
      ["KI-Forschung", "Ethik in der KI", "beinhaltet"],
      ["KI-Forschung", "Quantencomputing", "nutzt eventuell"]
    ];

    for (const [from, to, type] of relations) {
      const fromId = entityIds[from];
      const toId = entityIds[to];
      if (!fromId || !toId) {
        console.error(`Fehler: ID für ${from} oder ${to} nicht gefunden!`);
        continue;
      }
      await client.callTool({
        name: "mutate_memory",
        arguments: {
          action: "create_relation",
          from_id: fromId,
          to_id: toId,
          relation_type: type
        }
      });
    }

    console.log("Beziehungen erstellt.");

    console.log("\n2. Test: Graph Walking (Vektor-Seed)");
    console.log("Suche nach: 'Wie funktionieren moderne Sprachmodelle?'");
    const walkRes1: any = await client.callTool({
      name: "query_memory",
      arguments: {
        action: "graph_walking",
        query: "Wie funktionieren moderne Sprachmodelle?",
        max_depth: 3,
        limit: 5
      }
    });
    console.log("Ergebnis Walk 1:", JSON.stringify(JSON.parse(walkRes1.content[0].text), null, 2));

    console.log("\n3. Test: Graph Walking (Start-Entity)");
    console.log(`Starte bei 'GPT-4' und suche nach Ethik`);
    const walkRes2: any = await client.callTool({
      name: "query_memory",
      arguments: {
        action: "graph_walking",
        query: "Ethische Bedenken bei KI",
        start_entity_id: entityIds["GPT-4"],
        max_depth: 2,
        limit: 3
      }
    });
    console.log("Ergebnis Walk 2:", JSON.stringify(JSON.parse(walkRes2.content[0].text), null, 2));

    console.log("\n4. Test: Graph Walking (Distanz-Check)");
    console.log("Suche nach 'Quantencomputer' ausgehend von 'GPT-4' (sollte kaum Relevanz haben oder zu weit weg sein)");
    const walkRes3: any = await client.callTool({
      name: "query_memory",
      arguments: {
        action: "graph_walking",
        query: "Quantencomputing Hardware",
        start_entity_id: entityIds["GPT-4"],
        max_depth: 2,
        limit: 5
      }
    });
    console.log("Ergebnis Walk 3:", JSON.stringify(JSON.parse(walkRes3.content[0].text), null, 2));

  } catch (error) {
    console.error("Test fehlgeschlagen:", error);
  } finally {
    process.exit(0);
  }
}

runTest();
