
import { MemoryServer } from './index';

async function testNewGraphAlgorithms() {
  const server = new MemoryServer('test_graph_algorithms');
  
  console.log("--- Initialize test data ---");
  
  // We build a network:
  // A <-> B <-> C (B is bridge/betweenness)
  // D -> E -> F -> D (Cycle for CC and HITS)
  // G, H (Separate component)
  
  const entities = [
    { id: 'node_a', name: 'Node A', type: 'Test' },
    { id: 'node_b', name: 'Node B (Bridge)', type: 'Test' },
    { id: 'node_c', name: 'Node C', type: 'Test' },
    { id: 'node_d', name: 'Node D', type: 'Test' },
    { id: 'node_e', name: 'Node E', type: 'Test' },
    { id: 'node_f', name: 'Node F', type: 'Test' },
    { id: 'node_g', name: 'Node G', type: 'Test' },
    { id: 'node_h', name: 'Node H', type: 'Test' }
  ];

  const relations = [
    { from_id: 'node_a', to_id: 'node_b', action: 'create_relation', params: { from_id: 'node_a', to_id: 'node_b', relation_type: 'connects', strength: 0.8 } },
    { from_id: 'node_b', to_id: 'node_c', action: 'create_relation', params: { from_id: 'node_b', to_id: 'node_c', relation_type: 'connects', strength: 0.9 } },
    { from_id: 'node_d', to_id: 'node_e', action: 'create_relation', params: { from_id: 'node_d', to_id: 'node_e', relation_type: 'flow', strength: 1.0 } },
    { from_id: 'node_e', to_id: 'node_f', action: 'create_relation', params: { from_id: 'node_e', to_id: 'node_f', relation_type: 'flow', strength: 1.0 } },
    { from_id: 'node_f', to_id: 'node_d', action: 'create_relation', params: { from_id: 'node_f', to_id: 'node_d', relation_type: 'flow', strength: 1.0 } },
    { from_id: 'node_g', to_id: 'node_h', action: 'create_relation', params: { from_id: 'node_g', to_id: 'node_h', relation_type: 'link', strength: 0.5 } }
  ];

  console.log("Creating entities...");
  for (const ent of entities) {
    await server.runTransaction({
      operations: [{ action: 'create_entity', params: ent }]
    });
  }
  
  console.log("Creating relationships...");
  await server.runTransaction({
    operations: relations.map(r => ({ action: 'create_relation', params: r.params }))
  });

  // Short pause for DB flush (SQLite is synchronous, but better safe than sorry)
  await new Promise(resolve => setTimeout(resolve, 500));

  // DEBUG: Check if data is present
  console.log("Debug: Checking database content...");
  const entitiesCount = await server.db.run(`?[count(e)] := *entity{id: e}`);
  const relationsCount = await server.db.run(`?[count(f)] := *relationship{from_id: f, @ "NOW"}`);
  console.log(`Debug: Entities in DB: ${entitiesCount.rows[0][0]}`);
  console.log(`Debug: Relationships in DB: ${relationsCount.rows[0][0]}`);

  if (relationsCount.rows[0][0] === 0) {
    console.log("Trying alternative query without @ NOW...");
    const relationsCountNoNow = await server.db.run(`?[count(f)] := *relationship{from_id: f}`);
    console.log(`Debug: Relationships in DB (without NOW): ${relationsCountNoNow.rows[0][0]}`);
  }

  console.log("\n--- Test: Betweenness Centrality ---");
  const betweenness = await server.recomputeBetweennessCentrality();
  console.log("Betweenness Results:", JSON.stringify(betweenness.sort((a: any, b: any) => b.centrality - a.centrality), null, 2));

  console.log("\n--- Test: Connected Components ---");
  const components = await server.recomputeConnectedComponents();
  console.log("Connected Components:", JSON.stringify(components, null, 2));

  console.log("\n--- Test: Shortest Path (A -> C) ---");
  const path = await server.computeShortestPath({ start_entity: 'node_a', end_entity: 'node_c' });
  console.log("Shortest Path A->C:", JSON.stringify(path, null, 2));

  console.log("\n--- Test: HITS (Hubs & Authorities) ---");
  const hits = await server.recomputeHITS();
  console.log("HITS Results:", JSON.stringify(hits, null, 2));

  console.log("\n--- Test: PageRank ---");
  const pagerank = await server.recomputePageRank();
  console.log("PageRank Results (Top 5):", JSON.stringify(pagerank.sort((a: any, b: any) => b.pagerank - a.pagerank).slice(0, 5), null, 2));

  console.log("\n--- Test: MCP Tool 'analyze_graph' ---");
  // We simulate MCP calls via server methods, since FastMCP tools are encapsulated internally
  console.log("Testing analyze_graph with action 'betweenness'...");
  const resB = await server.recomputeBetweennessCentrality();
  console.log("Result (Top 5):", JSON.stringify(resB.sort((a: any, b: any) => b.centrality - a.centrality).slice(0, 5), null, 2));

  console.log("Testing analyze_graph with action 'shortest_path' (node_a to node_c)...");
  const resP = await server.computeShortestPath({ start_entity: 'node_a', end_entity: 'node_c' });
  console.log("Result:", JSON.stringify(resP, null, 2));
}

testNewGraphAlgorithms().catch(console.error);
