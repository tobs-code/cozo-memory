
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

// Point to source directly for ts-node execution
const serverPath = path.join(process.cwd(), "src/index.ts");

async function runTest() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["ts-node", serverPath],
    env: { ...process.env, NODE_ENV: "development" }
  });

  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    console.log("Connecting to MCP Server...");
    await client.connect(transport);
    console.log("Connected!");

    // Test Transaction
    console.log("Testing 'run_transaction' via MCP Tool Call...");
    const transactionResult: any = await client.callTool({
      name: "mutate_memory",
      arguments: {
        action: "run_transaction",
        operations: [
          {
            action: "create_entity",
            params: {
              name: "MCPToolTransactionEntity_Final",
              type: "Test",
              metadata: { source: "mcp_client_test_final" }
            }
          },
          {
            action: "add_observation",
            params: {
              entity_name: "MCPToolTransactionEntity_Final",
              text: "This observation was added via an MCP transaction tool call to verify final fix.",
              metadata: { verified: true }
            }
          }
        ]
      }
    });

    console.log("Transaction Result:", JSON.stringify(transactionResult, null, 2));

    if (transactionResult.isError) {
        console.error("Transaction failed!");
        process.exit(1);
    }

    // Verify Entity Existence
    console.log("Verifying Entity Existence...");
    const searchResult: any = await client.callTool({
        name: "query_memory",
        arguments: {
            action: "search",
            query: "MCPToolTransactionEntity_Final",
            limit: 1
        }
    });
    
    console.log("Search Result:", JSON.stringify(searchResult, null, 2));

  } catch (error) {
    console.error("Test Failed:", error);
    process.exit(1);
  } finally {
      // Allow some time for logs to flush
      setTimeout(() => process.exit(0), 1000);
  }
}

runTest();
