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
    console.log("Connecting to MCP server for Graph-Walking Test...");
    await client.connect(transport);
    console.log("Connected!");

    console.log("1. Preparing test data...");
    
    // Cleanup
    await client.callTool({
      name: "manage_system",
      arguments: { action: "clear_memory", confirm: true }
    });

    // Create a semantic network
    // Topic: Artificial Intelligence and its applications
    
    const entities = [
      { name: "AI Research", type: "Field", text: "Research on artificial intelligence and machine learning." },
      { name: "Neural Networks", type: "Technology", text: "Neural networks are the basis for modern deep learning." },
      { name: "Transformer Architecture", type: "Architecture", text: "Transformers are specialized neural networks for language processing." },
      { name: "Large Language Models", type: "Application", text: "LLMs use transformers to generate human-like text." },
      { name: "GPT-4", type: "Model", text: "GPT-4 is a powerful Large Language Model from OpenAI." },
      { name: "Ethics in AI", type: "Topic", text: "Discussion about responsible development of AI systems." },
      { name: "Quantum Computing", type: "Field", text: "Quantum computers use quantum mechanics for calculations." } // Slightly further away
    ];

    const entityIds: Record<string, string> = {};

    console.log("Creating entities via 'add_observation'...");
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
        console.error(`Error creating ${ent.name}:`, parsed.error);
        continue;
      }

      const id = parsed.entity_id || parsed.id;
      if (!id) {
        console.error(`No ID received for ${ent.name}. Response:`, JSON.stringify(parsed, null, 2));
      }
      entityIds[ent.name] = id;
    }

    console.log("Created entities:", Object.keys(entityIds));

    // Create relationships (graph structure)
    const relations = [
      ["AI Research", "Neural Networks", "develops"],
      ["Neural Networks", "Transformer Architecture", "enables"],
      ["Transformer Architecture", "Large Language Models", "is basis of"],
      ["Large Language Models", "GPT-4", "includes"],
      ["GPT-4", "Ethics in AI", "discussed in"],
      ["AI Research", "Ethics in AI", "includes"],
      ["AI Research", "Quantum Computing", "might use"]
    ];

    for (const [from, to, type] of relations) {
      const fromId = entityIds[from];
      const toId = entityIds[to];
      if (!fromId || !toId) {
        console.error(`Error: ID for ${from} or ${to} not found!`);
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

    console.log("Relationships created.");

    console.log("\n2. Test: Graph Walking (Vector Seed)");
    console.log("Searching for: 'How do modern language models work?'");
    const walkRes1: any = await client.callTool({
      name: "query_memory",
      arguments: {
        action: "graph_walking",
        query: "How do modern language models work?",
        max_depth: 3,
        limit: 5
      }
    });
    console.log("Result Walk 1:", JSON.stringify(JSON.parse(walkRes1.content[0].text), null, 2));

    console.log("\n3. Test: Graph Walking (Start Entity)");
    console.log(`Start at 'GPT-4' and search for ethics`);
    const walkRes2: any = await client.callTool({
      name: "query_memory",
      arguments: {
        action: "graph_walking",
        query: "Ethical concerns in AI",
        start_entity_id: entityIds["GPT-4"],
        max_depth: 2,
        limit: 3
      }
    });
    console.log("Result Walk 2:", JSON.stringify(JSON.parse(walkRes2.content[0].text), null, 2));

    console.log("\n4. Test: Graph Walking (Distance Check)");
    console.log("Search for 'quantum computer' starting from 'GPT-4' (should have little relevance or be too far away)");
    const walkRes3: any = await client.callTool({
      name: "query_memory",
      arguments: {
        action: "graph_walking",
        query: "Quantum computing hardware",
        start_entity_id: entityIds["GPT-4"],
        max_depth: 2,
        limit: 5
      }
    });
    console.log("Result Walk 3:", JSON.stringify(JSON.parse(walkRes3.content[0].text), null, 2));

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    process.exit(0);
  }
}

runTest();
