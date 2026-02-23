import express from "express";
import cors from "cors";
import { MemoryServer } from "./index.js";
import { v4 as uuidv4 } from "uuid";

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const memoryServer = new MemoryServer();

// --- Entities ---

app.get("/api/entities", async (req, res) => {
  try {
    const result = await memoryServer.db.run('?[id, name, type, metadata, ts] := *entity{id, name, type, metadata, created_at, @ "NOW"}, ts = to_int(created_at)');
    res.json(result.rows.map((r: any) => ({
      id: r[0],
      name: r[1],
      type: r[2],
      metadata: r[3],
      created_at: r[4]
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/entities", async (req, res) => {
  const { name, type, metadata } = req.body;
  if (!name || !type) return res.status(400).json({ error: "Name and type are required" });

  try {
    // We use the same logic as in create_entity tool
    const id = uuidv4();
    const embedding = await memoryServer.embeddingService.embed(name + " " + type);
    
    await memoryServer.db.run(
      `
        ?[id, created_at, name, type, embedding, metadata] <- [
          [$id, "ASSERT", $name, $type, [${embedding.join(",")}], $metadata]
        ] :put entity {id, created_at => name, type, embedding, metadata}
      `,
      { id, name, type, metadata: metadata || {} }
    );
    
    res.status(201).json({ id, name, type, metadata, status: "Entity created" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/entities/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // Logic from get_entity_details
    const entityRes = await memoryServer.db.run('?[id, name, type, metadata, ts] := *entity{id, name, type, metadata, created_at, @ "NOW"}, id = $id, ts = to_int(created_at)', { id });
    if (entityRes.rows.length === 0) return res.status(404).json({ error: "Entity not found" });
    
    const obsRes = await memoryServer.db.run('?[id, text, metadata, ts] := *observation{id, entity_id, text, metadata, created_at, @ "NOW"}, entity_id = $id, ts = to_int(created_at)', { id });
    const relRes = await memoryServer.db.run(`
      ?[target_id, type, strength, metadata, direction] := *relationship{from_id, to_id, relation_type: type, strength, metadata, @ "NOW"}, from_id = $id, target_id = to_id, direction = 'outgoing'
      ?[target_id, type, strength, metadata, direction] := *relationship{from_id, to_id, relation_type: type, strength, metadata, @ "NOW"}, to_id = $id, target_id = from_id, direction = 'incoming'
    `, { id });

    res.json({
      entity: {
        id: entityRes.rows[0][0],
        name: entityRes.rows[0][1],
        type: entityRes.rows[0][2],
        metadata: entityRes.rows[0][3],
        created_at: entityRes.rows[0][4]
      },
      observations: obsRes.rows.map((r: any) => ({ id: r[0], text: r[1], metadata: r[2], created_at: r[3] })),
      relations: relRes.rows.map((r: any) => ({ target_id: r[0], type: r[1], strength: r[2], metadata: r[3], direction: r[4] }))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/entities/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // Fixed logic from delete_entity
    await memoryServer.db.run(`
      { ?[id, created_at] := *observation{id, entity_id, created_at}, entity_id = $target_id :rm observation {id, created_at} }
      { ?[from_id, to_id, relation_type, created_at] := *relationship{from_id, to_id, relation_type, created_at}, from_id = $target_id :rm relationship {from_id, to_id, relation_type, created_at} }
      { ?[from_id, to_id, relation_type, created_at] := *relationship{from_id, to_id, relation_type, created_at}, to_id = $target_id :rm relationship {from_id, to_id, relation_type, created_at} }
      { ?[id, created_at] := *entity{id, created_at}, id = $target_id :rm entity {id, created_at} }
    `, { target_id: id });
    res.json({ status: "Entity and related data deleted" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Observations ---

app.post("/api/observations", async (req, res) => {
  const { entity_id, text, metadata } = req.body;
  if (!entity_id || !text) return res.status(400).json({ error: "Entity ID and text are required" });

  try {
    const id = uuidv4();
    const embedding = await memoryServer.embeddingService.embed(text);
    
    await memoryServer.db.run(
      `
        ?[id, created_at, entity_id, text, embedding, metadata] <- [
          [$id, "ASSERT", $entity_id, $text, [${embedding.join(",")}], $metadata]
        ] :put observation {id, created_at => entity_id, text, embedding, metadata}
      `,
      { id, entity_id, text, metadata: metadata || {} }
    );
    
    res.status(201).json({ id, entity_id, text, metadata, status: "Observation added" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Search / Context ---

app.get("/api/search", async (req, res) => {
  const { query, limit = 10 } = req.query;
  if (!query) return res.status(400).json({ error: "Query is required" });

  try {
    const results = await memoryServer.hybridSearch.search({
      query: query as string,
      limit: Number(limit)
    });
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/context", async (req, res) => {
  const { query, context_window = 20 } = req.query;
  if (!query) return res.status(400).json({ error: "Query is required" });

  try {
    // Logic from get_context
    const searchResults = await memoryServer.hybridSearch.search({
      query: query as string,
      limit: Number(context_window)
    });
    const entities = searchResults.filter(r => r.type === 'entity');
    const observations = searchResults.filter(r => r.type === 'observation');

    const graphContext = [];
    for (const entity of entities) {
      const connections = await memoryServer.db.run(`
        ?[target_name, rel_type] := *relationship{from_id, to_id, relation_type: rel_type, @ "NOW"}, from_id = $id, *entity{id: to_id, name: target_name, @ "NOW"}
        ?[target_name, rel_type] := *relationship{from_id, to_id, relation_type: rel_type, @ "NOW"}, to_id = $id, *entity{id: from_id, name: target_name, @ "NOW"}
      `, { id: entity.id });
      graphContext.push({ entity: entity.name, connections: connections.rows });
    }

    res.json({
      search_results: searchResults,
      graph_context: graphContext
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/evolution/:id", async (req, res) => {
  const { id } = req.params;
  const { to_id, since, until } = req.query;
  try {
    const result = await memoryServer.getRelationEvolution({ 
      from_id: id, 
      to_id: to_id as string,
      since: since ? Number(since) : undefined,
      until: until ? Number(until) : undefined
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Health & Maintenance ---

app.get("/api/health", async (req, res) => {
  try {
    const e = await memoryServer.db.run('?[count(id)] := *entity{id, @ "NOW"}');
    const o = await memoryServer.db.run('?[count(id)] := *observation{id, @ "NOW"}');
    const r = await memoryServer.db.run('?[count(f)] := *relationship{from_id: f, @ "NOW"}');

    res.json({
      entities: e.rows[0]?.[0] ?? 0,
      observations: o.rows[0]?.[0] ?? 0,
      relationships: r.rows[0]?.[0] ?? 0,
      status: "healthy"
    });
  } catch (error: any) {
    console.error("Health endpoint error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/communities", async (req, res) => {
  try {
    const query = `
      edges[f, t, s] := *relationship{from_id: f, to_id: t, strength: s, @ "NOW"}
      temp_communities[community_id, entity_id] <~ LabelPropagation(edges[f, t, s])
      ?[entity_id, community_id] := temp_communities[community_id, entity_id]
    `;
    const result = await memoryServer.db.run(query);
    const entitiesRes = await memoryServer.db.run('?[id, name, type] := *entity{id, name, type, @ "NOW"}');
    const entityMap = new Map();
    entitiesRes.rows.forEach((r: any) => entityMap.set(r[0], { name: r[1], type: r[2] }));

    const communities: Record<string, any[]> = {};
    result.rows.forEach((r: any) => {
      const communityId = String(r[1]);
      const entityId = r[0];
      const info = entityMap.get(entityId) || { name: "Unknown", type: "Unknown" };
      if (!communities[communityId]) communities[communityId] = [];
      communities[communityId].push({ id: entityId, name: info.name, type: info.type });
    });

    res.json({ community_count: Object.keys(communities).length, communities });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Snapshots ---

app.get("/api/snapshots", async (req, res) => {
  try {
    const result = await memoryServer.db.run("?[id, e, o, r, meta, created_at] := *memory_snapshot{snapshot_id: id, entity_count: e, observation_count: o, relation_count: r, metadata: meta, created_at}");
    res.json(result.rows.map((r: any) => ({
      snapshot_id: r[0],
      entity_count: r[1],
      observation_count: r[2],
      relation_count: r[3],
      metadata: r[4],
      created_at: r[5]
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/snapshots", async (req, res) => {
  const { metadata } = req.body;
  try {
    const [entityResult, obsResult, relResult] = await Promise.all([
      memoryServer.db.run('?[id] := *entity{id, @ "NOW"}'),
      memoryServer.db.run('?[id] := *observation{id, @ "NOW"}'),
      memoryServer.db.run('?[from_id, to_id] := *relationship{from_id, to_id, @ "NOW"}')
    ]);

    const counts = {
      entities: entityResult.rows.length,
      observations: obsResult.rows.length,
      relations: relResult.rows.length
    };

    const snapshot_id = uuidv4();
    const now = Date.now();
    await memoryServer.db.run("?[snapshot_id, entity_count, observation_count, relation_count, metadata, created_at] <- [[$id, $e, $o, $r, $meta, $now]]:put memory_snapshot {snapshot_id => entity_count, observation_count, relation_count, metadata, created_at}", {
      id: snapshot_id,
      e: counts.entities,
      o: counts.observations,
      r: counts.relations,
      meta: metadata || {},
      now
    });

    res.status(201).json({ snapshot_id, ...counts, status: "Snapshot created" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`API Bridge listening at http://localhost:${port}`);
});
