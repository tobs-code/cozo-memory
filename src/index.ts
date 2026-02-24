import { EmbeddingService } from "./embedding-service";

import { FastMCP } from "fastmcp";
import { CozoDb } from "cozo-node";
import { z } from "zod";
import { v4 as uuidv4, validate as uuidValidate } from "uuid";
import path from "path";
import { HybridSearch } from "./hybrid-search";
import { InferenceEngine } from "./inference-engine";

export const DB_PATH = path.resolve(__dirname, "..", "memory_db.cozo");
const DB_ENGINE = process.env.DB_ENGINE || "sqlite"; // "sqlite" or "rocksdb"
const EMBEDDING_MODEL = "Xenova/bge-m3";
const EMBEDDING_DIM = 1024;

export const USER_ENTITY_ID = "global_user_profile";
export const USER_ENTITY_NAME = "The User";
export const USER_ENTITY_TYPE = "User";

export class MemoryServer {
  public db: CozoDb;
  public mcp: FastMCP;
  public embeddingService: EmbeddingService;
  public hybridSearch: HybridSearch;
  public inferenceEngine: InferenceEngine;
  public initPromise: Promise<void>;

  constructor(dbPath: string = DB_PATH) {
    const fullDbPath = DB_ENGINE === "sqlite" ? dbPath + ".db" : dbPath;
    this.db = new CozoDb(DB_ENGINE, fullDbPath);
    console.error(`[DB] Using backend: ${DB_ENGINE}, path: ${fullDbPath}`);
    this.embeddingService = new EmbeddingService();
    this.hybridSearch = new HybridSearch(this.db, this.embeddingService);
    this.inferenceEngine = new InferenceEngine(this.db, this.embeddingService);

    this.mcp = new FastMCP({
      name: "cozo-memory-server",
      version: "1.0.0",
    });

    this.initPromise = (async () => {
      await this.setupSchema();
      console.error("[Server] Schema setup fully completed.");
    })();
    this.registerTools();
  }

  public async janitorCleanup(args: {
    confirm: boolean;
    older_than_days?: number;
    max_observations?: number;
    min_entity_degree?: number;
    model?: string;
  }) {
    await this.initPromise;

    const olderThanDays = Math.max(1, Math.floor(args.older_than_days ?? 30));
    const maxObservations = Math.max(1, Math.floor(args.max_observations ?? 20));
    const minEntityDegree = Math.max(0, Math.floor(args.min_entity_degree ?? 2));
    const model = args.model ?? "demyagent-4b-i1:Q6_K";

    const before = (Date.now() - olderThanDays * 24 * 60 * 60 * 1000) * 1000;
    const fetchLimit = Math.max(maxObservations * 5, maxObservations);

    const candidatesRes = await this.db.run(
      `
        ?[obs_id, entity_id, text, metadata, ts] :=
          *observation{id: obs_id, entity_id, text, metadata, created_at, @ "NOW"},
          ts = to_int(created_at),
          ts < $before
        :limit $limit
      `,
      { before, limit: fetchLimit },
    );

    const candidates = (candidatesRes.rows as any[]).map((r) => ({
      obs_id: r[0] as string,
      entity_id: r[1] as string,
      text: r[2] as string,
      metadata: r[3] as any,
      ts: Number(r[4]),
    }));

    const degreeByEntity = new Map<string, number>();
    const filtered: Array<{ obs_id: string; entity_id: string; text: string; metadata: any; ts: number }> = [];

    for (const c of candidates) {
      let degree = degreeByEntity.get(c.entity_id);
      if (degree === undefined) {
        const [outRes, inRes] = await Promise.all([
          this.db.run('?[to_id] := *relationship{from_id: $id, to_id, @ "NOW"}', { id: c.entity_id }),
          this.db.run('?[from_id] := *relationship{from_id, to_id: $id, @ "NOW"}', { id: c.entity_id }),
        ]);
        const computedDegree = outRes.rows.length + inRes.rows.length;
        degreeByEntity.set(c.entity_id, computedDegree);
        degree = computedDegree;
      }

      if ((degree ?? 0) < minEntityDegree) filtered.push(c);
      if (filtered.length >= maxObservations) break;
    }

    filtered.sort((a, b) => a.ts - b.ts);
    const picked = filtered.slice(0, maxObservations);

    const byEntity = new Map<string, Array<{ obs_id: string; text: string; metadata: any; ts: number }>>();
    for (const p of picked) {
      const arr = byEntity.get(p.entity_id) ?? [];
      arr.push({ obs_id: p.obs_id, text: p.text, metadata: p.metadata, ts: p.ts });
      byEntity.set(p.entity_id, arr);
    }

    // Always perform cache cleanup, regardless of observation candidates
    const cutoff = Math.floor((Date.now() - olderThanDays * 24 * 3600 * 1000) / 1000);
    console.error(`[Janitor] Cleaning cache (older than ${new Date(cutoff * 1000).toISOString()}, ts=${cutoff})...`);
    
    let cacheDeletedCount = 0;
    try {
      // First count what we want to delete
      const toDeleteRes = await this.db.run(`?[query_hash] := *search_cache{query_hash, created_at}, created_at < $cutoff`, { cutoff });
      const toDeleteHashes = toDeleteRes.rows.map((r: any) => [r[0]]);
       
       if (toDeleteHashes.length > 0) {
         console.error(`[Janitor] Deleting ${toDeleteHashes.length} cache entries...`);
         // We use :delete with the hashes (as a list of lists)
         const deleteRes = await this.db.run(`
           ?[query_hash] <- $hashes
           :delete search_cache {query_hash}
         `, { hashes: toDeleteHashes });
        console.error(`[Janitor] :delete result:`, JSON.stringify(deleteRes));
        cacheDeletedCount = toDeleteHashes.length;
      } else {
        console.error(`[Janitor] No obsolete cache entries found.`);
      }
    } catch (e: any) {
      console.error(`[Janitor] Cache cleanup error:`, e.message);
    }

    if (picked.length === 0) {
      return args.confirm
        ? { 
            status: "no_op", 
            criteria: { older_than_days: olderThanDays, max_observations: maxObservations, min_entity_degree: minEntityDegree },
            cache_deleted: cacheDeletedCount
          }
        : {
            status: "dry_run",
            criteria: { older_than_days: olderThanDays, max_observations: maxObservations, min_entity_degree: minEntityDegree },
            candidates: [],
            cache_deleted: 0
          };
    }

    if (!args.confirm) {
      return {
        status: "dry_run",
        criteria: { older_than_days: olderThanDays, max_observations: maxObservations, min_entity_degree: minEntityDegree },
        candidates: Array.from(byEntity.entries()).map(([entity_id, obs]) => ({
          entity_id,
          observation_ids: obs.map((o) => o.obs_id),
          count: obs.length,
        })),
      };
    }

    const summaryEntity = await this.createEntity({
      name: `Janitor Summary ${new Date().toISOString()}`,
      type: "Summary",
      metadata: {
        model,
        older_than_days: olderThanDays,
        max_observations: maxObservations,
        min_entity_degree: minEntityDegree,
      },
    });

    const summary_entity_id = (summaryEntity as any)?.id as string | undefined;
    if (!summary_entity_id) return { error: "Could not create summary entity" };

    const results: any[] = [];

    for (const [entity_id, obs] of byEntity.entries()) {
      const entityInfo = await this.db.run('?[name, type] := *entity{id: $id, name, type, @ "NOW"}', { id: entity_id });
      const entityName = entityInfo.rows.length > 0 ? entityInfo.rows[0][0] : entity_id;
      const entityType = entityInfo.rows.length > 0 ? entityInfo.rows[0][1] : "Unknown";

      const levels = obs
        .map((o) => {
          const level = (o.metadata as any)?.janitor?.level;
          const n = typeof level === "number" ? level : Number(level);
          return Number.isFinite(n) ? n : null;
        })
        .filter((n): n is number => typeof n === "number");
      const nextLevel = (levels.length > 0 ? Math.max(...levels) : 0) + 1;

      const minTs = obs.reduce((m, o) => Math.min(m, o.ts), Number.POSITIVE_INFINITY);
      const maxTs = obs.reduce((m, o) => Math.max(m, o.ts), Number.NEGATIVE_INFINITY);

      const systemPrompt =
        "Here are older fragments (or previous summaries) from your memory. Summarize them into a single, permanent Executive Summary. Respond only with the Executive Summary.";

      const userPrompt =
        `Entity: ${entityName} (${entityType})\nLevel: ${nextLevel}\n\nFragments:\n` + obs.map((o) => `- ${o.text}`).join("\n");

      let summaryText: string;
      try {
        const ollamaMod: any = await import("ollama");
        const ollamaClient: any = ollamaMod?.default ?? ollamaMod;
        const response = await ollamaClient.chat({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });
        summaryText = (response as any)?.message?.content?.trim?.() ?? "";
      } catch (e: any) {
        console.warn(`[Janitor] Ollama error for ${entityName}: ${e.message}. Using fallback concatenation.`);
        summaryText = "Summary (Fallback): " + obs.map(o => o.text).join("; ");
      }

      if (!summaryText || summaryText.trim() === "" || summaryText.trim().toUpperCase() === "DELETE") {
        summaryText = "Summary (Fallback): " + obs.map((o) => o.text).join("; ");
      }

      let executiveSummaryEntityId: string | null = null;
      let executiveSummaryObservationId: string | null = null;
      if (summaryText && summaryText.trim() !== "") {
        const nowIso = new Date().toISOString();
        const execEntity = await this.createEntity({
          name: `${entityName} — Executive Summary L${nextLevel} (${nowIso.slice(0, 10)})`,
          type: "ExecutiveSummary",
          metadata: {
            janitor: {
              kind: "executive_summary",
              level: nextLevel,
              model,
              summarized_at: nowIso,
              source_entity_id: entity_id,
              source_entity_name: entityName,
              source_entity_type: entityType,
              source_observation_ids: obs.map((o) => o.obs_id),
              source_time_range: { min_ts: minTs, max_ts: maxTs },
              older_than_days: olderThanDays,
            },
          },
        });

        executiveSummaryEntityId = (execEntity as any)?.id ?? null;
        if (executiveSummaryEntityId) {
          await this.createRelation({
            from_id: executiveSummaryEntityId,
            to_id: entity_id,
            relation_type: "summary_of",
            strength: 1,
            metadata: {
              janitor: {
                kind: "executive_summary",
                level: nextLevel,
                model,
                summarized_at: nowIso,
                source_observation_ids: obs.map((o) => o.obs_id),
                source_time_range: { min_ts: minTs, max_ts: maxTs },
              },
            },
          });

          const added = await this.addObservation({
            entity_id: executiveSummaryEntityId,
            text: summaryText,
            metadata: {
              janitor: {
                kind: "executive_summary",
                level: nextLevel,
                source_entity_id: entity_id,
                source_observation_ids: obs.map((o) => o.obs_id),
                model,
                summarized_at: nowIso,
                source_time_range: { min_ts: minTs, max_ts: maxTs },
              },
            },
          });
          executiveSummaryObservationId = (added as any)?.id ?? null;

          await this.createRelation({
            from_id: summary_entity_id,
            to_id: executiveSummaryEntityId,
            relation_type: "generated",
            strength: 1,
            metadata: { source_entity_id: entity_id },
          });
        }
      }

      for (const o of obs) {
        await this.db.run(
          `{ ?[id, created_at] := *observation{id, created_at}, id = $id :rm observation {id, created_at} }`,
          { id: o.obs_id },
        );
      }

      await this.createRelation({
        from_id: summary_entity_id,
        to_id: entity_id,
        relation_type: "summarizes",
        strength: 1,
        metadata: {
          deleted_observation_ids: obs.map((o) => o.obs_id),
          executive_summary_entity_id: executiveSummaryEntityId,
          executive_summary_observation_id: executiveSummaryObservationId,
          level: nextLevel,
        },
      });

      results.push({
        entity_id,
        entity_name: entityName,
        status: executiveSummaryEntityId ? "consolidated" : "deleted_only",
        deleted_observation_ids: obs.map((o) => o.obs_id),
        executive_summary_entity_id: executiveSummaryEntityId,
        executive_summary_observation_id: executiveSummaryObservationId,
        level: nextLevel,
      });
    }

    return {
      status: "completed",
      summary_entity_id,
      processed_entities: results.length,
      deleted_observations: picked.length,
      cache_deleted: cacheDeletedCount,
      results,
    };
  }

  public async advancedSearch(args: Parameters<HybridSearch['advancedSearch']>[0]) {
    await this.initPromise;
    return this.hybridSearch.advancedSearch(args);
  }

  public async recomputeCommunities() {
    await this.initPromise;

    // Check if there are any edges before running LabelPropagation
    // LabelPropagation in CozoDB currently panics on empty input relations
    const edgeCheckRes = await this.db.run(`?[from_id] := *relationship{from_id, @ "NOW"} :limit 1`);
    const hasEdges = edgeCheckRes.rows.length > 0;

    if (!hasEdges) {
      console.error("[Communities] No relationships found, skipping LabelPropagation.");
      return [];
    }

    const query = `
      edges[f, t, s] := *relationship{from_id: f, to_id: t, strength: s, @ "NOW"}
      temp_communities[community_id, entity_id] <~ LabelPropagation(edges[f, t, s])
      ?[entity_id, community_id] := temp_communities[community_id, entity_id]
    `;
    const result = await this.db.run(query);

    for (const row of result.rows as any[]) {
      const entity_id = String(row[0]);
      const community_id = String(row[1]);
      await this.db.run(
        `?[entity_id, community_id] <- [[$entity_id, $community_id]]
         :put entity_community {entity_id => community_id}`,
        { entity_id, community_id },
      );
    }

    return result.rows.map((r: any) => ({ entity_id: String(r[0]), community_id: String(r[1]) }));
  }

  public async recomputeBetweennessCentrality() {
    await this.initPromise;

    const edgeCheckRes = await this.db.run(`?[from_id] := *relationship{from_id, @ "NOW"} :limit 1`);
    if (edgeCheckRes.rows.length === 0) {
      console.error("[Betweenness] No relationships found, skipping Betweenness Centrality.");
      return [];
    }

    const query = `
      edges[f, t] := *relationship{from_id: f, to_id: t, @ "NOW"}
      temp_betweenness[entity_id, centrality] <~ BetweennessCentrality(edges[f, t])
      ?[entity_id, centrality] := temp_betweenness[entity_id, centrality]
    `.trim();

    try {
      const result = await this.db.run(query);
      console.error(`[Betweenness] ${result.rows.length} entities calculated.`);
      return result.rows.map((r: any) => ({ entity_id: String(r[0]), centrality: Number(r[1]) }));
    } catch (e: any) {
      console.error("[Betweenness] Error during calculation:", e.message);
      return [];
    }
  }

  public async recomputeConnectedComponents() {
    await this.initPromise;

    const edgeCheckRes = await this.db.run(`?[from_id] := *relationship{from_id, @ "NOW"} :limit 1`);
    if (edgeCheckRes.rows.length === 0) {
      console.error("[ConnectedComponents] No relationships found.");
      return [];
    }

    const query = `
      edges[f, t] := *relationship{from_id: f, to_id: t, @ "NOW"}
      temp_components[entity_id, component_id] <~ ConnectedComponents(edges[f, t])
      ?[entity_id, component_id] := temp_components[entity_id, component_id]
    `.trim();

    try {
      const result = await this.db.run(query);
      return result.rows.map((r: any) => ({ entity_id: String(r[0]), component_id: String(r[1]) }));
    } catch (e: any) {
      console.error("[ConnectedComponents] Calculation error:", e.message);
      return [];
    }
  }

  public async computeShortestPath(args: { start_entity: string; end_entity: string }) {
    await this.initPromise;
    const query = `
      edges[f, t, s] := *relationship{from_id: f, to_id: t, strength: s, @ "NOW"}
      start_n[ns] <- [[$start]]
      end_n[ng] <- [[$end]]
      ?[s_node, g_node, dist, path] <~ ShortestPathDijkstra(edges[f, t, s], start_n[ns], end_n[ng])
    `;
    try {
      const result = await this.db.run(query.replace(/^\s+/gm, '').trim(), { start: args.start_entity, end: args.end_entity });
      if (result.rows.length === 0) return null;
      return {
        start: result.rows[0][0],
        goal: result.rows[0][1],
        distance: result.rows[0][2],
        path: result.rows[0][3]
      };
    } catch (e: any) {
      console.error("[ShortestPath] Calculation error:", e.message);
      return null;
    }
  }

