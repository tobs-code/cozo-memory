
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

async function main() {
  console.log("Connecting to MCP server...");
  const client = new Client(
    {
      name: "mcp-test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["ts-node", "src/index.ts"],
  });

  await client.connect(transport);
  console.log("Connected!");

  console.log("Executing 'add_observation' Tool-Call...");
  await client.callTool({
    name: "add_observation",
    arguments: {
      text: "The sky is blue.",
      entity_id: "nature_facts",
    },
  });

  console.log("Executing 'advancedSearch' Tool-Call...");
  const result = await client.callTool({
    name: "advancedSearch",
    arguments: {
      query: "blue sky",
    },
  });

  console.log("Result from Tool:");
  console.log(JSON.stringify(result, null, 2));

  await client.close();
}

main().catch((error) => {
  console.log("Error during test:", error);
});
