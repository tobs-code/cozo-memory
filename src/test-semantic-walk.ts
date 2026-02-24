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
    console.log("Connecting to MCP server for Semantic Walk Test...");
    await client.connect(transport);
    console.log("Connected!");

    console.log("\n1. Preparing test data...");
    
    // Cleanup
    await client.callTool({
      name: "manage_system",
      arguments: { action: "clear_memory", confirm: true }
    });

    // Create entities
    // We want to test paths:
    // A (Start) -> B (Explicit)
    // A (Start) ~ C (Semantic)
    // B -> D (Explicit) => A -> B -> D (Explicit Path Depth 2)
    // B ~ E (Semantic) => A -> B ~ E (Mixed Path)
    
    const entities = [
      { name: "Apple", type: "Fruit", text: "A red apple, a popular fruit." }, // Start
      { name: "Fruit Tree", type: "Plant", text: "A tree where fruits grow." }, // Connected to Apple
      { name: "Pear", type: "Fruit", text: "A green pear, similar to an apple." }, // Semantically similar to Apple
      { name: "Garden", type: "Location", text: "A place where plants grow." }, // Connected to Fruit Tree
      { name: "Banana", type: "Fruit", text: "A yellow curved fruit." }, // Semantically similar to Pear (and Apple?)
      { name: "Pear Tree", type: "Plant", text: "A tree where pears grow." } // Mixed Path Test
    ];

    const entityIds: Record<string, string> = {};

    console.log("Creating entities...");
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

    // Creating relationships
    console.log("\nCreating relationships...");
    
    // Apple -> grows on -> Fruit Tree (Explicit)
    await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "create_relation",
        from_id: entityIds["Apple"],
        to_id: entityIds["Fruit Tree"],
        relation_type: "grows_on",
        strength: 1.0
      }
    });

    // Fruit Tree -> located in -> Garden (Explicit)
    await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "create_relation",
        from_id: entityIds["Fruit Tree"],
        to_id: entityIds["Garden"],
        relation_type: "located_in",
        strength: 1.0
      }
    });

    // Pear -> grows on -> Pear Tree (Explicit)
    await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "create_relation",
        from_id: entityIds["Pear"],
        to_id: entityIds["Pear Tree"],
        relation_type: "grows_on",
        strength: 1.0
      }
    });

    console.log("Data prepared.");

    // Test 1: Semantic Walk from "Apple"
    console.log("\n2. Starting Semantic Graph Walk (Start: Apple)...");
    
    const walkRes: any = await client.callTool({
      name: "analyze_graph",
      arguments: {
        action: "semantic_walk",
        start_entity: entityIds["Apple"],
        max_depth: 3,
        min_similarity: 0.6 // Slightly lower for the test
      }
    });

    const result = JSON.parse(walkRes.content[0].text);
    console.log(`\nFound entities: ${result.found_entities}`);
    
    console.log("\nResults:");
    const foundNames = new Set();
    
    for (const r of result.results) {
      console.log(`- ${r.entity_name} (${r.entity_type})`);
      console.log(`  Depth: ${r.distance}, Score: ${r.path_score.toFixed(3)}, Type: ${r.path_type}`);
      foundNames.add(r.entity_name);
    }

    // Validation
    console.log("\nValidation:");
    
    // 1. Fruit Tree should be found (Explicit, Depth 1)
    if (foundNames.has("Fruit Tree")) console.log("✅ Fruit Tree found (Explicit)");
    else console.error("❌ Fruit Tree NOT found");

    // 2. Pear should be found (Semantic, Depth 1)
    if (foundNames.has("Pear")) console.log("✅ Pear found (Semantic)");
    else console.error("❌ Pear NOT found (Maybe embedding problem?)");

    // 3. Garden should be found (Explicit Path: Apple -> Fruit Tree -> Garden, Depth 2)
    if (foundNames.has("Garden")) console.log("✅ Garden found (Transitive Explicit)");
    else console.error("❌ Garden NOT found");

    // 4. Banana could be found (Semantic or Mixed)
    if (foundNames.has("Banana")) console.log("✅ Banana found");
    else console.log("ℹ️ Banana not found (OK, depends on Similarity)");

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await transport.close();
    process.exit(0);
  }
}

runTest();