  public async recomputeHITS() {
    await this.initPromise;

    const edgeCheckRes = await this.db.run(`?[from_id] := *relationship{from_id, @ "NOW"} :limit 1`);
    if (edgeCheckRes.rows.length === 0) return [];

    const query = `
      edges[f, t] := *relationship{from_id: f, to_id: t, @ "NOW"}
      nodes[n] := edges[n, _]
      nodes[n] := edges[_, n]
      initial_auth[n, v] := nodes[n], v = 1.0
      initial_hub[n, v] := nodes[n], v = 1.0
      auth1[v, sum(h)] := edges[u, v], initial_hub[u, h]
      hub1[u, sum(a)] := edges[u, v], auth1[v, a]
      ?[entity_id, auth_score, hub_score] := auth1[entity_id, auth_score], hub1[entity_id, hub_score]
    `;

    try {
      const result = await this.db.run(query.replace(/^\s+/gm, '').trim());
      return result.rows.map((r: any) => ({ entity_id: String(r[0]), authority: Number(r[1]), hub: Number(r[2]) }));
    } catch (e: any) {
      console.error("[HITS] Calculation error:", e.message);
      return [];
    }
  }

  public async recomputePageRank() {
    await this.initPromise;

    const edgeCheckRes = await this.db.run(`?[from_id] := *relationship{from_id, @ "NOW"} :limit 1`);
    if (edgeCheckRes.rows.length === 0) {
      console.error("[PageRank] No relationships found, skipping PageRank.");
      return [];
    }

    const query = `
      edges[f, t, s] := *relationship{from_id: f, to_id: t, strength: s, @ "NOW"}
      temp_rank[entity_id, rank] <~ PageRank(edges[f, t, s])
      ?[entity_id, rank] := temp_rank[entity_id, rank]
    `.trim();
    
    try {
      const result = await this.db.run(query);
      
      // Save results
      for (const row of result.rows as any[]) {
        const entity_id = String(row[0]);
        const pagerank = Float64Array.from([row[1]])[0]; // Ensure it is a float
        await this.db.run(
          `?[entity_id, pagerank] <- [[$entity_id, $pagerank]]
           :put entity_rank {entity_id => pagerank}`,
          { entity_id, pagerank }
        );
      }
      
      console.error(`[PageRank] ${result.rows.length} entities ranked.`);
      return result.rows.map((r: any) => ({ entity_id: String(r[0]), pagerank: Number(r[1]) }));
    } catch (e: any) {
      console.error("[PageRank] Calculation error:", e.message);
      return [];
    }
  }

  private async setupSchema() {
    try {
      console.error("[Schema] Initializing schema...");
      
      const existingRelations = await this.db.run("::relations");
      const relations = existingRelations.rows.map((r: any) => r[0]);

      // Entity Table
      if (!relations.includes("entity")) {
        try {
          await this.db.run(`{:create entity {id: String, created_at: Validity => name: String, type: String, embedding: <F32; ${EMBEDDING_DIM}>, name_embedding: <F32; ${EMBEDDING_DIM}>, metadata: Json}}`);
          console.error("[Schema] Entity table created.");
        } catch (e: any) {
          console.error("[Schema] Entity table error:", e.message);
        }
      } else {
        const timeTravelReady = await this.isTimeTravelReady("entity");

        // Check if name_embedding exists (v1.7 Multi-Vector Support)
        const columnsRes = await this.db.run(`::columns entity`);
        const columns = columnsRes.rows.map((r: any) => r[0]);

        if (!columns.includes("name_embedding") || !timeTravelReady) {
          // Drop indices before migration
          try { await this.db.run("::hnsw drop entity:semantic"); } catch (e) {}
          try { await this.db.run("::hnsw drop entity:name_semantic"); } catch (e) {}
          try { await this.db.run("::fts drop entity:fts"); } catch (e) {}
          
          const typesToDrop = ['person', 'project', 'task', 'note'];
          for (const type of typesToDrop) {
            try { await this.db.run(`::hnsw drop entity:semantic_${type}`); } catch (e) {}
          }
          
          if (!columns.includes("name_embedding")) {
            await this.db.run(`
              ?[id, created_at, name, type, embedding, name_embedding, metadata] :=
                *entity{id, name, type, embedding, metadata, created_at: created_at_raw},
                created_at = [created_at_raw, true],
                name_embedding = embedding
              :replace entity {id: String, created_at: Validity => name: String, type: String, embedding: <F32; ${EMBEDDING_DIM}>, name_embedding: <F32; ${EMBEDDING_DIM}>, metadata: Json}
            `);
            console.error("[Schema] Entity Tabelle migriert (Multi-Vector Support).");
          } else {
            await this.db.run(`
              ?[id, created_at, name, type, embedding, name_embedding, metadata] :=
                *entity{id, name, type, embedding, name_embedding, metadata, created_at: created_at_raw},
                created_at = [created_at_raw, true]
              :replace entity {id: String, created_at: Validity => name: String, type: String, embedding: <F32; ${EMBEDDING_DIM}>, name_embedding: <F32; ${EMBEDDING_DIM}>, metadata: Json}
            `);
            console.error("[Schema] Entity table migrated (Validity).");
          }
        }
      }

      try {
        await this.db.run(`{::hnsw create entity:semantic {dim: ${EMBEDDING_DIM}, m: 16, dtype: F32, fields: [embedding], distance: Cosine, ef_construction: 200}}`);
        console.error("[Schema] Entity HNSW index created.");
      } catch (e: any) {
        // We mostly ignore index errors, as ::hnsw create has no simple check
        if (!e.message.includes("already exists") && !e.message.includes("unexpected input")) {
            console.error("[Schema] Entity index notice:", e.message);
        }
      }

      try {
        await this.db.run(`{::hnsw create entity:name_semantic {dim: ${EMBEDDING_DIM}, m: 16, dtype: F32, fields: [name_embedding], distance: Cosine, ef_construction: 200}}`);
        console.error("[Schema] Entity Name-HNSW index created.");
      } catch (e: any) {
        if (!e.message.includes("already exists") && !e.message.includes("unexpected input")) {
            console.error("[Schema] Entity name-index notice:", e.message);
        }
      }

      // Filtered HNSW indices for common types (v1.7)
      const commonTypes = ['Person', 'Project', 'Task', 'Note'];
      for (const type of commonTypes) {
        try {
          await this.db.run(`{::hnsw create entity:semantic_${type.toLowerCase()} {dim: ${EMBEDDING_DIM}, m: 16, dtype: F32, fields: [embedding], distance: Cosine, ef_construction: 200, filter: type == '${type}'}}`);
          console.error(`[Schema] Entity HNSW index for ${type} created.`);
        } catch (e: any) {
          if (!e.message.includes("already exists") && !e.message.includes("unexpected input")) {
              console.error(`[Schema] Entity index (${type}) notice:`, e.message);
          }
        }
      }

      // Observation Table
      if (!relations.includes("observation")) {
        try {
          await this.db.run(`{:create observation {id: String, created_at: Validity => entity_id: String, text: String, embedding: <F32; ${EMBEDDING_DIM}>, metadata: Json}}`);
          console.error("[Schema] Observation table created.");
        } catch (e: any) {
          console.error("[Schema] Observation table error:", e.message);
        }
      } else {
        const timeTravelReady = await this.isTimeTravelReady("observation");
        if (!timeTravelReady) {
          // Drop indices before migration
          try { await this.db.run("::hnsw drop observation:semantic"); } catch (e) {}
          try { await this.db.run("::fts drop observation:fts"); } catch (e) {}
          try { await this.db.run("::lsh drop observation:lsh"); } catch (e) {}

          await this.db.run(`
            ?[id, created_at, entity_id, text, embedding, metadata] :=
              *observation{id, entity_id, text, embedding, metadata, created_at: created_at_raw},
              created_at = [created_at_raw, true]
            :replace observation {id: String, created_at: Validity => entity_id: String, text: String, embedding: <F32; ${EMBEDDING_DIM}>, metadata: Json}
          `);
          console.error("[Schema] Observation table migrated (Validity).");
        }
      }
      
      try {
        await this.db.run(`{::hnsw create observation:semantic {dim: ${EMBEDDING_DIM}, m: 16, dtype: F32, fields: [embedding], distance: Cosine, ef_construction: 200}}`);
        console.error("[Schema] Observation HNSW index created.");
      } catch (e: any) {
        if (!e.message.includes("already exists") && !e.message.includes("unexpected input")) {
            console.error("[Schema] Observation index notice:", e.message);
        }
      }

      // FTS Indices (v0.7 Feature)
      try {
        await this.db.run(`
          ::fts create entity:fts {
            extractor: name,
            tokenizer: Simple,
            filters: [Lowercase, Stemmer('english'), Stopwords('en')]
          }
        `);
        console.error("[Schema] Entity FTS index created.");
      } catch (e: any) {
        if (!e.message.includes("already exists")) {
          console.error("[Schema] Entity FTS error:", e.message);
        }
      }

      try {
        await this.db.run(`
          ::fts create observation:fts {
            extractor: text,
            tokenizer: Simple,
            filters: [Lowercase, Stemmer('english'), Stopwords('en')]
          }
        `);
        console.error("[Schema] Observation FTS index created.");
      } catch (e: any) {
        if (!e.message.includes("already exists")) {
          console.error("[Schema] Observation FTS error:", e.message);
        }
      }

      // LSH Index (v0.7 Feature)
      try {
        await this.db.run(`
          ::lsh create observation:lsh {
            extractor: text,
            tokenizer: Simple,
            n_gram: 3,
            n_perm: 200,
            target_threshold: 0.5
          }
        `);
        console.error("[Schema] Observation LSH index created.");
      } catch (e: any) {
        if (!e.message.includes("already exists")) {
          console.error("[Schema] Observation LSH error:", e.message);
        }
      }

      // Semantic Cache Table (v0.8+)
      if (!relations.includes("search_cache")) {
        try {
          await this.db.run(`{:create search_cache {query_hash: String => query_text: String, results: Json, options: Json, embedding: <F32; ${EMBEDDING_DIM}>, created_at: Int}}`);
          console.error("[Schema] Search Cache table created.");
          
          await this.db.run(`{::hnsw create search_cache:semantic {dim: ${EMBEDDING_DIM}, m: 16, dtype: F32, fields: [embedding], distance: Cosine, ef_construction: 200}}`);
          console.error("[Schema] Search Cache HNSW index created.");
        } catch (e: any) {
          console.error("[Schema] Search Cache setup error:", e.message);
        }
      }

      // Relationship Table
      if (!relations.includes("relationship")) {
        try {
          await this.db.run('{:create relationship {from_id: String, to_id: String, relation_type: String, created_at: Validity => strength: Float, metadata: Json}}');
          console.error("[Schema] Relationship table created.");
        } catch (e: any) {
          console.error("[Schema] Relationship table error:", e.message);
        }
      } else {
        const timeTravelReady = await this.isTimeTravelReady("relationship");
        if (!timeTravelReady) {
          // No indices to drop for relationship usually, but let's check
          await this.db.run(`
            ?[from_id, to_id, relation_type, created_at, strength, metadata] :=
              *relationship{from_id, to_id, relation_type, strength, metadata, created_at: created_at_raw},
              created_at = [created_at_raw, true]
            :replace relationship {from_id: String, to_id: String, relation_type: String, created_at: Validity => strength: Float, metadata: Json}
          `);
          console.error("[Schema] Relationship table migrated (Validity).");
        }
      }

      // Entity Community Table
      if (!relations.includes("entity_community")) {
        try {
          await this.db.run('{:create entity_community {entity_id: String => community_id: String}}');
          console.error("[Schema] Entity Community table created.");
        } catch (e: any) {
          console.error("[Schema] Entity Community table error:", e.message);
        }
      } else {
        try {
          await this.db.run(`
            ?[entity_id, community_id] :=
              *entity_community{entity_id, community_id}
            :replace entity_community {entity_id: String => community_id: String}
          `);
          console.error("[Schema] Entity Community table migrated (Key-Value).");
        } catch (e: any) {
          console.error("[Schema] Entity Community migration notice:", e.message);
        }
      }

      // Entity Rank Table (PageRank Scores)
      if (!relations.includes("entity_rank")) {
        try {
          await this.db.run('{:create entity_rank {entity_id: String => pagerank: Float}}');
          console.error("[Schema] Entity Rank table created.");
        } catch (e: any) {
          console.error("[Schema] Entity Rank table error:", e.message);
        }
      }

      // Memory Snapshot Table
      if (!relations.includes("memory_snapshot")) {
        try {
          await this.db.run('{:create memory_snapshot {snapshot_id => entity_count: Int, observation_count: Int, relation_count: Int, metadata: Json, created_at: Int}}');
          console.error("[Schema] Snapshot table created.");
        } catch (e: any) {
          console.error("[Schema] Snapshot table error:", e.message);
        }
      }

      if (!relations.includes("inference_rule")) {
        try {
          await this.db.run('{:create inference_rule {id: String => name: String, datalog: String, created_at: Int}}');
          console.error("[Schema] Inference Rule table created.");
        } catch (e: any) {
          console.error("[Schema] Inference Rule table error:", e.message);
        }
      } else {
        // Migration: Check if created_at exists
        try {
          const cols = await this.db.run('::columns inference_rule');
          const hasCreatedAt = cols.rows.some((r: any) => r[0] === 'created_at');
          if (!hasCreatedAt) {
            console.error("[Schema] Migration: Adding created_at to inference_rule...");
            await this.db.run(`
              ?[id, name, datalog, created_at] := *inference_rule{id, name, datalog}, created_at = 0
              :replace inference_rule {id: String => name: String, datalog: String, created_at: Int}
            `);
            console.error("[Schema] Migration: inference_rule successfully updated.");
          }
        } catch (e: any) {
          console.error("[Schema] Inference Rule migration error:", e.message);
        }
      }

      // Triggers for Data Integrity (v0.5+)
      // Triggers disabled for now due to syntax issues with current CozoDB version
      /*
      try {
        await this.db.run(`
          ::set_triggers relationship on put {
            ?[from_id] := _new{from_id, to_id}, from_id == to_id :assert empty
          }
        `);
        console.error("[Schema] Trigger 'check_no_self_loops' created.");
      } catch (e: any) {
        // Fallback for environment where ::set_triggers might have slightly different behavior
        try {
          await this.db.run(`
            ::set_triggers relationship {
              "check_no_self_loops": {
                "on": "put",
                "query": "?[from_id] := _new{from_id, to_id}, from_id == to_id :assert empty"
              }
            }
          `);
          console.error("[Schema] Trigger 'check_no_self_loops' created (Fallback).");
        } catch (e2: any) {
          console.error("[Schema] Relationship Trigger error:", e.message);
        }
      }
      */

      // Triggers disabled for now due to syntax issues with current CozoDB version
      /*
      try {
        // This trigger prevents an entity from being marked as 'active' and 'discontinued' at the same time
        // if this information is explicitly in the metadata.
        await this.db.run(`
          ::set_triggers entity on put {
            ?[id] := _new{id, metadata}, 
            (get(metadata, 'status') == 'aktiv' || get(metadata, 'status') == 'active'), 
            (get(metadata, 'archived') == true || get(metadata, 'status') == 'eingestellt') 
            :assert empty
          }
        `);
        console.error("[Schema] Trigger 'check_metadata_conflict' created.");
      } catch (e: any) {
        try {
          await this.db.run(`
            ::set_triggers entity {
              "check_metadata_conflict": {
                "on": "put",
                "query": "?[id] := _new{id, metadata}, (get(metadata, 'status') == 'aktiv' || get(metadata, 'status') == 'active'), (get(metadata, 'archived') == true || get(metadata, 'status') == 'eingestellt') :assert empty"
              }
            }
          `);
          console.error("[Schema] Trigger 'check_metadata_conflict' created (Fallback).");
        } catch (e2: any) {
          console.error("[Schema] Entity Metadata Trigger error:", e.message);
        }
      }
      */

      // User Profile Initialization
      await this.initUserProfile();

      console.error("CozoDB Schema Setup completed.");
    } catch (error: any) {
      console.error("Unexpected error during schema setup:", error);
    }
  }

