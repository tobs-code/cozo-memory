
import { MemoryServer } from './index';
import { v4 as uuidv4 } from 'uuid';

async function testPageRank() {
  const server = new MemoryServer('test_pagerank');
  
  console.log("--- Erstelle Entitäten ---");
  
  const idA = "entity_a";
  const idB = "entity_b";
  const idC = "entity_c";
  const idD = "entity_d";

  await server.runTransaction({
    operations: [
      { action: 'create_entity', params: { id: idA, name: 'Zentraler Knoten A', type: 'Node' } },
      { action: 'create_entity', params: { id: idB, name: 'Knoten B', type: 'Node' } },
      { action: 'create_entity', params: { id: idC, name: 'Knoten C', type: 'Node' } },
      { action: 'create_entity', params: { id: idD, name: 'Isolierter Knoten D', type: 'Node' } },
      { action: 'create_relation', params: { from_id: idB, to_id: idA, relation_type: 'points_to', strength: 1.0 } },
      { action: 'create_relation', params: { from_id: idC, to_id: idA, relation_type: 'points_to', strength: 1.0 } }
    ]
  });

  console.log("--- Berechne PageRank ---");
  const rankRes = await server.recomputePageRank();
  console.log("Ranks:", JSON.stringify(rankRes, null, 2));

  console.log("--- Suche nach 'Knoten' (A sollte durch PageRank geboostet sein) ---");
  const searchRes = await server.advancedSearch({ query: 'Knoten', limit: 5 });
  
  console.log("Suchergebnisse:");
  searchRes.forEach((r, i) => {
    console.log(`${i+1}. ${r.name} - Score: ${r.score.toFixed(4)}`);
  });
}

testPageRank().catch(console.error);