  private async isTimeTravelReady(relationName: string) {
    try {
      const keyField = relationName === "relationship" ? "from_id" : "id";
      await this.db.run(`?[k] := *${relationName}{${keyField}: k, @ "NOW"} :limit 1`);
      return true;
    } catch {
      return false;
    }
  }

  public async graph_walking(args: { query: string, start_entity_id?: string, max_depth?: number, limit?: number }) {
    try {
      const queryEmbedding = await this.embeddingService.embed(args.query);
      const limit = args.limit || 5;
      const maxDepth = args.max_depth || 3;

      let seedQuery;
      let params: any = { 
        query_vector: queryEmbedding, 
        limit: limit, 
        max_depth: maxDepth,
        topk: 100, // Increased for graph walking
        ef_search: 100
      };

      if (args.start_entity_id) {
        params.start_id = args.start_entity_id;
        seedQuery = `seeds[id, score] := id = $start_id, score = 1.0`;
      } else {
        seedQuery = `seeds[id, score] := ~entity:semantic{id | query: vec($query_vector), k: $topk, ef: $ef_search, bind_distance: dist}, score = 1.0 - dist`;
      }

      const datalog = `
        rank_val[id, r] := *entity_rank{entity_id: id, pagerank: r}
        rank_val[id, r] := *entity{id, @ "NOW"}, not *entity_rank{entity_id: id}, r = 0.0

        ${seedQuery}

        path[start_id, current_id, d, path_score] := seeds[start_id, s], current_id = start_id, d = 0, path_score = s
        
        path[start_id, next_id, d_new, path_score_new] := 
          path[start_id, current_id, d, path_score],
          *relationship{from_id: current_id, to_id: next_id, @ "NOW"},
          d < $max_depth,
          d_new = d + 1,
          ~entity:semantic{id: next_id | query: vec($query_vector), k: $topk, ef: $ef_search, bind_distance: dist},
          sim = 1.0 - dist,
          sim > 0.5,
          path_score_new = path_score * sim * (1.0 - 0.1 * d_new)
        
        path[start_id, next_id, d_new, path_score_new] := 
          path[start_id, current_id, d, path_score],
          *relationship{to_id: current_id, from_id: next_id, @ "NOW"},
          d < $max_depth,
          d_new = d + 1,
          ~entity:semantic{id: next_id | query: vec($query_vector), k: $topk, ef: $ef_search, bind_distance: dist},
          sim = 1.0 - dist,
          sim > 0.5,
          path_score_new = path_score * sim * (1.0 - 0.1 * d_new)

        result_entities[id, max_score] := path[_, id, _, s], max_score = max(s)
        
        ?[id, name, type, score, pr] := 
          result_entities[id, s], 
          *entity{id, name, type, @ "NOW"}, 
          rank_val[id, pr],
          score = s * (1.0 + pr)

        ?[id, name, type, score, pr] := 
          result_entities[id, s], 
          *entity{id, name, type, @ "NOW"}, 
          not rank_val[id, _],
          pr = 0.0,
          score = s
        
        :sort -score
        :limit $limit
      `;

      const res = await this.db.run(datalog, params);
      return res.rows.map((r: any) => ({
        id: r[0],
        name: r[1],
        type: r[2],
        score: r[3],
        pagerank: r[4]
      }));
    } catch (error: any) {
      console.error("Error in graph_walking:", error);
      return { error: error.message };
    }
  }

  private resolveValiditySpec(as_of?: string) {
    if (!as_of || as_of === "NOW") return '"NOW"';
    
    // Check if it's a numeric timestamp
    if (/^\d+$/.test(as_of)) {
      let ts = parseInt(as_of, 10);
      // If it looks like microseconds (16 digits), convert to millis for Date
      if (as_of.length >= 15) {
        ts = Math.floor(ts / 1000);
      }
      return `'${new Date(ts).toISOString()}'`;
    }

    const parsed = Date.parse(as_of);
    if (!Number.isFinite(parsed)) return null;
    // Format as string 'YYYY-MM-DDTHH:mm:ss.sssZ' for CozoDB
    return `'${new Date(parsed).toISOString()}'`;
  }

  private async formatInferredRelationsForContext(
    relations: Array<{ from_id: string; to_id: string; relation_type: string; confidence: number; reason: string }>,
  ): Promise<
    Array<{
      from_id: string;
      to_id: string;
      relation_type: string;
      confidence: number;
      reason: string;
      is_inferred: true;
      from_name?: string;
      from_type?: string;
      to_name?: string;
      to_type?: string;
      uncertainty_hint: string;
    }>
  > {
    const uniqueIds = Array.from(new Set(relations.flatMap((r) => [r.from_id, r.to_id]).filter(Boolean)));
    const nameById = new Map<string, { name: string; type: string }>();

    await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          const res = await this.db.run('?[name, type] := *entity{id: $id, name, type, @ "NOW"} :limit 1', { id });
          if (res.rows.length > 0) nameById.set(id, { name: String(res.rows[0][0]), type: String(res.rows[0][1]) });
        } catch {
        }
      }),
    );

    return relations.map((r) => {
      const fromMeta = nameById.get(r.from_id);
      const toMeta = nameById.get(r.to_id);
      const fromName = fromMeta?.name ?? r.from_id;
      const toName = toMeta?.name ?? r.to_id;
      const edgePart = r.relation_type === "expert_in" ? `Expertise for ${toName}` : `${r.relation_type} -> ${toName}`;
      return {
        ...r,
        is_inferred: true as const,
        from_name: fromMeta?.name,
        from_type: fromMeta?.type,
        to_name: toMeta?.name,
        to_type: toMeta?.type,
        uncertainty_hint: `Presumably ${fromName} (${edgePart}), because ${r.reason}`,
      };
    });
  }

  public async createEntity(args: { name: string, type: string, metadata?: any }) {
    try {
      if (!args.name || args.name.trim() === "") {
        return { error: "Entity name must not be empty" };
      }
      if (!args.type || args.type.trim() === "") {
        return { error: "Entity type must not be empty" };
      }

      // Check for existing entity with same name (case-insensitive)
      const existingId = await this.findEntityIdByName(args.name);
      if (existingId) {
        return { id: existingId, name: args.name, type: args.type, status: "Entity already exists (Name-Match)" };
      }

      // Conflict Detection (Application-Level Fallback for Triggers)
      if (args.metadata) {
        const status = args.metadata.status || "";
        const isArchived = args.metadata.archived === true;
        const isAktiv = status === "aktiv" || status === "active";
        const isEingestellt = status === "eingestellt" || isArchived;

        if (isAktiv && isEingestellt) {
          throw new Error(`Conflict detected: Entity '${args.name}' cannot be 'active' and 'discontinued' at the same time.`);
        }
      }

      const id = uuidv4();
      return this.createEntityWithId(id, args.name, args.type, args.metadata);
    } catch (error: any) {
      console.error("Error in create_entity:", error);
      if (error.display) {
        console.error("CozoDB Error Details:", error.display);
      }
      return { 
        error: "Internal error creating entity", 
        message: error.message || String(error),
        details: error.stack,
        cozo_display: error.display
      };
    }
  }

  private async createEntityWithId(id: string, name: string, type: string, metadata?: any) {
    const embedding = await this.embeddingService.embed(`${name} ${type}`);
    const name_embedding = await this.embeddingService.embed(name);
    console.error(`[Debug] Embeddings created for ${name}.`);

    // Use direct vector binding for performance and to avoid long string issues
    const now = Date.now() * 1000;
    await this.db.run(`
      ?[id, created_at, name, type, embedding, name_embedding, metadata] <- [
        [$id, [${now}, true], $name, $type, $embedding, $name_embedding, $metadata]
      ] :insert entity {id, created_at => name, type, embedding, name_embedding, metadata}
    `, { id, name, type, embedding, name_embedding, metadata: metadata || {} });

    return { id, name, type, status: "Entity created" };
  }

  private async initUserProfile() {
    try {
      const res = await this.db.run('?[id] := *entity{id, @ "NOW"}, id = $id', { id: USER_ENTITY_ID });
      if (res.rows.length === 0) {
        console.error("[User] Initializing global user profile...");
        await this.createEntityWithId(USER_ENTITY_ID, USER_ENTITY_NAME, USER_ENTITY_TYPE, { is_global_user: true });
        
        await this.addObservation({
          entity_id: USER_ENTITY_ID,
          text: "This is the global user profile for preferences and work styles.",
          metadata: { kind: "system_init" }
        });
        console.error("[User] Global user profile created.");
      }
    } catch (e: any) {
      console.error("[User] Error initializing user profile:", e.message);
    }
  }

  public async updateEntity(args: { id: string, name?: string, type?: string, metadata?: any }) {
    try {
      const current = await this.db.run('?[name, type, metadata] := *entity{id: $id, name, type, metadata, @ "NOW"}', { id: args.id });
      if (current.rows.length === 0) return { error: "Entity not found" };

      const name = args.name ?? current.rows[0][0];
      const type = args.type ?? current.rows[0][1];
      
      // Conflict Detection (Application-Level Fallback for Triggers)
      const mergedMetadata = { ...(current.rows[0][2] || {}), ...(args.metadata || {}) };
      const status = mergedMetadata.status || "";
      const isArchived = mergedMetadata.archived === true;
      const isAktiv = status === "aktiv" || status === "active";
      const isEingestellt = status === "eingestellt" || isArchived;

      if (isAktiv && isEingestellt) {
        throw new Error(`Conflict detected: Entity '${name}' cannot be 'active' and 'discontinued' at the same time.`);
      }

      // Check if the new name already exists for a DIFFERENT entity
      if (args.name && args.name !== current.rows[0][0]) {
        const existingId = await this.findEntityIdByName(args.name);
        if (existingId && existingId !== args.id) {
          return { error: `Name '${args.name}' is already used by another entity (${existingId}).` };
        }
      }

      const embedding = await this.embeddingService.embed(`${name} ${type}`);
      const name_embedding = await this.embeddingService.embed(name);
      const now = Date.now() * 1000;
      
      // Using v0.7 :update and ++ for metadata merge (v1.7 Multi-Vector)
      await this.db.run(`
        ?[id, created_at, name, type, embedding, name_embedding, metadata] := 
          *entity{id, created_at, metadata: old_meta, @ "NOW"},
          id = $id,
          name = $name,
          type = $type,
          embedding = $embedding,
          name_embedding = $name_embedding,
          metadata = old_meta ++ $new_meta
        :update entity {id, created_at, name, type, embedding, name_embedding, metadata}
      `, { 
        id: args.id, 
        name, 
        type, 
        embedding, 
        name_embedding,
        new_meta: args.metadata || {} 
      });

      return { status: "Entity updated", id: args.id };
    } catch (error: any) {
      console.error("Error in update_entity:", error);
      return {
        error: "Internal error updating entity",
        message: error.message || String(error),
        details: error.stack,
        cozo_display: error.display
      };
    }
  }

  public async addObservation(args: { entity_id?: string; entity_name?: string; entity_type?: string; text: string; metadata?: any; deduplicate?: boolean }) {
    try {
      if (!args.text || args.text.trim() === "") {
        return { error: "Observation text must not be empty" };
      }

      const deduplicate = args.deduplicate ?? true;

      let entityId: string;

      if (args.entity_id) {
        const entityRes = await this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: args.entity_id });
        if (entityRes.rows.length === 0) {
          return { error: `Entity with ID '${args.entity_id}' not found` };
        }
        entityId = args.entity_id;
      } else {
        const entityName = (args.entity_name ?? "").trim();
        if (!entityName) return { error: "For ingest, 'entity_id' or 'entity_name' is mandatory to assign data." };
        const existing = await this.findEntityIdByName(entityName);
        if (existing) {
          entityId = existing;
        } else {
          const created = await this.createEntity({
            name: entityName,
            type: (args.entity_type ?? "Unknown").trim() || "Unknown",
            metadata: {},
          });
          if ((created as any)?.error) return created;
          entityId = (created as any).id;
        }
      }

      const id = uuidv4();
      const embedding = await this.embeddingService.embed(args.text);

      // Check for duplicates (using v0.7 features)
      if (deduplicate) {
        try {
          // 1. Exact match check
          const exact = await this.db.run(
            '?[existing_id, existing_text] := *observation{entity_id: $entity, id: existing_id, text: existing_text, @ "NOW"}, existing_text == $text :limit 1',
            { entity: entityId, text: args.text },
          );
          if (exact.rows.length > 0) {
            const [existingId, existingText] = exact.rows[0];
            return {
              status: 'duplicate_detected',
              existing_observation_id: existingId,
              similarity: 1.0,
              suggestion: 'Exact same observation already exists.',
              text: existingText
            };
          }

          // 2. Near-duplicate check via LSH (v0.7)
          // Note: bind_distance is not supported in LSH, using k: 1 instead
          const nearDup = await this.db.run(
            `
            ?[existing_id, existing_text] :=
              ~observation:lsh {id: existing_id, text: existing_text | query: $text, k: 1},
              *observation {id: existing_id, entity_id: $entity, @ "NOW"}
            :limit 1
            `,
            { text: args.text, entity: entityId }
          );

          if (nearDup.rows.length > 0) {
            const [existingId, existingText] = nearDup.rows[0];
            return {
              status: 'duplicate_detected',
              existing_observation_id: existingId,
              similarity: 0.9, // Estimate, as LSH only returns hits within threshold
              suggestion: 'Very similar observation found (LSH Match).',
              text: existingText
            };
          }
        } catch (e: any) {
          console.warn("[AddObservation] Duplicate check via LSH failed:", e.message);
        }
      }

      const now = Date.now() * 1000;
      await this.db.run(`
        ?[id, created_at, entity_id, text, embedding, metadata] <- [
          [$id, [${now}, true], $entity_id, $text, $embedding, $metadata]
        ] :insert observation {id, created_at => entity_id, text, embedding, metadata}
      `, { id, entity_id: entityId, text: args.text, embedding, metadata: args.metadata || {} });

      // Optional: Automatic inference after new observation (in background)
      const suggestionsRaw = await this.inferenceEngine.inferRelations(entityId);
      const suggestions = await this.formatInferredRelationsForContext(suggestionsRaw);

      return { 
        id, 
        entity_id: entityId, 
        status: "Observation saved", 
        inferred_suggestions: suggestions 
      };
    } catch (error: any) {
      return { error: error.message || "Unknown error" };
    }
  }

  public async createRelation(args: { from_id: string, to_id: string, relation_type: string, strength?: number, metadata?: any }) {
    if (args.from_id === args.to_id) {
      return { error: "Self-references in relationships are not allowed" };
    }

    // Check if both entities exist
    const [fromEntity, toEntity] = await Promise.all([
      this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: args.from_id }),
      this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: args.to_id })
    ]);

    if (fromEntity.rows.length === 0) {
      return { error: `Source entity with ID '${args.from_id}' not found` };
    }
    if (toEntity.rows.length === 0) {
      return { error: `Target entity with ID '${args.to_id}' not found` };
    }

    const now = Date.now() * 1000;
    await this.db.run(`?[from_id, to_id, relation_type, created_at, strength, metadata] <- [[$from_id, $to_id, $relation_type, [${now}, true], $strength, $metadata]] :insert relationship {from_id, to_id, relation_type, created_at => strength, metadata}`, {
      from_id: args.from_id,
      to_id: args.to_id,
      relation_type: args.relation_type,
      strength: args.strength ?? 1.0,
      metadata: args.metadata || {}
    });

    return { status: "Relationship created" };
  }

  public async exploreGraph(args: { start_entity: string; end_entity?: string; max_hops?: number; relation_types?: string[] }) {
    await this.initPromise;

    // Check if start entity exists
    const startRes = await this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: args.start_entity });
    if (startRes.rows.length === 0) {
      throw new Error(`Start entity with ID '${args.start_entity}' not found`);
    }

    const start = args.start_entity;
    const end = args.end_entity;
    const maxHops = Math.min(5, Math.max(1, Math.floor(args.max_hops ?? 3)));
    const relationTypes = (args.relation_types ?? []).map(String).filter((t) => t.trim().length > 0);

    const getEdges = async (fromIds: string[]) => {
      if (fromIds.length === 0) return [] as Array<{ from: string; to: string; rel: string }>;
      const frontier = fromIds.map((id) => [id]);
      const params: any = { frontier };
      let query = `
frontier[from_id] <- $frontier
`;
      if (relationTypes.length > 0) {
        query += `
allowed[rel_type] <- $allowed
?[from_id, to_id, rel_type] :=
  frontier[from_id],
  *relationship{from_id, to_id, relation_type: rel_type, @ "NOW"},
  allowed[rel_type]
        `.trim();
        params.allowed = relationTypes.map((t) => [t]);
      } else {
        query += `
?[from_id, to_id, rel_type] :=
  frontier[from_id],
  *relationship{from_id, to_id, relation_type: rel_type, @ "NOW"}
        `.trim();
      }

      const res = await this.db.run(query.trim(), params);
      return (res.rows || []).map((r: any) => ({ from: String(r[0]), to: String(r[1]), rel: String(r[2]) }));
    };

    if (end) {
      if (start === end) {
        return { start_entity: start, end_entity: end, path: [start], path_length: 1 };
      }

      const visited = new Set<string>([start]);
      const parent = new Map<string, string>();
      let frontier = [start];
      let found = false;

      for (let depth = 0; depth < maxHops; depth++) {
        const edges = await getEdges(frontier);
        const next: string[] = [];

        for (const e of edges) {
          if (visited.has(e.to)) continue;
          visited.add(e.to);
          parent.set(e.to, e.from);
          if (e.to === end) {
            found = true;
            break;
          }
          next.push(e.to);
        }

        if (found) break;
        frontier = next;
        if (frontier.length === 0) break;
      }

      if (!found) {
        return { start_entity: start, end_entity: end, path: [], path_length: 0 };
      }

      const path: string[] = [];
      let cur: string | undefined = end;
      while (cur) {
        path.push(cur);
        if (cur === start) break;
        cur = parent.get(cur);
      }
      path.reverse();
      const hops = Math.max(0, path.length - 1);
      if (hops > maxHops) {
        return { start_entity: start, end_entity: end, path: [], path_length: 0 };
      }

      return { start_entity: start, end_entity: end, path, path_length: path.length };
    }

    const distance = new Map<string, number>();
    distance.set(start, 0);
    let frontier = [start];

    for (let depth = 0; depth < maxHops; depth++) {
      const edges = await getEdges(frontier);
      const next: string[] = [];

      for (const e of edges) {
        if (distance.has(e.to)) continue;
        distance.set(e.to, depth + 1);
        next.push(e.to);
      }

      frontier = next;
      if (frontier.length === 0) break;
    }

    const targetIds = Array.from(distance.entries())
      .filter(([id, d]) => id !== start && d > 0)
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id);

    if (targetIds.length === 0) {
      return { start_entity: start, results: [] };
    }

    const ids = targetIds.map((id) => [id]);
    const entityRes = await this.db.run(
      `
ids[id] <- $ids
?[id, name, type] := ids[id], *entity{id, name, type, @ "NOW"}
      `.trim(),
      { ids },
    );
    const metaById = new Map<string, { name: string; type: string }>();
    (entityRes.rows || []).forEach((r: any) => metaById.set(String(r[0]), { name: String(r[1]), type: String(r[2]) }));

    const results = targetIds
      .map((id) => {
        const meta = metaById.get(id);
        if (!meta) {
            // Fallback for missing entities
            return { entity_id: id, name: "Unknown (Missing Entity)", type: "Unknown", hops: distance.get(id) ?? null };
        }
        return { entity_id: id, name: meta.name, type: meta.type, hops: distance.get(id) ?? null };
      })
      .filter((r): r is { entity_id: string; name: string; type: string; hops: number | null } => r !== undefined);

    return { start_entity: start, results };
  }

  /**
   * Tracks the temporal evolution of relationships of an entity (Time-Travel Analysis).
   * Returns a list of events (ASSERTED/RETRACTED) over time.
   * Optional filters for target entity and time range.
   */
  public async getRelationEvolution(args: { 
    from_id: string; 
    to_id?: string;
    since?: number; // Unix timestamp in ms
    until?: number; // Unix timestamp in ms
  }) {
    await this.initPromise;

    const fromId = args.from_id;
    const toId = args.to_id;
    const since = args.since ? args.since * 1000 : undefined; // Cozo uses microseconds
    const until = args.until ? args.until * 1000 : undefined;

    // 1. Query all historical states for this relationship(s)
    let query = `
      ?[from_id, to_id, relation_type, strength, metadata, created_at] := 
        *relationship{from_id, to_id, relation_type, strength, metadata, created_at},
        from_id = $from_id
    `;
    const params: any = { from_id: fromId };

    if (toId) {
      query += `, to_id = $to_id`;
      params.to_id = toId;
    }

    const res = await this.db.run(query, params);

    // 2. Resolve names of involved entities
    const uniqueIds = new Set<string>();
    uniqueIds.add(fromId);
    (res.rows || []).forEach((r: any) => uniqueIds.add(String(r[1])));

    const nameRes = await this.db.run(`
      ids[id] <- $ids
      ?[id, name] := ids[id], *entity{id, name, @ "NOW"}
    `, { ids: Array.from(uniqueIds).map(id => [id]) });

    const nameById = new Map<string, string>();
    (nameRes.rows || []).forEach((r: any) => nameById.set(String(r[0]), String(r[1])));

    // 3. Process and filter events
    let events = (res.rows || []).map((r: any) => {
      const validity = r[5]; // [timestamp, is_asserted]
      const timestamp = Number(validity[0]);
      const isAsserted = Boolean(validity[1]);

      return {
        timestamp,
        date: new Date(Math.floor(timestamp / 1000)).toISOString(),
        operation: isAsserted ? "ASSERTED" : "RETRACTED",
        from_id: String(r[0]),
        from_name: nameById.get(String(r[0])) || String(r[0]),
        to_id: String(r[1]),
        to_name: nameById.get(String(r[1])) || String(r[1]),
        relation_type: String(r[2]),
        strength: Number(r[3]),
        metadata: r[4]
      };
    });

    // Apply time range filter
    if (since !== undefined) {
      events = events.filter((e: any) => e.timestamp >= since);
    }
    if (until !== undefined) {
      events = events.filter((e: any) => e.timestamp <= until);
    }

    // Sort by time (ascending)
    events.sort((a: any, b: any) => a.timestamp - b.timestamp);

    // 4. Create diff summary
    const diff = {
      added: [] as any[],
      removed: [] as any[],
      modified: [] as any[]
    };

    // Simple logic: We look at the events in the selected time period
    // For a real "diff" analysis between two points in time, one would have to compare the state @ start and @ end.
    // Here we provide the changes in the time period for now.
    events.forEach((e: any) => {
      if (e.operation === "ASSERTED") {
        diff.added.push(e);
      } else {
        diff.removed.push(e);
      }
    });

    return {
      from_id: fromId,
      from_name: nameById.get(fromId) || fromId,
      to_id: toId,
      to_name: toId ? (nameById.get(toId) || toId) : undefined,
      time_range: {
        since: args.since,
        until: args.until
      },
      event_count: events.length,
      timeline: events,
      summary: diff
    };
  }

  public async reflectMemory(args: { entity_id?: string; model?: string }) {
    await this.initPromise;
    const model = args.model ?? "demyagent-4b-i1:Q6_K";
    const targetEntityId = args.entity_id;

    let entitiesToReflect: Array<{ id: string; name: string; type: string }> = [];

    if (targetEntityId) {
      const res = await this.db.run('?[id, name, type] := *entity{id, name, type, @ "NOW"}, id = $id', { id: targetEntityId });
      if (res.rows.length > 0) {
        entitiesToReflect.push({ id: String(res.rows[0][0]), name: String(res.rows[0][1]), type: String(res.rows[0][2]) });
      }
    } else {
      // Select top 5 entities with the most observations
      const res = await this.db.run(`
        ?[id, name, type, count(id)] := 
          *entity{id, name, type, @ "NOW"}, 
          *observation{entity_id: id, @ "NOW"}
      `);
      entitiesToReflect = res.rows
        .map((r: any) => ({ id: String(r[0]), name: String(r[1]), type: String(r[2]), count: Number(r[3]) }))
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 5);
    }

    const results: any[] = [];

    for (const entity of entitiesToReflect) {
      const obsRes = await this.db.run('?[text, ts] := *observation{entity_id: $id, text, created_at, @ "NOW"}, ts = to_int(created_at) :order ts', {
        id: entity.id,
      });

      if (obsRes.rows.length < 2) {
        results.push({ entity_id: entity.id, status: "skipped", reason: "Too few observations for reflection" });
        continue;
      }

      const observations = obsRes.rows.map((r: any) => `- [${new Date(Number(r[1]) / 1000).toISOString()}] ${r[0]}`);

      const systemPrompt = `You are an analytical memory module. Analyze the following observations about an entity. 
Look for contradictions, temporal developments, behavioral patterns, or deeper insights. 
Formulate a concise reflection (max. 3-4 sentences) that helps the user understand the current state or evolution.
If there are contradictory statements, name them explicitly.
If no special patterns are recognizable, answer with "No new insights".`;

      const userPrompt = `Entity: ${entity.name} (${entity.type})\n\nObservations:\n${observations.join("\n")}`;

      let reflectionText: string;
      try {
        const ollamaMod: any = await import("ollama");
        const ollamaClient: any = ollamaMod?.default ?? ollamaMod;
        const response = await ollamaClient.chat({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });
        reflectionText = (response as any)?.message?.content?.trim?.() ?? "";
      } catch (e: any) {
        console.error(`[Reflect] Ollama error for ${entity.name}:`, e);
        reflectionText = "";
      }

      if (reflectionText && reflectionText !== "No new insights" && !reflectionText.includes("No new insights")) {
        await this.addObservation({
          entity_id: entity.id,
          text: `Reflexive insight: ${reflectionText}`,
          metadata: { kind: "reflection", model, generated_at: Date.now() },
        });
        results.push({ entity_id: entity.id, status: "reflected", insight: reflectionText });
      } else {
        results.push({ entity_id: entity.id, status: "no_insight_found" });
      }
    }

    return { status: "completed", results };
  }

  public async detectStatusConflicts(entityIds: string[]) {
    await this.initPromise;
    const ids = Array.from(new Set((entityIds ?? []).map(String).filter((x) => x.trim().length > 0))).slice(0, 50);
    if (ids.length === 0) return [] as Array<{
      entity_id: string;
      entity_name: string;
      entity_type: string;
      kind: "status";
      summary: string;
      evidence: {
        active: { created_at: number; year: number; text: string };
        inactive: { created_at: number; year: number; text: string };
      };
    }>;

    const list = ids.map((id) => [id]);

    const activeRe =
      "(?i).*(\\bactive\\b|\\brunning\\b|\\bongoing\\b|in\\s+operation|continues|continued|not\\s+discontinued).*";
    const inactiveRe =
        "(?i).*(discontinued|cancelled|stopped|shut\\s+down|closed|shutdown|deprecated|archived|terminated|abandoned).*";

    const latestByRegex = async (re: string) => {
      const res = await this.db.run(
        `
          ids[id] <- $ids
          ?[entity_id, ts, text] :=
            ids[entity_id],
            *observation{entity_id, text, created_at, @ "NOW"},
            ts = to_int(created_at),
            regex_matches(text, $re)
        `.trim(),
        { ids: list, re },
      );

      const out = new Map<string, { created_at: number; text: string }>();
      for (const row of res.rows as any[]) {
        const entityId = String(row[0]);
        const createdAt = Number(row[1]);
        const text = String(row[2]);

        const existing = out.get(entityId);
        if (!existing || createdAt > existing.created_at) {
          out.set(entityId, { created_at: createdAt, text });
        }
      }
      return out;
    };

    const [activeLatest, inactiveLatest] = await Promise.all([latestByRegex(activeRe), latestByRegex(inactiveRe)]);
    const toYear = (micros: number) => new Date(Math.floor(micros / 1000)).getUTCFullYear();

    const conflictIds = ids.filter((id) => {
      const active = activeLatest.get(id);
      const inactive = inactiveLatest.get(id);
      if (!active || !inactive) return false;

      const ay = toYear(active.created_at);
      const iy = toYear(inactive.created_at);

      // A conflict only exists if both pieces of information are from the same time period (year).
      // Different years indicate a status change (e.g. discontinued in 2024, active again in 2025).
      // This matches the proposal for temporal consistency.
      return ay === iy;
    });

    if (conflictIds.length === 0) return [];

    const metaRes = await this.db.run(
      `
ids[id] <- $ids
?[id, name, type] := ids[id], *entity{id, name, type, @ "NOW"}
      `.trim(),
      { ids: conflictIds.map((id) => [id]) },
    );
    const metaById = new Map<string, { name: string; type: string }>();
    for (const row of metaRes.rows as any[]) metaById.set(String(row[0]), { name: String(row[1]), type: String(row[2]) });

    return conflictIds
      .map((id) => {
        const meta = metaById.get(id);
        const active = activeLatest.get(id);
        const inactive = inactiveLatest.get(id);
        if (!meta || !active || !inactive) return undefined;
        const ay = toYear(active.created_at);
        const iy = toYear(inactive.created_at);
        const years = ay === iy ? String(ay) : `${Math.min(ay, iy)} vs. ${Math.max(ay, iy)}`;
        return {
          entity_id: id,
          entity_name: meta.name,
          entity_type: meta.type,
          kind: "status" as const,
          summary: `Conflict: Contradictory info on status of ${meta.name} in same period (${years}).`,
          evidence: {
            active: { created_at: active.created_at, year: ay, text: active.text },
            inactive: { created_at: inactive.created_at, year: iy, text: inactive.text },
          },
        };
      })
      .filter(
        (x): x is {
          entity_id: string;
          entity_name: string;
          entity_type: string;
          kind: "status";
          summary: string;
          evidence: {
            active: { created_at: number; year: number; text: string };
            inactive: { created_at: number; year: number; text: string };
          };
        } => x !== undefined,
      );
  }

  public async addInferenceRule(args: { name: string, datalog: string }) {
    await this.initPromise;
    try {
      if (!args.name || args.name.trim() === "") {
        return { error: "Rule name must not be empty" };
      }
      if (!args.datalog || args.datalog.trim() === "") {
        return { error: "Datalog must not be empty" };
      }

      // Check if a rule with this name already exists
      const existingRule = await this.db.run('?[id] := *inference_rule{name: $name, id}', { name: args.name });
      if (existingRule.rows.length > 0) {
        return { error: `An inference rule with the name '${args.name}' already exists.` };
      }

      // Validate Datalog code
      try {
        const validationRes = await this.db.run(args.datalog, { id: "validation-test" });
        const expectedHeaders = ["from_id", "to_id", "relation_type", "confidence", "reason"];
        const actualHeaders = validationRes.headers;
        
        const missingHeaders = expectedHeaders.filter(h => !actualHeaders.includes(h));
        if (missingHeaders.length > 0) {
          return { error: `Invalid Datalog result set. Missing columns: ${missingHeaders.join(", ")}. Expected: ${expectedHeaders.join(", ")}` };
        }
      } catch (validationError: any) {
        return { error: `Datalog syntax error: ${validationError.message}` };
      }

      const id = uuidv4();
      const now = Date.now();
      await this.db.run(
        "?[id, name, datalog, created_at] <- [[$id, $name, $datalog, $now]] :put inference_rule {id => name, datalog, created_at}",
        { id, name: args.name, datalog: args.datalog, now },
      );
      return { id, name: args.name, status: "Rule saved" };
    } catch (error: any) {
      return { error: error.message || "Error saving rule" };
    }
  }

  private async findEntityIdByName(name: string): Promise<string | null> {
    await this.initPromise;
    const lowerName = name.toLowerCase();
    const res = await this.db.run(
      `
        ?[id, ts] :=
          *entity{id, name, created_at, @ "NOW"},
          lowercase(name) == $lower_name,
          ts = to_int(created_at)
        :order -ts
        :limit 1
      `,
      { lower_name: lowerName },
    );
    if (res.rows.length === 0) return null;
    return String(res.rows[0][0]);
  }

  public async ingestFile(args: {
    entity_id?: string;
    entity_name?: string;
    entity_type?: string;
    format: "markdown" | "json";
    chunking?: "none" | "paragraphs";
    content: string;
    metadata?: any;
    observation_metadata?: any;
    deduplicate?: boolean;
    max_observations?: number;
  }) {
    await this.initPromise;
    try {
      const content = (args.content ?? "").trim();
      if (!content) return { error: "Content must not be empty" };

      let entityId: string | undefined = undefined;
      let createdEntity = false;

      if (args.entity_id) {
        const entityRes = await this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: args.entity_id });
        if (entityRes.rows.length === 0) return { error: `Entity with ID '${args.entity_id}' not found` };
        entityId = args.entity_id;
      } else {
        const entityName = (args.entity_name ?? "").trim();
        if (!entityName) return { error: "For ingest, 'entity_id' or 'entity_name' is mandatory to assign data." };
        const existing = await this.findEntityIdByName(entityName);
        if (existing) {
          entityId = existing;
        } else {
          const created = await this.createEntity({
            name: entityName,
            type: (args.entity_type ?? "Document").trim() || "Document",
            metadata: args.metadata || {},
          });
          if ((created as any)?.error) return created;
          entityId = (created as any).id;
          createdEntity = true;
        }
      }

      if (!entityId) return { error: "Entity could not be determined" };

      const maxObs = Math.min(200, Math.max(1, Math.floor(args.max_observations ?? 50)));
      const deduplicate = args.deduplicate ?? true;
      const chunking = args.chunking ?? "none";

      const observations: Array<{ text: string; metadata?: any }> = [];

      if (args.format === "markdown") {
        if (chunking === "paragraphs") {
          const parts = content
            .split(/\r?\n\s*\r?\n+/g)
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
          for (const p of parts.slice(0, maxObs)) observations.push({ text: p });
        } else {
          observations.push({ text: content });
        }
      } else {
        let parsed: any;
        try {
          parsed = JSON.parse(content);
        } catch {
          return { error: "JSON could not be parsed" };
        }

        const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.observations) ? parsed.observations : null;
        if (!items) return { error: "JSON expects Array or { observations: [...] }" };

        for (const item of items.slice(0, maxObs)) {
          if (typeof item === "string") {
            const t = item.trim();
            if (t) observations.push({ text: t });
            continue;
          }
          if (item && typeof item === "object") {
            const t = String(item.text ?? "").trim();
            if (t) observations.push({ text: t, metadata: item.metadata });
          }
        }
      }

      if (observations.length === 0) return { error: "No observations extracted" };

      const insertedIds: string[] = [];
      let skippedDuplicates = 0;

      for (const o of observations) {
        const text = (o.text ?? "").trim();
        if (!text) continue;

        const res = await this.addObservation({
          entity_id: entityId,
          text,
          metadata: { ...(args.observation_metadata || {}), ...(o.metadata || {}) },
          deduplicate
        }) as any;

        if (res.status === 'duplicate_detected') {
          skippedDuplicates += 1;
        } else if (res.id) {
          insertedIds.push(res.id);
        }
      }

      return {
        status: "ingested",
        entity_id: entityId,
        created_entity: createdEntity,
        observations_requested: observations.length,
        observations_added: insertedIds.length,
        observations_skipped_duplicates: skippedDuplicates,
        observation_ids: insertedIds,
      };
    } catch (error: any) {
      return { error: error.message || "Error during ingest" };
    }
  }

  public async deleteEntity(args: { entity_id: string }) {
    try {
      // 1. Check if entity exists
      const entityRes = await this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: args.entity_id });
      if (entityRes.rows.length === 0) {
        return { error: `Entity with ID '${args.entity_id}' not found` };
      }

      // 2. Delete all related data in a transaction (block)
      await this.db.run(`
        { ?[id, created_at] := *observation{id, entity_id, created_at}, entity_id = $target_id :rm observation {id, created_at} }
        { ?[from_id, to_id, relation_type, created_at] := *relationship{from_id, to_id, relation_type, created_at}, from_id = $target_id :rm relationship {from_id, to_id, relation_type, created_at} }
        { ?[from_id, to_id, relation_type, created_at] := *relationship{from_id, to_id, relation_type, created_at}, to_id = $target_id :rm relationship {from_id, to_id, relation_type, created_at} }
        { ?[id, created_at] := *entity{id, created_at}, id = $target_id :rm entity {id, created_at} }
      `, { target_id: args.entity_id });

      return { status: "Entity and all related data deleted" };
    } catch (error: any) {
      console.error("Error during deletion:", error);
      return { error: "Deletion failed", message: error.message };
    }
  }

  public async runTransaction(args: { 
    operations: Array<{
      action: "create_entity" | "add_observation" | "create_relation" | "delete_entity";
      params: any;
    }>
  }) {
    await this.initPromise;
    try {
      if (!args.operations || args.operations.length === 0) {
        return { error: "Keine Operationen angegeben" };
      }

      const statements: string[] = [];
      const allParams: Record<string, any> = {};
      const results: any[] = [];
      const createdEntityIds = new Map<string, string>(); // name -> id map for transaction-local lookups

      for (let i = 0; i < args.operations.length; i++) {
        const op = args.operations[i];
        const suffix = `_${i}`;
        
        let params = op.params;
        if (typeof params === 'string') {
            try {
                params = JSON.parse(params);
            } catch (e) {
                return { error: `Invalid JSON parameters (Parse Error) in operation ${i}` };
            }
        }

        if (!params || typeof params !== 'object') {
            return { error: `Invalid parameter structure (not an object) in operation ${i}` };
        }
        
        switch (op.action) {
          case "create_entity": {
            const { name, type, metadata } = params;
            const id = params.id || uuidv4();
            const embedding = await this.embeddingService.embed(`${name || "unknown"} ${type || "unknown"}`);
            const name_embedding = await this.embeddingService.embed(name || "unknown");
            const now = Date.now() * 1000;
            
            if (name) {
              createdEntityIds.set(name, id);
            }

            allParams[`id${suffix}`] = id;
            allParams[`name${suffix}`] = name || "unknown";
            allParams[`type${suffix}`] = type || "unknown";
            allParams[`embedding${suffix}`] = embedding;
            allParams[`name_embedding${suffix}`] = name_embedding;
            allParams[`metadata${suffix}`] = metadata || {};
            
            statements.push(`
              {
                ?[id, created_at, name, type, embedding, name_embedding, metadata] <- [
                  [$id${suffix}, [${now}, true], $name${suffix}, $type${suffix}, $embedding${suffix}, $name_embedding${suffix}, $metadata${suffix}]
                ] :insert entity {id, created_at => name, type, embedding, name_embedding, metadata}
              }
            `);
            results.push({ action: "create_entity", id, name });
            break;
          }
          
          case "add_observation": {
            let { entity_id, entity_name, entity_type, text, metadata } = params;
            
            // Resolve entity_id if not provided
            if (!entity_id) {
               if (entity_name) {
                  // 1. Check if created in this transaction
                  if (createdEntityIds.has(entity_name)) {
                     entity_id = createdEntityIds.get(entity_name);
                  } else {
                     // 2. Lookup in DB
                     const existing = await this.findEntityIdByName(entity_name);
                     if (existing) {
                        entity_id = existing;
                     } else {
                        // 3. Auto-create entity
                        const newId = uuidv4();
                        const newName = entity_name;
                        const newType = entity_type || "Unknown";
                        const newEmbedding = await this.embeddingService.embed(`${newName} ${newType}`);
                        const newNameEmbedding = await this.embeddingService.embed(newName);
                        const newNow = Date.now() * 1000;
                        const createSuffix = `${suffix}_autocreate`;

                        allParams[`id${createSuffix}`] = newId;
                        allParams[`name${createSuffix}`] = newName;
                        allParams[`type${createSuffix}`] = newType;
                        allParams[`embedding${createSuffix}`] = newEmbedding;
                        allParams[`name_embedding${createSuffix}`] = newNameEmbedding;
                        allParams[`metadata${createSuffix}`] = {}; // Default metadata

                        statements.push(`
                          {
                            ?[id, created_at, name, type, embedding, name_embedding, metadata] <- [
                              [$id${createSuffix}, [${newNow}, true], $name${createSuffix}, $type${createSuffix}, $embedding${createSuffix}, $name_embedding${createSuffix}, $metadata${createSuffix}]
                            ] :insert entity {id, created_at => name, type, embedding, name_embedding, metadata}
                          }
                        `);
                        
                        createdEntityIds.set(newName, newId);
                        entity_id = newId;
                        results.push({ action: "create_entity (auto)", id: newId, name: newName });
                     }
                  }
               } else {
                  return { error: `entity_id or entity_name is required for add_observation in operation ${i}` };
               }
            }

            const id = params.id || uuidv4();
            const embedding = await this.embeddingService.embed(text || "");
            const now = Date.now() * 1000;

            allParams[`obs_id${suffix}`] = id;
            allParams[`obs_entity_id${suffix}`] = entity_id;
            allParams[`obs_text${suffix}`] = text || "";
            allParams[`obs_embedding${suffix}`] = embedding;
            allParams[`obs_metadata${suffix}`] = metadata || {};

            statements.push(`
              {
                ?[id, created_at, entity_id, text, embedding, metadata] <- [
                  [$obs_id${suffix}, [${now}, true], $obs_entity_id${suffix}, $obs_text${suffix}, $obs_embedding${suffix}, $obs_metadata${suffix}]
                ] :insert observation {id, created_at => entity_id, text, embedding, metadata}
              }
            `);
            results.push({ action: "add_observation", id, entity_id });
            break;
          }

          case "create_relation": {
            let { from_id, to_id, relation_type, strength, metadata } = params;
            
            // 1. Check if IDs are actually names of entities created in this transaction
            if (createdEntityIds.has(from_id)) {
                from_id = createdEntityIds.get(from_id);
            } else if (!uuidValidate(from_id)) {
                // 2. Try to resolve from DB if not UUID (and not found in local transaction)
                const existingId = await this.findEntityIdByName(from_id);
                if (existingId) {
                    from_id = existingId;
                }
            }

            if (createdEntityIds.has(to_id)) {
                to_id = createdEntityIds.get(to_id);
            } else if (!uuidValidate(to_id)) {
                const existingId = await this.findEntityIdByName(to_id);
                if (existingId) {
                    to_id = existingId;
                }
            }

            const now = Date.now() * 1000;

            allParams[`rel_from${suffix}`] = from_id;
            allParams[`rel_to${suffix}`] = to_id;
            allParams[`rel_type${suffix}`] = relation_type;
            allParams[`rel_strength${suffix}`] = strength ?? 1.0;
            allParams[`rel_metadata${suffix}`] = metadata || {};

            statements.push(`
              {
                ?[from_id, to_id, relation_type, created_at, strength, metadata] <- [
                  [$rel_from${suffix}, $rel_to${suffix}, $rel_type${suffix}, [${now}, true], $rel_strength${suffix}, $rel_metadata${suffix}]
                ] :insert relationship {from_id, to_id, relation_type, created_at => strength, metadata}
              }
            `);
            results.push({ action: "create_relation", from_id, to_id, relation_type });
            break;
          }

          case "delete_entity": {
            const { entity_id } = params;
            if (!entity_id) {
               return { error: `Missing entity_id for delete_entity in operation ${i}` };
            }

            allParams[`target_id${suffix}`] = entity_id;

            // Delete observations
            statements.push(`
              { ?[id, created_at] := *observation{id, entity_id, created_at}, entity_id = $target_id${suffix} :rm observation {id, created_at} }
            `);
            // Delete outgoing relationships
            statements.push(`
              { ?[from_id, to_id, relation_type, created_at] := *relationship{from_id, to_id, relation_type, created_at}, from_id = $target_id${suffix} :rm relationship {from_id, to_id, relation_type, created_at} }
            `);
            // Delete incoming relationships
            statements.push(`
              { ?[from_id, to_id, relation_type, created_at] := *relationship{from_id, to_id, relation_type, created_at}, to_id = $target_id${suffix} :rm relationship {from_id, to_id, relation_type, created_at} }
            `);
            // Delete entity itself
            statements.push(`
              { ?[id, created_at] := *entity{id, created_at}, id = $target_id${suffix} :rm entity {id, created_at} }
            `);
            
            results.push({ action: "delete_entity", id: entity_id });
            break;
          }
          
          default:
            return { error: `Unknown operation: ${(op as any).action}` };
        }
      }

      const transactionQuery = statements.join("\n");
      console.error(`[Transaction] Executing ${statements.length} operations atomically...`);
      
      await this.db.run(transactionQuery, allParams);
      
      return { 
        status: "success", 
        message: `${statements.length} operations executed atomically`,
        results 
      };
    } catch (error: any) {
      console.error("Error in runTransaction:", error);
      return { 
        error: "Transaction failed", 
        message: error.message,
        cozo_display: error.display 
      };
    }
  }

  public async findBridgeEntities() {
    await this.initPromise;

    // Get all entities that belong to a community
    const communityRes = await this.db.run(`
      ?[entity_id, community_id] := *entity_community{entity_id, community_id}
    `);
    
    const entityToCommunity = new Map<string, string>();
    for (const row of communityRes.rows as any[]) {
      entityToCommunity.set(String(row[0]), String(row[1]));
    }

    // Get all relationships
    const relRes = await this.db.run(`
      ?[from_id, to_id] := *relationship{from_id, to_id, @ "NOW"}
    `);

    const entityBridges = new Map<string, Set<string>>(); // entity_id -> Set of community_ids it connects to

    for (const row of relRes.rows as any[]) {
      const fromId = String(row[0]);
      const toId = String(row[1]);

      const fromComm = entityToCommunity.get(fromId);
      const toComm = entityToCommunity.get(toId);

      if (fromComm && toComm && fromComm !== toComm) {
        // fromId is a bridge candidate because it connects to toComm (different community)
        let commsFrom = entityBridges.get(fromId);
        if (!commsFrom) {
          commsFrom = new Set();
          commsFrom.add(fromComm); // Add its own community
          entityBridges.set(fromId, commsFrom);
        }
        commsFrom.add(toComm);

        // toId is a bridge candidate because it connects to fromComm
        let commsTo = entityBridges.get(toId);
        if (!commsTo) {
          commsTo = new Set();
          commsTo.add(toComm); // Add its own community
          entityBridges.set(toId, commsTo);
        }
        commsTo.add(fromComm);
      }
    }

    const bridges = [];
    for (const [entityId, comms] of entityBridges.entries()) {
      if (comms.size > 1) {
        // Fetch entity name and type for better display
        const entityInfo = await this.db.run('?[name, type] := *entity{id: $id, name, type, @ "NOW"}', { id: entityId });
        const name = entityInfo.rows.length > 0 ? entityInfo.rows[0][0] : entityId;
        const type = entityInfo.rows.length > 0 ? entityInfo.rows[0][1] : "Unknown";

        bridges.push({
          entity_id: entityId,
          name,
          type,
          connected_communities: Array.from(comms),
          community_count: comms.size
        });
      }
    }

    // Sort by number of communities connected (descending)
    bridges.sort((a, b) => b.community_count - a.community_count);

    return bridges;
  }

  public async graphRag(args: Parameters<HybridSearch['graphRag']>[0]) {
    await this.initPromise;
    return this.hybridSearch.graphRag(args);
  }

  private registerTools() {
    const MetadataSchema = z.record(z.string(), z.any());

    const MutateMemorySchema = z.discriminatedUnion("action", [
      z.object({
        action: z.literal("create_entity"),
        name: z.string().describe("Name of the entity"),
        type: z.string().describe("Type of the entity"),
        metadata: MetadataSchema.optional().describe("Additional metadata"),
      }).passthrough(),
      z.object({
        action: z.literal("update_entity"),
        id: z.string().describe("ID of the entity to update"),
        name: z.string().min(1).optional().describe("New name"),
        type: z.string().min(1).optional().describe("New type"),
        metadata: MetadataSchema.optional().describe("New metadata"),
      }).passthrough(),
      z.object({
        action: z.literal("delete_entity"),
        entity_id: z.string().describe("ID of the entity to delete"),
      }).passthrough(),
      z.object({
        action: z.literal("add_observation"),
        entity_id: z.string().optional().describe("ID of the entity"),
        entity_name: z.string().optional().describe("Name of the entity (will be created if not exists)"),
        entity_type: z.string().optional().default("Unknown").describe("Type of the entity (only when creating)"),
        text: z.string().describe("The fact or observation"),
        metadata: MetadataSchema.optional().describe("Additional metadata"),
        deduplicate: z.boolean().optional().default(true).describe("Skip exact duplicates"),
      }).passthrough().refine((v) => Boolean((v as any).entity_id) || Boolean((v as any).entity_name), {
        message: "entity_id or entity_name is required",
        path: ["entity_id"],
      }),
      z.object({
        action: z.literal("create_relation"),
        from_id: z.string().describe("Source entity ID"),
        to_id: z.string().describe("Target entity ID"),
        relation_type: z.string().nonempty().describe("Type of the relationship"),
        strength: z.number().min(0).max(1).optional().default(1.0).describe("Strength of the relationship"),
        metadata: MetadataSchema.optional().describe("Additional metadata"),
      }).passthrough(),
      z.object({
        action: z.literal("run_transaction"),
        operations: z.array(z.discriminatedUnion("action", [
          z.object({
            action: z.literal("create_entity"),
            params: z.union([
              z.object({
                name: z.string().describe("Name of the entity"),
                type: z.string().describe("Type of the entity"),
                metadata: MetadataSchema.optional().describe("Additional metadata"),
              }).passthrough(),
              z.string().describe("JSON string of parameters")
            ])
          }),
          z.object({
            action: z.literal("delete_entity"),
            params: z.union([
              z.object({
                entity_id: z.string().describe("ID of the entity to delete"),
              }).passthrough(),
              z.string().describe("JSON string of parameters")
            ])
          }),
          z.object({
            action: z.literal("add_observation"),
            params: z.union([
              z.object({
                entity_id: z.string().optional().describe("ID of the entity"),
                entity_name: z.string().optional().describe("Name of the entity (will be created if not exists)"),
                entity_type: z.string().optional().default("Unknown").describe("Type of the entity (only when creating)"),
                text: z.string().describe("The fact or observation"),
                metadata: MetadataSchema.optional().describe("Additional metadata"),
              }).passthrough().refine((v) => Boolean((v as any).entity_id) || Boolean((v as any).entity_name), {
                message: "entity_id or entity_name is required",
                path: ["entity_id"],
              }),
              z.string().describe("JSON string of parameters")
            ])
          }),
          z.object({
            action: z.literal("create_relation"),
            params: z.union([
              z.object({
                from_id: z.string().describe("Source entity ID"),
                to_id: z.string().describe("Target entity ID"),
                relation_type: z.string().nonempty().describe("Type of the relationship"),
                strength: z.number().min(0).max(1).optional().default(1.0).describe("Strength of the relationship"),
                metadata: MetadataSchema.optional().describe("Additional metadata"),
              }).passthrough(),
              z.string().describe("JSON string of parameters")
            ])
          }),
        ])).describe("List of operations to be executed atomically")
      }).passthrough(),
      z.object({
        action: z.literal("add_inference_rule"),
        name: z.string().describe("Name of the rule"),
        datalog: z.string().describe("CozoDB Datalog Query"),
      }),
      z.object({
        action: z.literal("ingest_file"),
        entity_id: z.string().optional().describe("ID of the target entity"),
        entity_name: z.string().optional().describe("Name of the target entity (will be created if not exists)"),
        entity_type: z.string().optional().default("Document").describe("Type of the target entity (only when creating)"),
        format: z.enum(["markdown", "json"]).describe("Input format"),
        chunking: z.enum(["none", "paragraphs"]).optional().default("none").describe("Chunking for Markdown"),
        content: z.string().describe("File content (or LLM summary)"),
        metadata: MetadataSchema.optional().describe("Metadata for entity creation"),
        observation_metadata: MetadataSchema.optional().describe("Metadata applied to all observations"),
        deduplicate: z.boolean().optional().default(true).describe("Skip exact duplicates"),
        max_observations: z.number().min(1).max(200).optional().default(50).describe("Maximum number of observations"),
      }).refine((v) => Boolean((v as any).entity_id) || Boolean((v as any).entity_name), {
        message: "entity_id or entity_name is required for ingest_file",
        path: ["entity_id"],
      }),
    ]);

    const MutateMemoryParameters = z.object({
      action: z
        .enum(["create_entity", "update_entity", "delete_entity", "add_observation", "create_relation", "run_transaction", "add_inference_rule", "ingest_file"])
        .describe("Action (determines which fields are required)"),
      name: z.string().optional().describe("For create_entity (required) or add_inference_rule (required)"),
      type: z.string().optional().describe("For create_entity (required)"),
      id: z.string().optional().describe("For update_entity (required)"),
      entity_id: z.string().optional().describe("For delete_entity (required); alternative to entity_name for add_observation/ingest_file"),
      entity_name: z.string().optional().describe("For add_observation/ingest_file as alternative to entity_id"),
      entity_type: z.string().optional().describe("Only when entity_name is used and entity is created new"),
      text: z.string().optional().describe("For add_observation (required)"),
      datalog: z.string().optional().describe("For add_inference_rule (required)"),
      format: z.enum(["markdown", "json"]).optional().describe("For ingest_file (required)"),
      chunking: z.enum(["none", "paragraphs"]).optional().describe("Optional for ingest_file (for markdown)"),
      content: z.string().optional().describe("For ingest_file (required)"),
      observation_metadata: MetadataSchema.optional().describe("Optional for ingest_file"),
      deduplicate: z.boolean().optional().describe("Optional for ingest_file and add_observation"),
      max_observations: z.number().optional().describe("Optional for ingest_file"),
      from_id: z.string().optional().describe("For create_relation (required)"),
      to_id: z.string().optional().describe("For create_relation (required)"),
      relation_type: z.string().optional().describe("For create_relation (required)"),
      strength: z.number().min(0).max(1).optional().describe("Optional for create_relation"),
      metadata: MetadataSchema.optional().describe("Optional for create_entity/update_entity/add_observation/create_relation/ingest_file"),
      operations: z.array(z.object({
        action: z.enum(["create_entity", "add_observation", "create_relation", "delete_entity"]),
        params: z.any().describe("Parameters for the operation as an object")
      })).optional().describe("For run_transaction: List of operations to be executed atomically"),
    });

    this.mcp.addTool({
      name: "mutate_memory",
      description: `Write access to memory. Select operation via 'action'.
Supported actions:
- 'create_entity': Creates a new entity. Params: { name: string, type: string, metadata?: object }
- 'update_entity': Updates an existing entity. Params: { id: string, name?: string, type?: string, metadata?: object }
- 'delete_entity': Deletes an entity and its observations. Params: { entity_id: string }
- 'add_observation': Stores a fact. Params: { entity_id?: string, entity_name?: string, entity_type?: string, text: string, metadata?: object, deduplicate?: boolean }. Automatic deduplication active (can be disabled).
  NOTE: Use special 'entity_id': 'global_user_profile' to store persistent user preferences (likes, work style, dislikes). These are prioritized in searches.
- 'create_relation': Creates a connection between entities. Params: { from_id: string, to_id: string, relation_type: string, strength?: number (0-1), metadata?: object }. No self-references allowed.
- 'run_transaction': Executes multiple operations atomically in one transaction. Params: { operations: Array<{ action: "create_entity"|"add_observation"|"create_relation", params: object }> }. Ideal for complex, related changes.
- 'add_inference_rule': Adds a custom Datalog inference rule. Params: { name: string, datalog: string }.
  IMPORTANT: The Datalog result set MUST return exactly 5 columns: [from_id, to_id, relation_type, confidence, reason].
  Use '$id' as placeholder for the start entity.
  Available tables:
  - *entity{id, name, type, metadata, @ "NOW"}
  - *relationship{from_id, to_id, relation_type, strength, metadata, @ "NOW"}
  - *observation{id, entity_id, text, metadata, @ "NOW"}
  Example (Manager Transitivity):
  '?[from_id, to_id, relation_type, confidence, reason] := *relationship{from_id: $id, to_id: mid, relation_type: "manager_of", @ "NOW"}, *relationship{from_id: mid, to_id: target, relation_type: "manager_of", @ "NOW"}, from_id = $id, to_id = target, relation_type = "ober_manager_von", confidence = 0.6, reason = "Transitive Manager Path"'
- 'ingest_file': Bulk import of documents (Markdown/JSON). Supports chunking (paragraphs) and automatic entity creation. Params: { entity_id | entity_name (required), format, content, ... }. Ideal for quickly populating memory from existing notes.

Validation: Invalid syntax or missing columns in inference rules will result in errors.`,
      parameters: MutateMemoryParameters,
      execute: async (args: any) => {
        await this.initPromise;
        console.error(`[mutate_memory] Call with:`, JSON.stringify(args, null, 2));
        
        // Zod discriminatedUnion is strict. We try to parse it more flexibly.
        const parsed = MutateMemorySchema.safeParse(args);
        if (!parsed.success) {
          console.error(`[mutate_memory] Validation error:`, JSON.stringify(parsed.error.issues, null, 2));
          

          
          return JSON.stringify({ 
            error: "Invalid input for action: " + args.action, 
            issues: parsed.error.issues,
            received: args 
          });
        }
        
        const { action, ...rest } = parsed.data as any;

        if (action === "create_entity") return JSON.stringify(await this.createEntity(rest));
        if (action === "update_entity") return JSON.stringify(await this.updateEntity(rest));
        if (action === "add_observation") return JSON.stringify(await this.addObservation(rest));
        if (action === "create_relation") return JSON.stringify(await this.createRelation(rest));
        if (action === "run_transaction") return JSON.stringify(await this.runTransaction(rest));
        if (action === "delete_entity") return JSON.stringify(await this.deleteEntity({ entity_id: rest.entity_id }));
        if (action === "add_inference_rule") return JSON.stringify(await this.addInferenceRule(rest));
        if (action === "ingest_file") return JSON.stringify(await this.ingestFile(rest));
        return JSON.stringify({ error: "Unknown action" });
      },
    });

    const QueryMemorySchema = z.discriminatedUnion("action", [
      z.object({
        action: z.literal("search"),
        query: z.string().describe("Search query"),
        limit: z.number().optional().default(10).describe("Maximum number of results"),
        entity_types: z.array(z.string()).optional().describe("Filter by entity types"),
        include_entities: z.boolean().optional().default(true).describe("Include entities in search"),
        include_observations: z.boolean().optional().default(true).describe("Include observations in search"),
      }),
      z.object({
        action: z.literal("advancedSearch"),
        query: z.string().describe("Search query"),
        limit: z.number().optional().default(10).describe("Maximum number of results"),
        filters: z.object({
          entityTypes: z.array(z.string()).optional().describe("Filter by entity types"),
          metadata: z.union([
            z.record(z.string(), z.any()),
            z.string().transform((str, ctx) => {
              try {
                return JSON.parse(str);
              } catch (e) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid JSON string for metadata" });
                return z.NEVER;
              }
            })
          ]).optional().describe("Filter by metadata (exact match)"),
        }).optional().describe("Filters for the search"),
        graphConstraints: z.object({
          requiredRelations: z.array(z.string()).optional().describe("Only entities with these relationship types"),
          targetEntityIds: z.array(z.string()).optional().describe("Only entities connected to these target IDs"),
        }).optional().describe("Graph constraints"),
        vectorParams: z.object({
          efSearch: z.number().optional().describe("HNSW search precision"),
        }).optional().describe("Vector parameters"),
      }),
      z.object({
        action: z.literal("context"),
        query: z.string().describe("Context query"),
        context_window: z.number().min(1).max(50).optional().default(20).describe("Number of context items"),
        time_range_hours: z.number().optional().describe("Time window in hours"),
      }),
      z.object({
        action: z.literal("entity_details"),
        entity_id: z.string().describe("ID of the entity"),
        as_of: z.string().optional().describe("Timestamp for historical query (ISO string or 'NOW')"),
      }),
      z.object({
        action: z.literal("history"),
        entity_id: z.string().describe("ID of the entity"),
      }),
      z.object({
        action: z.literal("graph_rag"),
        query: z.string().describe("Search query for initial vector seeds"),
        max_depth: z.number().min(1).max(3).optional().default(2).describe("Maximum depth of graph expansion (Default: 2)"),
        limit: z.number().optional().default(10).describe("Number of initial vector seeds"),
      }),
      z.object({
        action: z.literal("graph_walking"),
        query: z.string().describe("Search query for relevance check"),
        start_entity_id: z.string().optional().describe("Optional start entity (otherwise searched via vector)"),
        max_depth: z.number().min(1).max(5).optional().default(3).describe("Maximum walking depth"),
        limit: z.number().optional().default(5).describe("Number of results"),
      }),
    ]);

    const QueryMemoryParameters = z.object({
      action: z
        .enum(["search", "advancedSearch", "context", "entity_details", "history", "graph_rag", "graph_walking"])
        .describe("Action (determines which fields are required)"),
      query: z.string().optional().describe("Required for search/advancedSearch/context/graph_rag/graph_walking"),
      limit: z.number().optional().describe("Only for search/advancedSearch/graph_rag/graph_walking"),
      filters: z.any().optional().describe("Only for advancedSearch"),
      graphConstraints: z.any().optional().describe("Only for advancedSearch"),
      vectorOptions: z.any().optional().describe("Only for advancedSearch"),
      entity_types: z.array(z.string()).optional().describe("Only for search"),
      include_entities: z.boolean().optional().describe("Only for search"),
      include_observations: z.boolean().optional().describe("Only for search"),
      context_window: z.number().optional().describe("Only for context"),
      time_range_hours: z.number().optional().describe("Only for context"),
      entity_id: z.string().optional().describe("Required for entity_details/history"),
      as_of: z.string().optional().describe("Only for entity_details: ISO string or 'NOW'"),
      max_depth: z.number().optional().describe("Only for graph_rag/graph_walking: Maximum expansion depth"),
      start_entity_id: z.string().optional().describe("Only for graph_walking: Start entity"),
    });

    this.mcp.addTool({
      name: "query_memory",
      description: `Read access to memory. Select operation via 'action'.
Supported actions:
- 'search': Hybrid search (Vector + Keyword + Graph). Params: { query: string, limit?: number, entity_types?: string[], include_entities?: boolean, include_observations?: boolean }.
  NOTE: Results from user profile ('global_user_profile') are automatically boosted and prioritized.
- 'advancedSearch': Advanced search with metadata filters and graph constraints. Params: { query: string, limit?: number, filters?: { entityTypes?: string[], metadata?: object }, graphConstraints?: { requiredRelations?: string[], targetEntityIds?: string[] }, vectorOptions?: { topk?: number, efSearch?: number } }.
- 'context': Retrieves comprehensive context. Params: { query: string, context_window?: number, time_range_hours?: number }. Returns entities, observations, graph relationships, and implicit inference suggestions.
  NOTE: User profile is automatically included in context if relevant to enable personalization.
- 'entity_details': Detailed view of an entity. Params: { entity_id: string, as_of?: string ('ISO-String' or 'NOW') }.
- 'history': Retrieve historical evolution of an entity. Params: { entity_id: string }.
- 'graph_rag': Graph-based reasoning (Hybrid RAG). Finds semantic vector seeds first, then expands via graph traversals. Ideal for multi-hop reasoning. Params: { query: string, max_depth?: number, limit?: number }.
- 'graph_walking': Recursive semantic graph search. Starts at vector seeds or an entity and follows relationships to other semantically relevant entities. Params: { query: string, start_entity_id?: string, max_depth?: number, limit?: number }.

Notes: 'context' is ideal for exploratory questions. 'search' and 'advancedSearch' are better for targeted fact retrieval.`,
      parameters: QueryMemoryParameters,
      execute: async (args: any) => {
        await this.initPromise;
        const parsed = QueryMemorySchema.safeParse(args);
        if (!parsed.success) return JSON.stringify({ error: "Invalid input", issues: parsed.error.issues });
        const input = parsed.data as any;

        if (input.action === "search") {
          if (!input.query || input.query.trim().length === 0) {
            return JSON.stringify({ error: "Search query must not be empty." });
          }
          const results = await this.hybridSearch.advancedSearch({
            query: input.query,
            limit: input.limit,
            entityTypes: input.entity_types,
            includeEntities: input.include_entities,
            includeObservations: input.include_observations,
          });

          const conflictEntityIds = Array.from(
            new Set(
              results
                .map((r: any) => (r.name ? r.id : r.entity_id))
                .filter((x: any) => typeof x === "string" && x.length > 0),
            ),
          );
          const conflicts = await this.detectStatusConflicts(conflictEntityIds);
          const conflictById = new Map(conflicts.map((c) => [c.entity_id, c]));

          return JSON.stringify(
            results.map((result) => ({
              id: result.id,
              name: result.name,
              type: result.type,
              text: result.text,
              score: result.score,
              source: result.source,
              entity_id: result.entity_id,
              created_at: result.created_at,
              updated_at: result.updated_at,
              metadata: result.metadata,
              explanation: result.explanation,
              conflict_flag: conflictById.get(result.name ? result.id : (result.entity_id as any)) ?? undefined,
            })),
          );
        }

        if (input.action === "advancedSearch") {
          if (!input.query || input.query.trim().length === 0) {
            return JSON.stringify({ error: "Search query must not be empty." });
          }
          const results = await this.hybridSearch.advancedSearch({
            query: input.query,
            limit: input.limit,
            filters: input.filters,
            graphConstraints: input.graphConstraints,
            vectorParams: input.vectorParams,
          });

          const conflictEntityIds = Array.from(
            new Set(
              results
                .map((r: any) => (r.name ? r.id : r.entity_id))
                .filter((x: any) => typeof x === "string" && x.length > 0),
            ),
          );
          const conflicts = await this.detectStatusConflicts(conflictEntityIds);
          const conflictById = new Map(conflicts.map((c) => [c.entity_id, c]));

          return JSON.stringify(
            results.map((result) => ({
              id: result.id,
              name: result.name,
              type: result.type,
              text: result.text,
              score: result.score,
              source: result.source,
              entity_id: result.entity_id,
              created_at: result.created_at,
              updated_at: result.updated_at,
              explanation: result.explanation,
              conflict_flag: conflictById.get(result.name ? result.id : (result.entity_id as any)) ?? undefined,
            })),
          );
        }

        if (input.action === "context") {
          if (!input.query || input.query.trim().length === 0) {
            return JSON.stringify({ error: "Search query must not be empty." });
          }
          const searchResults = await this.hybridSearch.advancedSearch({
            query: input.query,
            limit: input.context_window,
            includeEntities: true,
            includeObservations: true,
            timeRangeHours: input.time_range_hours,
          });

          const entities = searchResults.filter((r) => r.name);
          const observations = searchResults.filter((r) => r.text);

          const conflictEntityIds = Array.from(
            new Set(
              searchResults
                .map((r: any) => (r.name ? r.id : r.entity_id))
                .filter((x: any) => typeof x === "string" && x.length > 0),
            ),
          );
          const conflicts = await this.detectStatusConflicts(conflictEntityIds);
          const conflictById = new Map(conflicts.map((c) => [c.entity_id, c]));

          const graphExpansion = [];
          for (const entity of entities) {
            try {
              const connections = await this.db.run(
                `
                  ?[target_name, rel_type, target_id] := 
                    *relationship{from_id: $id, to_id: target_id, relation_type: rel_type, @ "NOW"}, 
                    *entity{id: target_id, name: target_name, @ "NOW"}
                  
                  ?[target_name, rel_type, target_id] := 
                    *relationship{from_id: target_id, to_id: $id, relation_type: rel_type, @ "NOW"}, 
                    *entity{id: target_id, name: target_name, @ "NOW"}
                `,
                { id: entity.id },
              );

              if (connections.rows.length > 0) {
                graphExpansion.push({
                  entity: entity.name,
                  entity_id: entity.id,
                  connections: connections.rows.map((c: any) => ({
                    target_name: c[0],
                    relation_type: c[1],
                    target_id: c[2],
                  })),
                });
              }
            } catch (e) {
              console.error(`Error during graph expansion for ${entity.name}:`, e);
            }
          }

          const inferred_relations = [];
          for (const entity of entities) {
            try {
              const inferred = await this.inferenceEngine.inferImplicitRelations(entity.id);
              if (Array.isArray(inferred) && inferred.length > 0) inferred_relations.push(...inferred);
            } catch (e) {
              console.error(`Error during implicit inference for ${entity.name}:`, e);
            }
          }
          const enriched_inferred_relations = await this.formatInferredRelationsForContext(inferred_relations);

          const context = {
            query: input.query,
            timestamp: new Date().toISOString(),
            entities: entities.map((r) => ({
              id: r.id,
              name: r.name,
              type: r.type,
              relevance_score: r.score,
              source: r.source,
              uncertainty_hint: r.source === "inference" && typeof r.explanation === 'object' ? r.explanation?.details : undefined,
              conflict_flag: conflictById.get(r.id) ?? undefined,
            })),
            observations: observations.map((r) => ({
              id: r.id,
              text: r.text,
              entity_id: r.entity_id,
              relevance_score: r.score,
              source: r.source,
              conflict_flag: conflictById.get(r.entity_id as any) ?? undefined,
            })),
            graph_context: graphExpansion,
            inferred_relations: enriched_inferred_relations,
            conflict_flags: conflicts,
            total_results: searchResults.length,
          };

          return JSON.stringify(context);
        }

        if (input.action === "graph_rag") {
          if (!input.query || input.query.trim().length === 0) {
            return JSON.stringify({ error: "Search query must not be empty." });
          }
          const results = await this.hybridSearch.graphRag({
            query: input.query,
            limit: input.limit,
            graphConstraints: {
              maxDepth: input.max_depth
            }
          });
          return JSON.stringify(results);
        }

        if (input.action === "graph_walking") {
          if (!input.query || input.query.trim().length === 0) {
            return JSON.stringify({ error: "Search query must not be empty." });
          }
          const results = await this.graph_walking({
            query: input.query,
            start_entity_id: input.start_entity_id,
            max_depth: input.max_depth,
            limit: input.limit
          });
          return JSON.stringify(results);
        }

        if (input.action === "entity_details") {
          const validitySpec = this.resolveValiditySpec(input.as_of);
          if (!validitySpec) return JSON.stringify({ error: "Invalid as_of format" });

          let entityRes, obsRes, relOutRes;

          if (validitySpec === '"NOW"') {
            entityRes = await this.db.run(
              `?[name, type, metadata] := *entity {id: $id, name, type, metadata, @ "NOW"}`,
              { id: input.entity_id },
            );
            if (entityRes.rows.length === 0) return JSON.stringify({ error: "Entity not found" });

            obsRes = await this.db.run(
              `?[text, metadata] := *observation {entity_id: $id, text, metadata, @ "NOW"}`,
              { id: input.entity_id },
            );
            relOutRes = await this.db.run(
              `?[target_id, type, target_name] := *relationship {from_id: $id, to_id: target_id, relation_type: type, @ "NOW"}, *entity {id: target_id, name: target_name, @ "NOW"}`,
              { id: input.entity_id },
            );
          } else {
            // Use standard CozoDB @ operator
            entityRes = await this.db.run(
              `?[name, type, metadata] := *entity {id: $id, name, type, metadata, @ ${validitySpec}}`,
              { id: input.entity_id },
            );
            if (entityRes.rows.length === 0) return JSON.stringify({ error: "Entity not found" });

            obsRes = await this.db.run(
              `?[text, metadata] := *observation {entity_id: $id, text, metadata, @ ${validitySpec}}`,
              { id: input.entity_id },
            );
            relOutRes = await this.db.run(
              `?[target_id, type, target_name] := *relationship {from_id: $id, to_id: target_id, relation_type: type, @ ${validitySpec}}, *entity {id: target_id, name: target_name, @ ${validitySpec}}`,
              { id: input.entity_id },
            );
          }

          return JSON.stringify({
            entity: { name: entityRes.rows[0][0], type: entityRes.rows[0][1], metadata: entityRes.rows[0][2] },
            observations: obsRes.rows.map((r: any) => ({ text: r[0], metadata: r[1] })),
            relations: relOutRes.rows.map((r: any) => ({ target_id: r[0], type: r[1], target_name: r[2] })),
          });
        }

        if (input.action === "history") {
          const entityRes = await this.db.run(
            `?[ts, asserted, name, type, metadata] := *entity{id: $id, name, type, metadata, created_at}, ts = to_int(created_at), asserted = to_bool(created_at) :order ts`,
            { id: input.entity_id },
          );
          if (entityRes.rows.length === 0) return JSON.stringify({ error: "Entity not found" });

          const obsRes = await this.db.run(
            `?[ts, asserted, id, text, metadata] := *observation{id, entity_id: $id, text, metadata, created_at}, ts = to_int(created_at), asserted = to_bool(created_at) :order ts`,
            { id: input.entity_id },
          );
          const relOutRes = await this.db.run(
            `?[ts, asserted, target_id, type, strength, metadata] := *relationship{from_id: $id, to_id: target_id, relation_type: type, strength, metadata, created_at}, ts = to_int(created_at), asserted = to_bool(created_at) :order ts`,
            { id: input.entity_id },
          );
          const relInRes = await this.db.run(
            `?[ts, asserted, source_id, type, strength, metadata] := *relationship{from_id: source_id, to_id: $id, relation_type: type, strength, metadata, created_at}, ts = to_int(created_at), asserted = to_bool(created_at) :order ts`,
            { id: input.entity_id },
          );

          return JSON.stringify({
            entity_history: entityRes.rows.map((r: any) => ({
              timestamp: r[0],
              asserted: r[1],
              name: r[2],
              type: r[3],
              metadata: r[4],
            })),
            observation_history: obsRes.rows.map((r: any) => ({
              timestamp: r[0],
              asserted: r[1],
              id: r[2],
              text: r[3],
              metadata: r[4],
            })),
            relation_history: {
              outgoing: relOutRes.rows.map((r: any) => ({
                timestamp: r[0],
                asserted: r[1],
                target_id: r[2],
                type: r[3],
                strength: r[4],
                metadata: r[5],
              })),
              incoming: relInRes.rows.map((r: any) => ({
                timestamp: r[0],
                asserted: r[1],
                source_id: r[2],
                type: r[3],
                strength: r[4],
                metadata: r[5],
              })),
            },
          });
        }

        return JSON.stringify({ error: "Unknown action" });
      },
    });

    const AnalyzeGraphSchema = z.discriminatedUnion("action", [
      z.object({
        action: z.literal("explore"),
        start_entity: z.string().describe("Start entity ID"),
        end_entity: z.string().optional().describe("Target entity ID"),
        max_hops: z.number().min(1).max(5).optional().default(3).describe("Maximum number of hops"),
        relation_types: z.array(z.string()).optional().describe("Filter by relationship types"),
      }),
      z.object({
        action: z.literal("communities"),
      }),
      z.object({
        action: z.literal("pagerank"),
      }),
      z.object({
        action: z.literal("betweenness"),
      }),
      z.object({
        action: z.literal("hits"),
      }),
      z.object({
        action: z.literal("connected_components"),
      }),
      z.object({
        action: z.literal("shortest_path"),
        start_entity: z.string().describe("Start entity ID"),
        end_entity: z.string().describe("Target entity ID"),
      }),
      z.object({
        action: z.literal("bridge_discovery"),
      }),
      z.object({
        action: z.literal("infer_relations"),
        entity_id: z.string().describe("ID of the entity"),
      }),
      z.object({
        action: z.literal("get_relation_evolution"),
        from_id: z.string().describe("ID of the source entity"),
        to_id: z.string().optional().describe("Optional ID of the target entity (if omitted, evolution of all outgoing relationships of the source entity is shown)"),
      }),
      z.object({
        action: z.literal("semantic_walk"),
        start_entity: z.string().describe("Start entity ID"),
        max_depth: z.number().optional().default(3).describe("Maximum depth (Default: 3)"),
        min_similarity: z.number().optional().default(0.7).describe("Minimum similarity (0.0-1.0, Default: 0.7)"),
      }),
      z.object({
        action: z.literal("hnsw_clusters"),
      }),
    ]);

    const AnalyzeGraphParameters = z.object({
      action: z
        .enum(["explore", "communities", "pagerank", "betweenness", "hits", "connected_components", "shortest_path", "bridge_discovery", "infer_relations", "get_relation_evolution", "semantic_walk", "hnsw_clusters"])
        .describe("Action (determines which fields are required)"),
      start_entity: z.string().optional().describe("Required for explore/shortest_path/semantic_walk (Start entity ID)"),
      end_entity: z.string().optional().describe("Optional for explore / required for shortest_path"),
      max_hops: z.number().optional().describe("Optional for explore"),
      relation_types: z.array(z.string()).optional().describe("Optional for explore"),
      entity_id: z.string().optional().describe("Required for infer_relations"),
      from_id: z.string().optional().describe("Required for get_relation_evolution"),
      to_id: z.string().optional().describe("Optional for get_relation_evolution"),
      max_depth: z.number().optional().describe("Optional for semantic_walk"),
      min_similarity: z.number().optional().describe("Optional for semantic_walk"),
    });

    this.mcp.addTool({
      name: "analyze_graph",
      description: `Graph analysis and advanced retrieval strategies. Select operation via 'action'.
Supported actions:
- 'explore': Navigates through the graph. Params: { start_entity: string, end_entity?: string, max_hops?: number, relation_types?: string[] }.
  * Without end_entity: Returns the neighborhood (up to 5 hops).
  * With end_entity: Finds the shortest path (BFS).
- 'communities': Recomputes entity groups (communities) using Label Propagation.
- 'pagerank': Calculates the importance of entities (Top 10).
- 'betweenness': Finds central bridge entities (Betweenness Centrality).
- 'hits': Identifies Hubs and Authorities.
- 'connected_components': Identifies isolated subgraphs.
- 'shortest_path': Calculates the shortest path between two entities (Dijkstra). Params: { start_entity: string, end_entity: string }.
- 'bridge_discovery': Identifies bridge entities between communities.
- 'infer_relations': Starts the inference engine for an entity. Params: { entity_id: string }.
- 'get_relation_evolution': Tracks the temporal evolution of relationships. Params: { from_id: string, to_id?: string }.
- 'semantic_walk': Performs a recursive "Graph Walk" that follows both explicit relationships and semantic similarity. Params: { start_entity: string, max_depth?: number, min_similarity?: number }.
- 'hnsw_clusters': Analyzes clusters directly on the HNSW graph (Layer 0). Extremely fast as no vector calculations are needed.`,
      parameters: AnalyzeGraphParameters,
      execute: async (args: any) => {
        await this.initPromise;
        const parsed = AnalyzeGraphSchema.safeParse(args);
        if (!parsed.success) return JSON.stringify({ error: "Invalid input", issues: parsed.error.issues });
        const input = parsed.data as any;

        if (input.action === "infer_relations") {
          try {
            // Check if entity exists
            const entityRes = await this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: input.entity_id });
            if (entityRes.rows.length === 0) {
              return JSON.stringify({ error: `Entity with ID '${input.entity_id}' not found` });
            }
            const suggestions = await this.inferenceEngine.inferRelations(input.entity_id);
            return JSON.stringify({ entity_id: input.entity_id, suggestions });
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Error during inference" });
          }
        }

        if (input.action === "bridge_discovery") {
          try {
            const bridges = await this.findBridgeEntities();
            return JSON.stringify({ bridge_count: bridges.length, bridges });
          } catch (error: any) {
            console.error("Bridge Discovery Error:", error);
            return JSON.stringify({ error: error.message || "Error during bridge discovery" });
          }
        }

        if (input.action === "communities") {
          try {
            const mapping = await this.recomputeCommunities();

            const entitiesRes = await this.db.run('?[id, name, type] := *entity{id, name, type, @ "NOW"}');
            const entityMap = new Map();
            entitiesRes.rows.forEach((r: any) => entityMap.set(r[0], { name: r[1], type: r[2] }));

            const communities: Record<string, any[]> = {};
            mapping.forEach((r: any) => {
              const communityId = String(r.community_id);
              const entityId = r.entity_id;
              const info = entityMap.get(entityId) || { name: "Unknown", type: "Unknown" };

              if (!communities[communityId]) communities[communityId] = [];
              communities[communityId].push({ id: entityId, name: info.name, type: info.type });
            });

            return JSON.stringify({ community_count: Object.keys(communities).length, communities });
          } catch (error: any) {
            console.error("Community Detection Error:", error);
            return JSON.stringify({ error: error.message || "Error during community detection" });
          }
        }

        if (input.action === "pagerank") {
          try {
            const results = await this.recomputePageRank();
            return JSON.stringify({
              status: "completed",
              entity_count: results.length,
              top_ranks: results.sort((a: any, b: any) => b.pagerank - a.pagerank).slice(0, 10)
            });
          } catch (error: any) {
            console.error("PageRank Error:", error);
            return JSON.stringify({ error: error.message || "Error during PageRank calculation" });
          }
        }

        if (input.action === "betweenness") {
          try {
            const results = await this.recomputeBetweennessCentrality();
            return JSON.stringify({
              status: "completed",
              entity_count: results.length,
              top_centrality: results.sort((a: any, b: any) => b.centrality - a.centrality).slice(0, 10)
            });
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Error during Betweenness Centrality" });
          }
        }

        if (input.action === "hits") {
          try {
            const results = await this.recomputeHITS();
            return JSON.stringify({
              status: "completed",
              entity_count: results.length,
              top_hubs: results.sort((a: any, b: any) => b.hub - a.hub).slice(0, 5),
              top_authorities: results.sort((a: any, b: any) => b.authority - a.authority).slice(0, 5)
            });
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Error during HITS calculation" });
          }
        }

        if (input.action === "connected_components") {
          try {
            const results = await this.recomputeConnectedComponents();
            const groups: Record<string, string[]> = {};
            results.forEach((r: any) => {
              if (!groups[r.component_id]) groups[r.component_id] = [];
              groups[r.component_id].push(r.entity_id);
            });
            return JSON.stringify({
              component_count: Object.keys(groups).length,
              components: groups
            });
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Error during Connected Components" });
          }
        }

        if (input.action === "shortest_path") {
          try {
            const result = await this.computeShortestPath({
              start_entity: input.start_entity,
              end_entity: input.end_entity
            });
            if (!result) return JSON.stringify({ error: "No path found" });
            return JSON.stringify(result);
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Error during Shortest Path" });
          }
        }

        if (input.action === "explore") {
          try {
            const result = await this.exploreGraph({
              start_entity: input.start_entity,
              end_entity: input.end_entity,
              max_hops: input.max_hops,
              relation_types: input.relation_types,
            });
            return JSON.stringify(result);
          } catch (error: any) {
            console.error("Error during Graph Traversal:", error);
            return JSON.stringify({ error: "Graph Traversal failed", details: error.message });
          }
        }

        if (input.action === "get_relation_evolution") {
          try {
            const fromId = input.from_id;
            const toId = input.to_id;

            // Fetch entity names for better output
            const fromEntityRes = await this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: fromId });
            if (fromEntityRes.rows.length === 0) {
              return JSON.stringify({ error: `Source entity with ID '${fromId}' not found` });
            }
            const fromName = fromEntityRes.rows[0][0];

            let query = "";
            let params: any = { from: fromId };

            if (toId) {
              const toEntityRes = await this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: toId });
              if (toEntityRes.rows.length === 0) {
                return JSON.stringify({ error: `Target entity with ID '${toId}' not found` });
              }
              params.to = toId;
              query = `
                ?[ts, asserted, target_name, rel_type, strength, metadata] := 
                  *relationship{from_id: $from, to_id: $to, relation_type: rel_type, strength, metadata, created_at},
                  *entity{id: $to, name: target_name, @ "NOW"},
                  ts = to_int(created_at),
                  asserted = to_bool(created_at)
                :order ts
              `;
            } else {
              query = `
                ?[ts, asserted, target_name, rel_type, strength, metadata] := 
                  *relationship{from_id: $from, to_id: target_id, relation_type: rel_type, strength, metadata, created_at},
                  *entity{id: target_id, name: target_name, @ "NOW"},
                  ts = to_int(created_at),
                  asserted = to_bool(created_at)
                :order ts
              `;
            }

            const res = await this.db.run(query, params);
            
            const history = res.rows.map((r: any) => ({
              timestamp: r[0],
              iso_date: new Date(r[0] / 1000).toISOString(), // Cozo uses microseconds for Validity
              action: r[1] ? "ASSERTED" : "RETRACTED",
              target_name: r[2],
              relation_type: r[3],
              strength: r[4],
              metadata: r[5],
            }));

            // Group by relationship (target + type) to show transitions
    const evolution: Record<string, any[]> = {};
    history.forEach((h: any) => {
      const key = `${h.target_name}:${h.relation_type}`;
      if (!evolution[key]) evolution[key] = [];
      evolution[key].push(h);
    });

            return JSON.stringify({
              from_name: fromName,
              from_id: fromId,
              timeline: history,
              grouped_evolution: evolution,
              description: "Shows the temporal evolution of relationships. 'ASSERTED' means the relationship was created or updated, 'RETRACTED' means it was ended/deleted."
            });
          } catch (error: any) {
            console.error("Error during Relation Evolution:", error);
            return JSON.stringify({ error: error.message || "Error during Relation Evolution" });
          }
        }

        if (input.action === "semantic_walk") {
          try {
            const startEntityId = input.start_entity;
            const maxDepth = input.max_depth || 3;
            const minSimilarity = input.min_similarity || 0.7;

            // Check if start entity exists
            const entityRes = await this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: startEntityId });
            if (entityRes.rows.length === 0) {
              return JSON.stringify({ error: `Start entity with ID '${startEntityId}' not found` });
            }
            const startName = entityRes.rows[0][0];

            console.error(`[SemanticWalk] Starting walk for '${startName}' (${startEntityId}) - Depth: ${maxDepth}, MinSim: ${minSimilarity}`);
            
            const results = await this.inferenceEngine.semanticGraphWalk(startEntityId, maxDepth, minSimilarity);
            
            // Enrich results with names
            const enrichedResults = await Promise.all(results.map(async (r) => {
              const nameRes = await this.db.run('?[name, type] := *entity{id: $id, name, type, @ "NOW"}', { id: r.entity_id });
              const name = nameRes.rows.length > 0 ? nameRes.rows[0][0] : "Unknown";
              const type = nameRes.rows.length > 0 ? nameRes.rows[0][1] : "Unknown";
              return {
                ...r,
                entity_name: name,
                entity_type: type
              };
            }));

            return JSON.stringify({
              start_entity: { id: startEntityId, name: startName },
              parameters: { max_depth: maxDepth, min_similarity: minSimilarity },
              found_entities: enrichedResults.length,
              results: enrichedResults
            });
          } catch (error: any) {
            console.error("Error during Semantic Walk:", error);
            return JSON.stringify({ error: error.message || "Error during Semantic Walk" });
          }
        }

        if (input.action === "hnsw_clusters") {
          try {
            const clusters = await this.inferenceEngine.analyzeHnswClusters();
            return JSON.stringify({ cluster_count: clusters.length, clusters });
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Error during HNSW Cluster Analysis" });
          }
        }

        return JSON.stringify({ error: "Unknown action" });
      },
    });

    const ManageSystemSchema = z.discriminatedUnion("action", [
      z.object({ action: z.literal("health") }),
      z.object({
        action: z.literal("snapshot_create"),
        metadata: MetadataSchema.optional().describe("Additional metadata for the snapshot"),
      }),
      z.object({ action: z.literal("snapshot_list") }),
      z.object({
        action: z.literal("snapshot_diff"),
        snapshot_id_a: z.string().describe("First snapshot"),
        snapshot_id_b: z.string().describe("Second snapshot"),
      }),
      z.object({
        action: z.literal("cleanup"),
        confirm: z.boolean().describe("Must be true to confirm cleanup"),
        older_than_days: z.number().min(1).max(3650).optional().default(30),
        max_observations: z.number().min(1).max(200).optional().default(20),
        min_entity_degree: z.number().min(0).max(100).optional().default(2),
        model: z.string().optional().default("demyagent-4b-i1:Q6_K"),
      }),
      z.object({
        action: z.literal("reflect"),
        entity_id: z.string().optional().describe("Optional entity ID for targeted reflection"),
        model: z.string().optional().default("demyagent-4b-i1:Q6_K"),
      }),
      z.object({
        action: z.literal("clear_memory"),
        confirm: z.boolean().describe("Must be true to confirm deletion"),
      }),
    ]);

    const ManageSystemParameters = z.object({
      action: z
        .enum(["health", "snapshot_create", "snapshot_list", "snapshot_diff", "cleanup", "reflect", "clear_memory"])
        .describe("Action (determines which fields are required)"),
      snapshot_id_a: z.string().optional().describe("Required for snapshot_diff"),
      snapshot_id_b: z.string().optional().describe("Required for snapshot_diff"),
      metadata: MetadataSchema.optional().describe("Optional for snapshot_create"),
      confirm: z.boolean().optional().describe("Required for cleanup/clear_memory and must be true"),
      older_than_days: z.number().optional().describe("Optional for cleanup"),
      max_observations: z.number().optional().describe("Optional for cleanup"),
      min_entity_degree: z.number().optional().describe("Optional for cleanup"),
      model: z.string().optional().describe("Optional for cleanup/reflect"),
      entity_id: z.string().optional().describe("Optional for reflect"),
    });

    this.mcp.addTool({
      name: "manage_system",
      description: `System maintenance and memory management. Select operation via 'action'.
Supported actions:
- 'health': Status check. Returns DB counts and embedding cache statistics.
- 'snapshot_create': Creates a backup point. Params: { metadata?: object }.
- 'snapshot_list': Lists all available snapshots.
- 'snapshot_diff': Compares two snapshots. Params: { snapshot_id_a: string, snapshot_id_b: string }.
- 'cleanup': Janitor service for consolidation. Params: { confirm: boolean, older_than_days?: number, max_observations?: number, min_entity_degree?: number, model?: string }.
  * With confirm=false: Dry-Run (shows candidates).
  * With confirm=true: Merges old/isolated fragments using LLM (Executive Summary) and removes noise.
- 'reflect': Reflection service. Analyzes memory for contradictions and insights. Params: { entity_id?: string, model?: string }.
- 'clear_memory': Resets the entire database. Params: { confirm: boolean (must be true) }.`,
      parameters: ManageSystemParameters,
      execute: async (args: any) => {
        await this.initPromise;
        const parsed = ManageSystemSchema.safeParse(args);
        if (!parsed.success) return JSON.stringify({ error: "Invalid input", issues: parsed.error.issues });
        const input = parsed.data as any;

        if (input.action === "health") {
          try {
            const [entityResult, obsResult, relResult] = await Promise.all([
              this.db.run('?[id] := *entity{id, @ "NOW"}'),
              this.db.run('?[id] := *observation{id, @ "NOW"}'),
              this.db.run('?[from_id, to_id] := *relationship{from_id, to_id, @ "NOW"}'),
            ]);

            return JSON.stringify({
              status: "healthy",
              database: {
                entities: entityResult.rows.length,
                observations: obsResult.rows.length,
                relations: relResult.rows.length,
              },
              performance: { embedding_cache: this.embeddingService.getCacheStats() },
              timestamp: new Date().toISOString(),
            });
          } catch (error: any) {
            return JSON.stringify({ status: "error", error: error.message, timestamp: new Date().toISOString() });
          }
        }

        if (input.action === "snapshot_create") {
          try {
            // Optimization: Sequential execution and count aggregation instead of full fetch
            const entityResult = await this.db.run('?[count(id)] := *entity{id, @ "NOW"}');
            const obsResult = await this.db.run('?[count(id)] := *observation{id, @ "NOW"}');
            const relResult = await this.db.run('?[count(from_id)] := *relationship{from_id, to_id, @ "NOW"}');

            const snapshot_id = uuidv4();
            const counts = {
              entities: Number(entityResult.rows[0]?.[0] || 0),
              observations: Number(obsResult.rows[0]?.[0] || 0),
              relations: Number(relResult.rows[0]?.[0] || 0),
            };

            const now = Date.now();
            await this.db.run(
              "?[snapshot_id, entity_count, observation_count, relation_count, metadata, created_at] <- [[$id, $e, $o, $r, $meta, $now]]:put memory_snapshot {snapshot_id => entity_count, observation_count, relation_count, metadata, created_at}",
              {
                id: snapshot_id,
                e: counts.entities,
                o: counts.observations,
                r: counts.relations,
                meta: input.metadata || {},
                now,
              },
            );

            return JSON.stringify({ snapshot_id, ...counts, status: "Snapshot created" });
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Error creating snapshot" });
          }
        }

        if (input.action === "snapshot_list") {
          try {
            const result = await this.db.run(
              "?[id, e, o, r, meta, created_at] := *memory_snapshot{snapshot_id: id, entity_count: e, observation_count: o, relation_count: r, metadata: meta, created_at: created_at}",
            );
            return JSON.stringify(
              result.rows.map((r: any) => ({
                snapshot_id: r[0],
                entity_count: r[1],
                observation_count: r[2],
                relation_count: r[3],
                metadata: r[4],
                created_at: r[5],
              })),
            );
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Error listing snapshots" });
          }
        }

        if (input.action === "snapshot_diff") {
          try {
            const [aRes, bRes] = await Promise.all([
              this.db.run(
                "?[id, e, o, r, meta, created_at] := *memory_snapshot{snapshot_id: id, entity_count: e, observation_count: o, relation_count: r, metadata: meta, created_at: created_at}, id = $id :limit 1",
                { id: input.snapshot_id_a },
              ),
              this.db.run(
                "?[id, e, o, r, meta, created_at] := *memory_snapshot{snapshot_id: id, entity_count: e, observation_count: o, relation_count: r, metadata: meta, created_at: created_at}, id = $id :limit 1",
                { id: input.snapshot_id_b },
              ),
            ]);

            if (aRes.rows.length === 0 || bRes.rows.length === 0) {
              return JSON.stringify({
                error: "Snapshot not found",
                missing: {
                  snapshot_id_a: aRes.rows.length === 0 ? input.snapshot_id_a : undefined,
                  snapshot_id_b: bRes.rows.length === 0 ? input.snapshot_id_b : undefined,
                },
              });
            }

            const a = aRes.rows[0];
            const b = bRes.rows[0];

            const aCounts = { entities: a[1], observations: a[2], relations: a[3] };
            const bCounts = { entities: b[1], observations: b[2], relations: b[3] };
            const aCreated = Number(a[5]);
            const bCreated = Number(b[5]);

            return JSON.stringify({
              snapshot_id_a: a[0],
              snapshot_id_b: b[0],
              created_at: { a: aCreated, b: bCreated, delta_ms: bCreated - aCreated },
              counts: {
                entities: { a: aCounts.entities, b: bCounts.entities, delta: bCounts.entities - aCounts.entities },
                observations: { a: aCounts.observations, b: bCounts.observations, delta: bCounts.observations - aCounts.observations },
                relations: { a: aCounts.relations, b: bCounts.relations, delta: bCounts.relations - aCounts.relations },
              },
              metadata: { a: a[4], b: b[4] },
            });
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Error during snapshot diff" });
          }
        }

        if (input.action === "cleanup") {
          try {
            const result = await this.janitorCleanup({
              confirm: Boolean(input.confirm),
              older_than_days: input.older_than_days,
              max_observations: input.max_observations,
              min_entity_degree: input.min_entity_degree,
              model: input.model,
            });
            return JSON.stringify(result);
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Error during cleanup" });
          }
        }

        if (input.action === "reflect") {
          try {
            const result = await this.reflectMemory({
              entity_id: input.entity_id,
              model: input.model,
            });
            return JSON.stringify(result);
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Error during reflection" });
          }
        }

        if (input.action === "clear_memory") {
          if (!input.confirm) {
            return JSON.stringify({ error: "Deletion not confirmed. Set 'confirm' to true." });
          }

          try {
            await this.db.run(`
              { ?[id, created_at] := *observation{id, created_at} :rm observation {id, created_at} }
              { ?[from_id, to_id, relation_type, created_at] := *relationship{from_id, to_id, relation_type, created_at} :rm relationship {from_id, to_id, relation_type, created_at} }
              { ?[id, created_at] := *entity{id, created_at} :rm entity {id, created_at} }
            `);

            return JSON.stringify({ status: "Memory completely cleared" });
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Error clearing memory" });
          }
        }

        return JSON.stringify({ error: "Unknown action" });
      },
    });
  }

  public async start() {
    await this.mcp.start({ transportType: "stdio" });
    console.error("Cozo Memory MCP Server running on stdio");
  }
}

if (require.main === module) {
  const server = new MemoryServer();
  server.start().catch((err) => {
    console.error("Server could not be started:", err);
    process.exit(1);
  });
}
