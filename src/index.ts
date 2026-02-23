import { FastMCP } from "fastmcp";
import { CozoDb } from "cozo-node";
import { z } from "zod";
import { v4 as uuidv4, validate as uuidValidate } from "uuid";
import path from "path";
import { EmbeddingService } from "./embedding-service";
import { HybridSearch } from "./hybrid-search";
import { InferenceEngine } from "./inference-engine";

export const DB_PATH = path.resolve(__dirname, "..", "memory_db.cozo");
const DB_ENGINE = process.env.DB_ENGINE || "sqlite"; // "sqlite" oder "rocksdb"
const EMBEDDING_MODEL = "Xenova/bge-m3";
const EMBEDDING_DIM = 1024;

export const USER_ENTITY_ID = "global_user_profile";
export const USER_ENTITY_NAME = "Der Benutzer";
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
    console.error(`[DB] Verwende Backend: ${DB_ENGINE}, Pfad: ${fullDbPath}`);
    this.embeddingService = new EmbeddingService();
    this.hybridSearch = new HybridSearch(this.db, this.embeddingService);
    this.inferenceEngine = new InferenceEngine(this.db, this.embeddingService);

    this.mcp = new FastMCP({
      name: "cozo-memory-server",
      version: "1.0.0",
    });

    this.initPromise = (async () => {
      await this.setupSchema();
      console.error("[Server] Schema Setup vollständig abgeschlossen.");
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

    // Cache-Bereinigung IMMER durchführen, unabhängig von Observation-Kandidaten
    const cutoff = Math.floor((Date.now() - olderThanDays * 24 * 3600 * 1000) / 1000);
    console.error(`[Janitor] Bereinige Cache (älter als ${new Date(cutoff * 1000).toISOString()}, ts=${cutoff})...`);
    
    let cacheDeletedCount = 0;
    try {
      // Zuerst zählen, was wir löschen wollen
      const toDeleteRes = await this.db.run(`?[query_hash] := *search_cache{query_hash, created_at}, created_at < $cutoff`, { cutoff });
      const toDeleteHashes = toDeleteRes.rows.map((r: any) => [r[0]]);
       
       if (toDeleteHashes.length > 0) {
         console.error(`[Janitor] Lösche ${toDeleteHashes.length} Cache-Einträge...`);
         // Wir nutzen :delete mit den Hashes (als Liste von Listen)
         const deleteRes = await this.db.run(`
           ?[query_hash] <- $hashes
           :delete search_cache {query_hash}
         `, { hashes: toDeleteHashes });
        console.error(`[Janitor] :delete Ergebnis:`, JSON.stringify(deleteRes));
        cacheDeletedCount = toDeleteHashes.length;
      } else {
        console.error(`[Janitor] Keine veralteten Cache-Einträge gefunden.`);
      }
    } catch (e: any) {
      console.error(`[Janitor] Cache-Bereinigung Fehler:`, e.message);
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
    if (!summary_entity_id) return { error: "Konnte Summary-Entität nicht erstellen" };

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
        "Hier sind ältere Fragmente (oder frühere Zusammenfassungen) aus deinem Gedächtnis. Fasse sie zu einer einzigen, dauerhaften Executive Summary zusammen. Antworte nur mit der Executive Summary.";

      const userPrompt =
        `Entität: ${entityName} (${entityType})\nLevel: ${nextLevel}\n\nFragmente:\n` + obs.map((o) => `- ${o.text}`).join("\n");

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
        summaryText = "Zusammenfassung (Fallback): " + obs.map(o => o.text).join("; ");
      }

      if (!summaryText || summaryText.trim() === "" || summaryText.trim().toUpperCase() === "DELETE") {
        summaryText = "Zusammenfassung (Fallback): " + obs.map((o) => o.text).join("; ");
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
      console.error("[Communities] Keine Beziehungen gefunden, überspringe LabelPropagation.");
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
      console.error("[Betweenness] Keine Beziehungen gefunden, überspringe Betweenness Centrality.");
      return [];
    }

    const query = `
      edges[f, t] := *relationship{from_id: f, to_id: t, @ "NOW"}
      temp_betweenness[entity_id, centrality] <~ BetweennessCentrality(edges[f, t])
      ?[entity_id, centrality] := temp_betweenness[entity_id, centrality]
    `.trim();

    try {
      const result = await this.db.run(query);
      console.error(`[Betweenness] ${result.rows.length} Entitäten berechnet.`);
      return result.rows.map((r: any) => ({ entity_id: String(r[0]), centrality: Number(r[1]) }));
    } catch (e: any) {
      console.error("[Betweenness] Fehler bei Berechnung:", e.message);
      return [];
    }
  }

  public async recomputeConnectedComponents() {
    await this.initPromise;

    const edgeCheckRes = await this.db.run(`?[from_id] := *relationship{from_id, @ "NOW"} :limit 1`);
    if (edgeCheckRes.rows.length === 0) {
      console.error("[ConnectedComponents] Keine Beziehungen gefunden.");
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
      console.error("[ConnectedComponents] Fehler bei Berechnung:", e.message);
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
      console.error("[ShortestPath] Fehler bei Berechnung:", e.message);
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
      console.error("[HITS] Fehler bei Berechnung:", e.message);
      return [];
    }
  }

  public async recomputePageRank() {
    await this.initPromise;

    const edgeCheckRes = await this.db.run(`?[from_id] := *relationship{from_id, @ "NOW"} :limit 1`);
    if (edgeCheckRes.rows.length === 0) {
      console.error("[PageRank] Keine Beziehungen gefunden, überspringe PageRank.");
      return [];
    }

    const query = `
      edges[f, t, s] := *relationship{from_id: f, to_id: t, strength: s, @ "NOW"}
      temp_rank[entity_id, rank] <~ PageRank(edges[f, t, s])
      ?[entity_id, rank] := temp_rank[entity_id, rank]
    `.trim();
    
    try {
      const result = await this.db.run(query);
      
      // Ergebnisse speichern
      for (const row of result.rows as any[]) {
        const entity_id = String(row[0]);
        const pagerank = Float64Array.from([row[1]])[0]; // Sicherstellen dass es ein float ist
        await this.db.run(
          `?[entity_id, pagerank] <- [[$entity_id, $pagerank]]
           :put entity_rank {entity_id => pagerank}`,
          { entity_id, pagerank }
        );
      }
      
      console.error(`[PageRank] ${result.rows.length} Entitäten gerankt.`);
      return result.rows.map((r: any) => ({ entity_id: String(r[0]), pagerank: Number(r[1]) }));
    } catch (e: any) {
      console.error("[PageRank] Fehler bei Berechnung:", e.message);
      return [];
    }
  }

  private async setupSchema() {
    try {
      console.error("[Schema] Initialisiere Schema...");
      
      const existingRelations = await this.db.run("::relations");
      const relations = existingRelations.rows.map((r: any) => r[0]);

      // Entity Tabelle
      if (!relations.includes("entity")) {
        try {
          await this.db.run(`{:create entity {id: String, created_at: Validity => name: String, type: String, embedding: <F32; ${EMBEDDING_DIM}>, name_embedding: <F32; ${EMBEDDING_DIM}>, metadata: Json}}`);
          console.error("[Schema] Entity Tabelle erstellt.");
        } catch (e: any) {
          console.error("[Schema] Entity Tabelle Fehler:", e.message);
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
            console.error("[Schema] Entity Tabelle migriert (Validity).");
          }
        }
      }

      try {
        await this.db.run(`{::hnsw create entity:semantic {dim: ${EMBEDDING_DIM}, m: 16, dtype: F32, fields: [embedding], distance: Cosine, ef_construction: 200}}`);
        console.error("[Schema] Entity HNSW Index erstellt.");
      } catch (e: any) {
        // Index Fehler ignorieren wir meistens, da ::hnsw create keinen einfachen Check hat
        if (!e.message.includes("already exists") && !e.message.includes("unexpected input")) {
            console.error("[Schema] Entity Index Hinweis:", e.message);
        }
      }

      try {
        await this.db.run(`{::hnsw create entity:name_semantic {dim: ${EMBEDDING_DIM}, m: 16, dtype: F32, fields: [name_embedding], distance: Cosine, ef_construction: 200}}`);
        console.error("[Schema] Entity Name-HNSW Index erstellt.");
      } catch (e: any) {
        if (!e.message.includes("already exists") && !e.message.includes("unexpected input")) {
            console.error("[Schema] Entity Name-Index Hinweis:", e.message);
        }
      }

      // Gefilterte HNSW Indizes für häufige Typen (v1.7)
      const commonTypes = ['Person', 'Project', 'Task', 'Note'];
      for (const type of commonTypes) {
        try {
          await this.db.run(`{::hnsw create entity:semantic_${type.toLowerCase()} {dim: ${EMBEDDING_DIM}, m: 16, dtype: F32, fields: [embedding], distance: Cosine, ef_construction: 200, filter: type == '${type}'}}`);
          console.error(`[Schema] Entity HNSW Index für ${type} erstellt.`);
        } catch (e: any) {
          if (!e.message.includes("already exists") && !e.message.includes("unexpected input")) {
              console.error(`[Schema] Entity Index (${type}) Hinweis:`, e.message);
          }
        }
      }

      // Observation Tabelle
      if (!relations.includes("observation")) {
        try {
          await this.db.run(`{:create observation {id: String, created_at: Validity => entity_id: String, text: String, embedding: <F32; ${EMBEDDING_DIM}>, metadata: Json}}`);
          console.error("[Schema] Observation Tabelle erstellt.");
        } catch (e: any) {
          console.error("[Schema] Observation Tabelle Fehler:", e.message);
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
          console.error("[Schema] Observation Tabelle migriert (Validity).");
        }
      }
      
      try {
        await this.db.run(`{::hnsw create observation:semantic {dim: ${EMBEDDING_DIM}, m: 16, dtype: F32, fields: [embedding], distance: Cosine, ef_construction: 200}}`);
        console.error("[Schema] Observation HNSW Index erstellt.");
      } catch (e: any) {
        if (!e.message.includes("already exists") && !e.message.includes("unexpected input")) {
            console.error("[Schema] Observation Index Hinweis:", e.message);
        }
      }

      // FTS Indizes (v0.7 Feature)
      try {
        await this.db.run(`
          ::fts create entity:fts {
            extractor: name,
            tokenizer: Simple,
            filters: [Lowercase, Stemmer('german'), Stopwords('de')]
          }
        `);
        console.error("[Schema] Entity FTS Index erstellt.");
      } catch (e: any) {
        if (!e.message.includes("already exists")) {
          console.error("[Schema] Entity FTS Fehler:", e.message);
        }
      }

      try {
        await this.db.run(`
          ::fts create observation:fts {
            extractor: text,
            tokenizer: Simple,
            filters: [Lowercase, Stemmer('german'), Stopwords('de')]
          }
        `);
        console.error("[Schema] Observation FTS Index erstellt.");
      } catch (e: any) {
        if (!e.message.includes("already exists")) {
          console.error("[Schema] Observation FTS Fehler:", e.message);
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
        console.error("[Schema] Observation LSH Index erstellt.");
      } catch (e: any) {
        if (!e.message.includes("already exists")) {
          console.error("[Schema] Observation LSH Fehler:", e.message);
        }
      }

      // Semantic Cache Tabelle (v0.8+)
      if (!relations.includes("search_cache")) {
        try {
          await this.db.run(`{:create search_cache {query_hash: String => query_text: String, results: Json, options: Json, embedding: <F32; ${EMBEDDING_DIM}>, created_at: Int}}`);
          console.error("[Schema] Search Cache Tabelle erstellt.");
          
          await this.db.run(`{::hnsw create search_cache:semantic {dim: ${EMBEDDING_DIM}, m: 16, dtype: F32, fields: [embedding], distance: Cosine, ef_construction: 200}}`);
          console.error("[Schema] Search Cache HNSW Index erstellt.");
        } catch (e: any) {
          console.error("[Schema] Search Cache Setup Fehler:", e.message);
        }
      }

      // Relationship Tabelle
      if (!relations.includes("relationship")) {
        try {
          await this.db.run('{:create relationship {from_id: String, to_id: String, relation_type: String, created_at: Validity => strength: Float, metadata: Json}}');
          console.error("[Schema] Relationship Tabelle erstellt.");
        } catch (e: any) {
          console.error("[Schema] Relationship Tabelle Fehler:", e.message);
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
          console.error("[Schema] Relationship Tabelle migriert (Validity).");
        }
      }

      // Entity Community Tabelle
      if (!relations.includes("entity_community")) {
        try {
          await this.db.run('{:create entity_community {entity_id: String => community_id: String}}');
          console.error("[Schema] Entity Community Tabelle erstellt.");
        } catch (e: any) {
          console.error("[Schema] Entity Community Tabelle Fehler:", e.message);
        }
      } else {
        try {
          await this.db.run(`
            ?[entity_id, community_id] :=
              *entity_community{entity_id, community_id}
            :replace entity_community {entity_id: String => community_id: String}
          `);
          console.error("[Schema] Entity Community Tabelle migriert (Key-Value).");
        } catch (e: any) {
          console.error("[Schema] Entity Community Migration Hinweis:", e.message);
        }
      }

      // Entity Rank Tabelle (PageRank Scores)
      if (!relations.includes("entity_rank")) {
        try {
          await this.db.run('{:create entity_rank {entity_id: String => pagerank: Float}}');
          console.error("[Schema] Entity Rank Tabelle erstellt.");
        } catch (e: any) {
          console.error("[Schema] Entity Rank Tabelle Fehler:", e.message);
        }
      }

      // Memory Snapshot Tabelle
      if (!relations.includes("memory_snapshot")) {
        try {
          await this.db.run('{:create memory_snapshot {snapshot_id => entity_count: Int, observation_count: Int, relation_count: Int, metadata: Json, created_at: Int}}');
          console.error("[Schema] Snapshot Tabelle erstellt.");
        } catch (e: any) {
          console.error("[Schema] Snapshot Tabelle Fehler:", e.message);
        }
      }

      if (!relations.includes("inference_rule")) {
        try {
          await this.db.run('{:create inference_rule {id: String => name: String, datalog: String, created_at: Int}}');
          console.error("[Schema] Inference Rule Tabelle erstellt.");
        } catch (e: any) {
          console.error("[Schema] Inference Rule Tabelle Fehler:", e.message);
        }
      } else {
        // Migration: Prüfe ob created_at existiert
        try {
          const cols = await this.db.run('::columns inference_rule');
          const hasCreatedAt = cols.rows.some((r: any) => r[0] === 'created_at');
          if (!hasCreatedAt) {
            console.error("[Schema] Migration: Füge created_at zu inference_rule hinzu...");
            await this.db.run(`
              ?[id, name, datalog, created_at] := *inference_rule{id, name, datalog}, created_at = 0
              :replace inference_rule {id: String => name: String, datalog: String, created_at: Int}
            `);
            console.error("[Schema] Migration: inference_rule erfolgreich aktualisiert.");
          }
        } catch (e: any) {
          console.error("[Schema] Inference Rule Migration Fehler:", e.message);
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
        console.error("[Schema] Trigger 'check_no_self_loops' erstellt.");
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
          console.error("[Schema] Trigger 'check_no_self_loops' erstellt (Fallback).");
        } catch (e2: any) {
          console.error("[Schema] Relationship Trigger Fehler:", e.message);
        }
      }
      */

      // Triggers disabled for now due to syntax issues with current CozoDB version
      /*
      try {
        // Dieser Trigger verhindert, dass eine Entität gleichzeitig als 'aktiv' und 'eingestellt' markiert wird
        // wenn diese Informationen explizit in den Metadaten stehen.
        await this.db.run(`
          ::set_triggers entity on put {
            ?[id] := _new{id, metadata}, 
            (get(metadata, 'status') == 'aktiv' || get(metadata, 'status') == 'active'), 
            (get(metadata, 'archived') == true || get(metadata, 'status') == 'eingestellt') 
            :assert empty
          }
        `);
        console.error("[Schema] Trigger 'check_metadata_conflict' erstellt.");
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
          console.error("[Schema] Trigger 'check_metadata_conflict' erstellt (Fallback).");
        } catch (e2: any) {
          console.error("[Schema] Entity Metadata Trigger Fehler:", e.message);
        }
      }
      */

      // User Profile Initialisierung
      await this.initUserProfile();

      console.error("CozoDB Schema Setup abgeschlossen.");
    } catch (error: any) {
      console.error("Unerwarteter Fehler beim Setup des Schemas:", error);
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
        topk: 100, // Erhöht für Graph-Walking
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
      console.error("Fehler in graph_walking:", error);
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
      const edgePart = r.relation_type === "expert_in" ? `Expertise für ${toName}` : `${r.relation_type} -> ${toName}`;
      return {
        ...r,
        is_inferred: true as const,
        from_name: fromMeta?.name,
        from_type: fromMeta?.type,
        to_name: toMeta?.name,
        to_type: toMeta?.type,
        uncertainty_hint: `Vermutlich ${fromName} (${edgePart}), da ${r.reason}`,
      };
    });
  }

  public async createEntity(args: { name: string, type: string, metadata?: any }) {
    try {
      if (!args.name || args.name.trim() === "") {
        return { error: "Name der Entität darf nicht leer sein" };
      }
      if (!args.type || args.type.trim() === "") {
        return { error: "Typ der Entität darf nicht leer sein" };
      }

      // Check for existing entity with same name (case-insensitive)
      const existingId = await this.findEntityIdByName(args.name);
      if (existingId) {
        return { id: existingId, name: args.name, type: args.type, status: "Entität existiert bereits (Name-Match)" };
      }

      // Konflikt-Erkennung (Application-Level Fallback für Triggers)
      if (args.metadata) {
        const status = args.metadata.status || "";
        const isArchived = args.metadata.archived === true;
        const isAktiv = status === "aktiv" || status === "active";
        const isEingestellt = status === "eingestellt" || isArchived;

        if (isAktiv && isEingestellt) {
          throw new Error(`Konflikt erkannt: Entität '${args.name}' kann nicht gleichzeitig 'aktiv' und 'eingestellt' sein.`);
        }
      }

      const id = uuidv4();
      return this.createEntityWithId(id, args.name, args.type, args.metadata);
    } catch (error: any) {
      console.error("Fehler in create_entity:", error);
      if (error.display) {
        console.error("CozoDB Fehler-Details:", error.display);
      }
      return { 
        error: "Interner Fehler beim Erstellen der Entität", 
        message: error.message || String(error),
        details: error.stack,
        cozo_display: error.display
      };
    }
  }

  private async createEntityWithId(id: string, name: string, type: string, metadata?: any) {
    const embedding = await this.embeddingService.embed(`${name} ${type}`);
    const name_embedding = await this.embeddingService.embed(name);
    console.error(`[Debug] Embeddings erstellt für ${name}.`);

    // Use direct vector binding for performance and to avoid long string issues
    const now = Date.now() * 1000;
    await this.db.run(`
      ?[id, created_at, name, type, embedding, name_embedding, metadata] <- [
        [$id, [${now}, true], $name, $type, $embedding, $name_embedding, $metadata]
      ] :insert entity {id, created_at => name, type, embedding, name_embedding, metadata}
    `, { id, name, type, embedding, name_embedding, metadata: metadata || {} });

    return { id, name, type, status: "Entität erstellt" };
  }

  private async initUserProfile() {
    try {
      const res = await this.db.run('?[id] := *entity{id, @ "NOW"}, id = $id', { id: USER_ENTITY_ID });
      if (res.rows.length === 0) {
        console.error("[User] Initialisiere globales Benutzerprofil...");
        await this.createEntityWithId(USER_ENTITY_ID, USER_ENTITY_NAME, USER_ENTITY_TYPE, { is_global_user: true });
        
        await this.addObservation({
          entity_id: USER_ENTITY_ID,
          text: "Dies ist das globale Benutzerprofil für Präferenzen und Arbeitsstile.",
          metadata: { kind: "system_init" }
        });
        console.error("[User] Globales Benutzerprofil erstellt.");
      }
    } catch (e: any) {
      console.error("[User] Fehler bei Initialisierung des Benutzerprofils:", e.message);
    }
  }

  public async updateEntity(args: { id: string, name?: string, type?: string, metadata?: any }) {
    try {
      const current = await this.db.run('?[name, type, metadata] := *entity{id: $id, name, type, metadata, @ "NOW"}', { id: args.id });
      if (current.rows.length === 0) return { error: "Entität nicht gefunden" };

      const name = args.name ?? current.rows[0][0];
      const type = args.type ?? current.rows[0][1];
      
      // Konflikt-Erkennung (Application-Level Fallback für Triggers)
      const mergedMetadata = { ...(current.rows[0][2] || {}), ...(args.metadata || {}) };
      const status = mergedMetadata.status || "";
      const isArchived = mergedMetadata.archived === true;
      const isAktiv = status === "aktiv" || status === "active";
      const isEingestellt = status === "eingestellt" || isArchived;

      if (isAktiv && isEingestellt) {
        throw new Error(`Konflikt erkannt: Entität '${name}' kann nicht gleichzeitig 'aktiv' und 'eingestellt' sein.`);
      }

      // Check if the new name already exists for a DIFFERENT entity
      if (args.name && args.name !== current.rows[0][0]) {
        const existingId = await this.findEntityIdByName(args.name);
        if (existingId && existingId !== args.id) {
          return { error: `Name '${args.name}' wird bereits von einer anderen Entität (${existingId}) verwendet.` };
        }
      }

      const embedding = await this.embeddingService.embed(`${name} ${type}`);
      const name_embedding = await this.embeddingService.embed(name);
      const now = Date.now() * 1000;
      
      // Nutze v0.7 :update und ++ für Metadaten-Merge (v1.7 Multi-Vector)
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

      return { status: "Entität aktualisiert", id: args.id };
    } catch (error: any) {
      console.error("Fehler in update_entity:", error);
      return {
        error: "Interner Fehler beim Aktualisieren der Entität",
        message: error.message || String(error),
        details: error.stack,
        cozo_display: error.display
      };
    }
  }

  public async addObservation(args: { entity_id?: string; entity_name?: string; entity_type?: string; text: string; metadata?: any; deduplicate?: boolean }) {
    try {
      if (!args.text || args.text.trim() === "") {
        return { error: "Beobachtungstext darf nicht leer sein" };
      }

      const deduplicate = args.deduplicate ?? true;

      let entityId: string;

      if (args.entity_id) {
        const entityRes = await this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: args.entity_id });
        if (entityRes.rows.length === 0) {
          return { error: `Entität mit ID '${args.entity_id}' nicht gefunden` };
        }
        entityId = args.entity_id;
      } else {
        const entityName = (args.entity_name ?? "").trim();
        if (!entityName) return { error: "Für Ingest muss zwingend 'entity_id' oder 'entity_name' angegeben werden, um die Daten zuzuordnen." };
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
              suggestion: 'Exakt gleiche Beobachtung existiert bereits.',
              text: existingText
            };
          }

          // 2. Near-duplicate check via LSH (v0.7)
          // Hinweis: bind_distance wird bei LSH nicht unterstützt, stattdessen wird k: 1 genutzt
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
              similarity: 0.9, // Schätzwert, da LSH nur Treffer innerhalb der Threshold liefert
              suggestion: 'Sehr ähnliche Beobachtung gefunden (LSH Match).',
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

      // Optional: Automatische Inferenz nach neuer Beobachtung (im Hintergrund)
      const suggestionsRaw = await this.inferenceEngine.inferRelations(entityId);
      const suggestions = await this.formatInferredRelationsForContext(suggestionsRaw);

      return { 
        id, 
        entity_id: entityId, 
        status: "Beobachtung gespeichert", 
        inferred_suggestions: suggestions 
      };
    } catch (error: any) {
      return { error: error.message || "Unbekannter Fehler" };
    }
  }

  public async createRelation(args: { from_id: string, to_id: string, relation_type: string, strength?: number, metadata?: any }) {
    if (args.from_id === args.to_id) {
      return { error: "Selbst-Referenzen in Beziehungen sind nicht erlaubt" };
    }

    // Prüfe ob beide Entities existieren
    const [fromEntity, toEntity] = await Promise.all([
      this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: args.from_id }),
      this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: args.to_id })
    ]);

    if (fromEntity.rows.length === 0) {
      return { error: `Quell-Entität mit ID '${args.from_id}' nicht gefunden` };
    }
    if (toEntity.rows.length === 0) {
      return { error: `Ziel-Entität mit ID '${args.to_id}' nicht gefunden` };
    }

    const now = Date.now() * 1000;
    await this.db.run(`?[from_id, to_id, relation_type, created_at, strength, metadata] <- [[$from_id, $to_id, $relation_type, [${now}, true], $strength, $metadata]] :insert relationship {from_id, to_id, relation_type, created_at => strength, metadata}`, {
      from_id: args.from_id,
      to_id: args.to_id,
      relation_type: args.relation_type,
      strength: args.strength ?? 1.0,
      metadata: args.metadata || {}
    });

    return { status: "Beziehung erstellt" };
  }

  public async exploreGraph(args: { start_entity: string; end_entity?: string; max_hops?: number; relation_types?: string[] }) {
    await this.initPromise;

    // Prüfe ob Start-Entität existiert
    const startRes = await this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: args.start_entity });
    if (startRes.rows.length === 0) {
      throw new Error(`Start-Entität mit ID '${args.start_entity}' nicht gefunden`);
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
   * Trackt die zeitliche Veränderung von Beziehungen einer Entität (Time-Travel Analysis).
   * Liefert eine Liste von Events (ASSERTED/RETRACTED) über die Zeit.
   * Optionale Filter für Ziel-Entität und Zeitbereich.
   */
  public async getRelationEvolution(args: { 
    from_id: string; 
    to_id?: string;
    since?: number; // Unix-Timestamp in ms
    until?: number; // Unix-Timestamp in ms
  }) {
    await this.initPromise;

    const fromId = args.from_id;
    const toId = args.to_id;
    const since = args.since ? args.since * 1000 : undefined; // Cozo nutzt Mikrosekunden
    const until = args.until ? args.until * 1000 : undefined;

    // 1. Abfrage aller historischen Zustände für diese Beziehung(en)
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

    // 2. Namen der beteiligten Entitäten auflösen
    const uniqueIds = new Set<string>();
    uniqueIds.add(fromId);
    (res.rows || []).forEach((r: any) => uniqueIds.add(String(r[1])));

    const nameRes = await this.db.run(`
      ids[id] <- $ids
      ?[id, name] := ids[id], *entity{id, name, @ "NOW"}
    `, { ids: Array.from(uniqueIds).map(id => [id]) });

    const nameById = new Map<string, string>();
    (nameRes.rows || []).forEach((r: any) => nameById.set(String(r[0]), String(r[1])));

    // 3. Events verarbeiten und filtern
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

    // Zeitbereichs-Filter anwenden
    if (since !== undefined) {
      events = events.filter((e: any) => e.timestamp >= since);
    }
    if (until !== undefined) {
      events = events.filter((e: any) => e.timestamp <= until);
    }

    // Sortierung nach Zeit (aufsteigend)
    events.sort((a: any, b: any) => a.timestamp - b.timestamp);

    // 4. Diff-Zusammenfassung erstellen
    const diff = {
      added: [] as any[],
      removed: [] as any[],
      modified: [] as any[]
    };

    // Einfache Logik: Wir schauen uns die Events im gewählten Zeitraum an
    // Für eine echte "Diff" Analyse zwischen zwei Zeitpunkten müsste man den Zustand @ start und @ end vergleichen.
    // Hier liefern wir erst einmal die Änderungen im Zeitraum.
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
      // Wähle Top 5 Entitäten mit den meisten Beobachtungen
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
        results.push({ entity_id: entity.id, status: "skipped", reason: "Zu wenige Beobachtungen für Reflexion" });
        continue;
      }

      const observations = obsRes.rows.map((r: any) => `- [${new Date(Number(r[1]) / 1000).toISOString()}] ${r[0]}`);

      const systemPrompt = `Du bist ein analytisches Gedächtnismodul. Analysiere die folgenden Beobachtungen zu einer Entität. 
Suche nach Widersprüchen, zeitlichen Entwicklungen, Verhaltensmustern oder tieferen Einsichten. 
Formuliere eine prägnante Reflexion (max. 3-4 Sätze), die dem Nutzer hilft, den aktuellen Stand oder die Evolution zu verstehen.
Falls es widersprüchliche Aussagen gibt, benenne diese explizit.
Falls keine besonderen Muster erkennbar sind, antworte mit "Keine neuen Erkenntnisse".`;

      const userPrompt = `Entität: ${entity.name} (${entity.type})\n\nBeobachtungen:\n${observations.join("\n")}`;

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

      if (reflectionText && reflectionText !== "Keine neuen Erkenntnisse" && !reflectionText.includes("Keine neuen Erkenntnisse")) {
        await this.addObservation({
          entity_id: entity.id,
          text: `Reflexive Einsicht: ${reflectionText}`,
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
      "(?i).*(\\baktiv\\b|\\bläuft\\b|\\bongoing\\b|\\bactive\\b|\\brunning\\b|in\\s+betrieb|wird\\s+fortgesetzt|weiter\\s+geführt|nicht\\s+eingestellt).*";
    const inactiveRe =
      "(?i).*(eingestellt|abgebrochen|gestoppt|stillgelegt|geschlossen|shutdown|deprecated|archiviert|archived|beendet|aufgegeben).*";

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

      // Ein Konflikt liegt nur vor, wenn beide Informationen aus dem gleichen Zeitraum (Jahr) stammen.
      // Unterschiedliche Jahre deuten auf eine Statusänderung hin (z.B. 2024 eingestellt, 2025 wieder aktiv).
      // Das entspricht dem Vorschlag für temporale Konsistenz.
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
          summary: `Konflikt: Es gibt widersprüchliche Infos zum Status von ${meta.name} im gleichen Zeitraum (${years}).`,
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
        return { error: "Regelname darf nicht leer sein" };
      }
      if (!args.datalog || args.datalog.trim() === "") {
        return { error: "Datalog darf nicht leer sein" };
      }

      // Prüfe, ob bereits eine Regel mit diesem Namen existiert
      const existingRule = await this.db.run('?[id] := *inference_rule{name: $name, id}', { name: args.name });
      if (existingRule.rows.length > 0) {
        return { error: `Eine Inferenzregel mit dem Namen '${args.name}' existiert bereits.` };
      }

      // Validierung des Datalog-Codes
      try {
        const validationRes = await this.db.run(args.datalog, { id: "validation-test" });
        const expectedHeaders = ["from_id", "to_id", "relation_type", "confidence", "reason"];
        const actualHeaders = validationRes.headers;
        
        const missingHeaders = expectedHeaders.filter(h => !actualHeaders.includes(h));
        if (missingHeaders.length > 0) {
          return { error: `Ungültiges Datalog-Resultset. Fehlende Spalten: ${missingHeaders.join(", ")}. Erwartet werden: ${expectedHeaders.join(", ")}` };
        }
      } catch (validationError: any) {
        return { error: `Datalog-Syntaxfehler: ${validationError.message}` };
      }

      const id = uuidv4();
      const now = Date.now();
      await this.db.run(
        "?[id, name, datalog, created_at] <- [[$id, $name, $datalog, $now]] :put inference_rule {id => name, datalog, created_at}",
        { id, name: args.name, datalog: args.datalog, now },
      );
      return { id, name: args.name, status: "Regel gespeichert" };
    } catch (error: any) {
      return { error: error.message || "Fehler beim Speichern der Regel" };
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
      if (!content) return { error: "content darf nicht leer sein" };

      let entityId: string | undefined = undefined;
      let createdEntity = false;

      if (args.entity_id) {
        const entityRes = await this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: args.entity_id });
        if (entityRes.rows.length === 0) return { error: `Entität mit ID '${args.entity_id}' nicht gefunden` };
        entityId = args.entity_id;
      } else {
        const entityName = (args.entity_name ?? "").trim();
        if (!entityName) return { error: "Für Ingest muss zwingend 'entity_id' oder 'entity_name' angegeben werden, um die Daten zuzuordnen." };
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

      if (!entityId) return { error: "Entität konnte nicht bestimmt werden" };

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
          return { error: "JSON konnte nicht geparst werden" };
        }

        const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.observations) ? parsed.observations : null;
        if (!items) return { error: "JSON erwartet Array oder { observations: [...] }" };

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

      if (observations.length === 0) return { error: "Keine Observations extrahiert" };

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
      return { error: error.message || "Fehler beim Ingest" };
    }
  }

  public async deleteEntity(args: { entity_id: string }) {
    try {
      // 1. Prüfe ob Entity existiert
      const entityRes = await this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: args.entity_id });
      if (entityRes.rows.length === 0) {
        return { error: `Entität mit ID '${args.entity_id}' nicht gefunden` };
      }

      // 2. Lösche alle zugehörigen Daten in einer Transaktion (Block)
      await this.db.run(`
        { ?[id, created_at] := *observation{id, entity_id, created_at}, entity_id = $target_id :rm observation {id, created_at} }
        { ?[from_id, to_id, relation_type, created_at] := *relationship{from_id, to_id, relation_type, created_at}, from_id = $target_id :rm relationship {from_id, to_id, relation_type, created_at} }
        { ?[from_id, to_id, relation_type, created_at] := *relationship{from_id, to_id, relation_type, created_at}, to_id = $target_id :rm relationship {from_id, to_id, relation_type, created_at} }
        { ?[id, created_at] := *entity{id, created_at}, id = $target_id :rm entity {id, created_at} }
      `, { target_id: args.entity_id });

      return { status: "Entität und alle zugehörigen Daten gelöscht" };
    } catch (error: any) {
      console.error("Fehler beim Löschen:", error);
      return { error: "Löschen fehlgeschlagen", message: error.message };
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
                return { error: `Ungültige JSON-Parameter (Parse Error) in Operation ${i}` };
            }
        }

        if (!params || typeof params !== 'object') {
            return { error: `Ungültige Parameterstruktur (kein Objekt) in Operation ${i}` };
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
                  return { error: `entity_id oder entity_name wird für add_observation benötigt in Operation ${i}` };
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
               return { error: `Fehlende entity_id für delete_entity in Operation ${i}` };
            }

            allParams[`target_id${suffix}`] = entity_id;

            // Lösche Observations
            statements.push(`
              { ?[id, created_at] := *observation{id, entity_id, created_at}, entity_id = $target_id${suffix} :rm observation {id, created_at} }
            `);
            // Lösche ausgehende Beziehungen
            statements.push(`
              { ?[from_id, to_id, relation_type, created_at] := *relationship{from_id, to_id, relation_type, created_at}, from_id = $target_id${suffix} :rm relationship {from_id, to_id, relation_type, created_at} }
            `);
            // Lösche eingehende Beziehungen
            statements.push(`
              { ?[from_id, to_id, relation_type, created_at] := *relationship{from_id, to_id, relation_type, created_at}, to_id = $target_id${suffix} :rm relationship {from_id, to_id, relation_type, created_at} }
            `);
            // Lösche Entity selbst
            statements.push(`
              { ?[id, created_at] := *entity{id, created_at}, id = $target_id${suffix} :rm entity {id, created_at} }
            `);
            
            results.push({ action: "delete_entity", id: entity_id });
            break;
          }
          
          default:
            return { error: `Unbekannte Operation: ${(op as any).action}` };
        }
      }

      const transactionQuery = statements.join("\n");
      console.error(`[Transaction] Führe ${statements.length} Operationen atomar aus...`);
      
      await this.db.run(transactionQuery, allParams);
      
      return { 
        status: "success", 
        message: `${statements.length} Operationen atomar ausgeführt`,
        results 
      };
    } catch (error: any) {
      console.error("Fehler in runTransaction:", error);
      return { 
        error: "Transaktion fehlgeschlagen", 
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
        name: z.string().describe("Name der Entität"),
        type: z.string().describe("Typ der Entität"),
        metadata: MetadataSchema.optional().describe("Zusätzliche Metadaten"),
      }),
      z.object({
        action: z.literal("update_entity"),
        id: z.string().describe("ID der zu aktualisierenden Entität"),
        name: z.string().min(1).optional().describe("Neuer Name"),
        type: z.string().min(1).optional().describe("Neuer Typ"),
        metadata: MetadataSchema.optional().describe("Neue Metadaten"),
      }),
      z.object({
        action: z.literal("delete_entity"),
        entity_id: z.string().describe("ID der zu löschenden Entität"),
      }),
      z.object({
        action: z.literal("add_observation"),
        entity_id: z.string().optional().describe("ID der Entität"),
        entity_name: z.string().optional().describe("Name der Entität (wird erstellt, falls nicht vorhanden)"),
        entity_type: z.string().optional().default("Unknown").describe("Typ der Entität (nur beim Erstellen)"),
        text: z.string().describe("Der Fakt oder die Beobachtung"),
        metadata: MetadataSchema.optional().describe("Zusätzliche Metadaten"),
        deduplicate: z.boolean().optional().default(true).describe("Exakte Duplikate überspringen"),
      }).refine((v) => Boolean((v as any).entity_id) || Boolean((v as any).entity_name), {
        message: "entity_id oder entity_name wird benötigt",
        path: ["entity_id"],
      }),
      z.object({
        action: z.literal("create_relation"),
        from_id: z.string().describe("Quell-Entität ID"),
        to_id: z.string().describe("Ziel-Entität ID"),
        relation_type: z.string().nonempty().describe("Art der Beziehung"),
        strength: z.number().min(0).max(1).optional().default(1.0).describe("Stärke der Beziehung"),
        metadata: MetadataSchema.optional().describe("Zusätzliche Metadaten"),
      }),
      z.object({
        action: z.literal("run_transaction"),
        operations: z.array(z.discriminatedUnion("action", [
          z.object({
            action: z.literal("create_entity"),
            params: z.union([
              z.object({
                name: z.string().describe("Name der Entität"),
                type: z.string().describe("Typ der Entität"),
                metadata: MetadataSchema.optional().describe("Zusätzliche Metadaten"),
              }),
              z.string().describe("JSON-String der Parameter")
            ])
          }),
          z.object({
            action: z.literal("delete_entity"),
            params: z.union([
              z.object({
                entity_id: z.string().describe("ID der zu löschenden Entität"),
              }),
              z.string().describe("JSON-String der Parameter")
            ])
          }),
          z.object({
            action: z.literal("add_observation"),
            params: z.union([
              z.object({
                entity_id: z.string().optional().describe("ID der Entität"),
                entity_name: z.string().optional().describe("Name der Entität (wird erstellt, falls nicht vorhanden)"),
                entity_type: z.string().optional().default("Unknown").describe("Typ der Entität (nur beim Erstellen)"),
                text: z.string().describe("Der Fakt oder die Beobachtung"),
                metadata: MetadataSchema.optional().describe("Zusätzliche Metadaten"),
              }).refine((v) => Boolean((v as any).entity_id) || Boolean((v as any).entity_name), {
                message: "entity_id oder entity_name wird benötigt",
                path: ["entity_id"],
              }),
              z.string().describe("JSON-String der Parameter")
            ])
          }),
          z.object({
            action: z.literal("create_relation"),
            params: z.union([
              z.object({
                from_id: z.string().describe("Quell-Entität ID"),
                to_id: z.string().describe("Ziel-Entität ID"),
                relation_type: z.string().nonempty().describe("Art der Beziehung"),
                strength: z.number().min(0).max(1).optional().default(1.0).describe("Stärke der Beziehung"),
                metadata: MetadataSchema.optional().describe("Zusätzliche Metadaten"),
              }),
              z.string().describe("JSON-String der Parameter")
            ])
          }),
        ])).describe("Liste der atomar auszuführenden Operationen")
      }),
      z.object({
        action: z.literal("add_inference_rule"),
        name: z.string().describe("Name der Regel"),
        datalog: z.string().describe("CozoDB Datalog Query"),
      }),
      z.object({
        action: z.literal("ingest_file"),
        entity_id: z.string().optional().describe("ID der Ziel-Entität"),
        entity_name: z.string().optional().describe("Name der Ziel-Entität (wird erstellt, falls nicht vorhanden)"),
        entity_type: z.string().optional().default("Document").describe("Typ der Ziel-Entität (nur beim Erstellen)"),
        format: z.enum(["markdown", "json"]).describe("Eingabeformat"),
        chunking: z.enum(["none", "paragraphs"]).optional().default("none").describe("Chunking für Markdown"),
        content: z.string().describe("Dateiinhalt (oder LLM-Zusammenfassung)"),
        metadata: MetadataSchema.optional().describe("Metadaten für Entity-Erstellung"),
        observation_metadata: MetadataSchema.optional().describe("Metadaten, die auf alle Observations angewendet werden"),
        deduplicate: z.boolean().optional().default(true).describe("Exakte Duplikate überspringen"),
        max_observations: z.number().min(1).max(200).optional().default(50).describe("Maximale Anzahl Observations"),
      }).refine((v) => Boolean((v as any).entity_id) || Boolean((v as any).entity_name), {
        message: "entity_id oder entity_name wird für ingest_file benötigt",
        path: ["entity_id"],
      }),
    ]);

    const MutateMemoryParameters = z.object({
      action: z
        .enum(["create_entity", "update_entity", "delete_entity", "add_observation", "create_relation", "run_transaction", "add_inference_rule", "ingest_file"])
        .describe("Aktion (bestimmt welche Felder erforderlich sind)"),
      name: z.string().optional().describe("Für create_entity (erforderlich) oder add_inference_rule (erforderlich)"),
      type: z.string().optional().describe("Für create_entity erforderlich"),
      id: z.string().optional().describe("Für update_entity erforderlich"),
      entity_id: z.string().optional().describe("Für delete_entity erforderlich; alternativ zu entity_name bei add_observation/ingest_file"),
      entity_name: z.string().optional().describe("Für add_observation/ingest_file als Alternative zu entity_id"),
      entity_type: z.string().optional().describe("Nur wenn entity_name verwendet wird und Entity neu erstellt wird"),
      text: z.string().optional().describe("Für add_observation erforderlich"),
      datalog: z.string().optional().describe("Für add_inference_rule erforderlich"),
      format: z.enum(["markdown", "json"]).optional().describe("Für ingest_file erforderlich"),
      chunking: z.enum(["none", "paragraphs"]).optional().describe("Optional für ingest_file (bei markdown)"),
      content: z.string().optional().describe("Für ingest_file erforderlich"),
      observation_metadata: MetadataSchema.optional().describe("Optional für ingest_file"),
      deduplicate: z.boolean().optional().describe("Optional für ingest_file und add_observation"),
      max_observations: z.number().optional().describe("Optional für ingest_file"),
      from_id: z.string().optional().describe("Für create_relation erforderlich"),
      to_id: z.string().optional().describe("Für create_relation erforderlich"),
      relation_type: z.string().optional().describe("Für create_relation erforderlich"),
      strength: z.number().min(0).max(1).optional().describe("Optional für create_relation"),
      metadata: MetadataSchema.optional().describe("Optional für create_entity/update_entity/add_observation/create_relation/ingest_file"),
      operations: z.array(z.any()).optional().describe("Für run_transaction erforderlich: Liste der atomar auszuführenden Operationen"),
    });

    this.mcp.addTool({
      name: "mutate_memory",
      description: `Schreibzugriff auf das Gedächtnis. Wähle die Operation über 'action'.
Unterstützte Aktionen:
- 'create_entity': Erstellt eine neue Entität. Params: { name: string, type: string, metadata?: object }
- 'update_entity': Aktualisiert eine bestehende Entität. Params: { id: string, name?: string, type?: string, metadata?: object }
- 'delete_entity': Löscht eine Entität und ihre Beobachtungen. Params: { entity_id: string }
- 'add_observation': Speichert einen Fakt. Params: { entity_id?: string, entity_name?: string, entity_type?: string, text: string, metadata?: object, deduplicate?: boolean }. Automatische Deduplizierung aktiv (deaktivierbar).
  HINWEIS: Nutze die spezielle 'entity_id': 'global_user_profile', um persistente Benutzerpräferenzen (Vorlieben, Arbeitsstil, Abneigungen) zu speichern. Diese werden bei Suchen bevorzugt.
- 'create_relation': Erstellt eine Verbindung zwischen Entitäten. Params: { from_id: string, to_id: string, relation_type: string, strength?: number (0-1), metadata?: object }. Keine Selbst-Referenzen erlaubt.
- 'run_transaction': Führt mehrere Operationen atomar in einer Transaktion aus. Params: { operations: Array<{ action: "create_entity"|"add_observation"|"create_relation", params: object }> }. Ideal für komplexe, zusammenhängende Änderungen.
- 'add_inference_rule': Fügt eine benutzerdefinierte Datalog-Inferenzregel hinzu. Params: { name: string, datalog: string }.
  WICHTIG: Das Datalog-Resultset MUSS genau 5 Spalten liefern: [from_id, to_id, relation_type, confidence, reason].
  Verwende '$id' als Platzhalter für die Start-Entität.
  Verfügbare Tabellen:
  - *entity{id, name, type, metadata, @ "NOW"}
  - *relationship{from_id, to_id, relation_type, strength, metadata, @ "NOW"}
  - *observation{id, entity_id, text, metadata, @ "NOW"}
  Beispiel (Manager-Transitivität):
  '?[from_id, to_id, relation_type, confidence, reason] := *relationship{from_id: $id, to_id: mid, relation_type: "manager_of", @ "NOW"}, *relationship{from_id: mid, to_id: target, relation_type: "manager_of", @ "NOW"}, from_id = $id, to_id = target, relation_type = "ober_manager_von", confidence = 0.6, reason = "Transitiver Manager-Pfad"'
- 'ingest_file': Bulk-Import von Dokumenten (Markdown/JSON). Unterstützt Chunking (Absätze) und automatische Entitätserstellung. Params: { entity_id | entity_name (erforderlich), format, content, ... }. Ideal zum schnellen Befüllen des Speichers aus vorhandenen Notizen.

Validierung: Ungültige Syntax oder fehlende Spalten bei Inferenzregeln führen zu Fehlern.`,
      parameters: MutateMemoryParameters,
      execute: async (args: any) => {
        await this.initPromise;
        console.error(`[mutate_memory] Aufruf mit:`, JSON.stringify(args, null, 2));
        
        // Zod discriminatedUnion ist streng. Wir versuchen es flexibler zu parsen.
        const parsed = MutateMemorySchema.safeParse(args);
        if (!parsed.success) {
          console.error(`[mutate_memory] Validierungsfehler:`, JSON.stringify(parsed.error.issues, null, 2));
          

          
          return JSON.stringify({ 
            error: "Ungültige Eingabe für action: " + args.action, 
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
        return JSON.stringify({ error: "Unbekannte action" });
      },
    });

    const QueryMemorySchema = z.discriminatedUnion("action", [
      z.object({
        action: z.literal("search"),
        query: z.string().describe("Suchanfrage"),
        limit: z.number().optional().default(10).describe("Maximale Anzahl der Ergebnisse"),
        entity_types: z.array(z.string()).optional().describe("Filter nach Entity-Typen"),
        include_entities: z.boolean().optional().default(true).describe("Entities in Suche einbeziehen"),
        include_observations: z.boolean().optional().default(true).describe("Observations in Suche einbeziehen"),
      }),
      z.object({
        action: z.literal("advancedSearch"),
        query: z.string().describe("Suchanfrage"),
        limit: z.number().optional().default(10).describe("Maximale Anzahl der Ergebnisse"),
        filters: z.object({
          entityTypes: z.array(z.string()).optional().describe("Filter nach Entity-Typen"),
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
          ]).optional().describe("Filter nach Metadaten (exakte Übereinstimmung)"),
        }).optional().describe("Filter für die Suche"),
        graphConstraints: z.object({
          requiredRelations: z.array(z.string()).optional().describe("Nur Entitäten mit diesen Beziehungstypen"),
          targetEntityIds: z.array(z.string()).optional().describe("Nur Entitäten, die mit diesen Ziel-IDs verbunden sind"),
        }).optional().describe("Graph-Einschränkungen"),
        vectorParams: z.object({
          efSearch: z.number().optional().describe("HNSW Suchgenauigkeit"),
        }).optional().describe("Vektor-Parameter"),
      }),
      z.object({
        action: z.literal("context"),
        query: z.string().describe("Kontext-Anfrage"),
        context_window: z.number().min(1).max(50).optional().default(20).describe("Anzahl der Kontext-Elemente"),
        time_range_hours: z.number().optional().describe("Zeitfenster in Stunden"),
      }),
      z.object({
        action: z.literal("entity_details"),
        entity_id: z.string().describe("ID der Entität"),
        as_of: z.string().optional().describe("Zeitpunkt für historische Abfrage (ISO-String oder 'NOW')"),
      }),
      z.object({
        action: z.literal("history"),
        entity_id: z.string().describe("ID der Entität"),
      }),
      z.object({
        action: z.literal("graph_rag"),
        query: z.string().describe("Suchanfrage für die initialen Vektor-Seeds"),
        max_depth: z.number().min(1).max(3).optional().default(2).describe("Maximale Tiefe der Graph-Expansion (Standard: 2)"),
        limit: z.number().optional().default(10).describe("Anzahl der initialen Vektor-Seeds"),
      }),
      z.object({
        action: z.literal("graph_walking"),
        query: z.string().describe("Suchanfrage für die Relevanz-Prüfung"),
        start_entity_id: z.string().optional().describe("Optionale Start-Entität (sonst wird via Vektor gesucht)"),
        max_depth: z.number().min(1).max(5).optional().default(3).describe("Maximale Tiefe des Walking"),
        limit: z.number().optional().default(5).describe("Anzahl der Ergebnisse"),
      }),
    ]);

    const QueryMemoryParameters = z.object({
      action: z
        .enum(["search", "advancedSearch", "context", "entity_details", "history", "graph_rag", "graph_walking"])
        .describe("Aktion (bestimmt welche Felder erforderlich sind)"),
      query: z.string().optional().describe("Für search/advancedSearch/context/graph_rag/graph_walking erforderlich"),
      limit: z.number().optional().describe("Nur für search/advancedSearch/graph_rag/graph_walking"),
      filters: z.any().optional().describe("Nur für advancedSearch"),
      graphConstraints: z.any().optional().describe("Nur für advancedSearch"),
      vectorOptions: z.any().optional().describe("Nur für advancedSearch"),
      entity_types: z.array(z.string()).optional().describe("Nur für search"),
      include_entities: z.boolean().optional().describe("Nur für search"),
      include_observations: z.boolean().optional().describe("Nur für search"),
      context_window: z.number().optional().describe("Nur für context"),
      time_range_hours: z.number().optional().describe("Nur für context"),
      entity_id: z.string().optional().describe("Für entity_details/history erforderlich"),
      as_of: z.string().optional().describe("Nur für entity_details: ISO-String oder 'NOW'"),
      max_depth: z.number().optional().describe("Nur für graph_rag/graph_walking: Maximale Expansionstiefe"),
      start_entity_id: z.string().optional().describe("Nur für graph_walking: Start-Entität"),
    });

    this.mcp.addTool({
      name: "query_memory",
      description: `Lesezugriff auf das Gedächtnis. Wähle die Operation über 'action'.
Unterstützte Aktionen:
- 'search': Hybride Suche (Vektor + Keyword + Graph). Params: { query: string, limit?: number, entity_types?: string[], include_entities?: boolean, include_observations?: boolean }.
  HINWEIS: Ergebnisse aus dem Benutzerprofil ('global_user_profile') erhalten automatisch einen Boost und werden bevorzugt angezeigt.
- 'advancedSearch': Erweiterte Suche mit Metadaten-Filtern und Graph-Einschränkungen. Params: { query: string, limit?: number, filters?: { entityTypes?: string[], metadata?: object }, graphConstraints?: { requiredRelations?: string[], targetEntityIds?: string[] }, vectorOptions?: { topk?: number, efSearch?: number } }.
- 'context': Ruft umfassenden Kontext ab. Params: { query: string, context_window?: number, time_range_hours?: number }. Liefert Entitäten, Beobachtungen, Graphen-Beziehungen und implizite Inferenz-Vorschläge.
  HINWEIS: Das Benutzerprofil wird bei Relevanz automatisch in den Kontext einbezogen, um Personalisierung zu ermöglichen.
- 'entity_details': Detailansicht einer Entität. Params: { entity_id: string, as_of?: string ('ISO-String' oder 'NOW') }.
- 'history': Historische Entwicklung einer Entität abrufen. Params: { entity_id: string }.
- 'graph_rag': Graph-basiertes Reasoning (Hybrid RAG). Findet erst semantische Vektor-Seeds und expandiert diese dann über Graph-Traversals. Ideal für Fragen, die Wissen über mehrere Ecken verknüpfen müssen. Params: { query: string, max_depth?: number, limit?: number }.
- 'graph_walking': Rekursive semantische Graph-Suche. Startet bei Vektor-Seeds oder einer Entität und folgt Beziehungen zu anderen semantisch relevanten Entitäten. Params: { query: string, start_entity_id?: string, max_depth?: number, limit?: number }.

Hinweise: 'context' ist ideal für explorative Fragen. 'search' und 'advancedSearch' eignen sich besser für gezielte Faktensuche.`,
      parameters: QueryMemoryParameters,
      execute: async (args: any) => {
        await this.initPromise;
        const parsed = QueryMemorySchema.safeParse(args);
        if (!parsed.success) return JSON.stringify({ error: "Ungültige Eingabe", issues: parsed.error.issues });
        const input = parsed.data as any;

        if (input.action === "search") {
          if (!input.query || input.query.trim().length === 0) {
            return JSON.stringify({ error: "Suchanfrage darf nicht leer sein." });
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
            return JSON.stringify({ error: "Suchanfrage darf nicht leer sein." });
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
            return JSON.stringify({ error: "Suchanfrage darf nicht leer sein." });
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
              console.error(`Fehler bei Graph-Expansion für ${entity.name}:`, e);
            }
          }

          const inferred_relations = [];
          for (const entity of entities) {
            try {
              const inferred = await this.inferenceEngine.inferImplicitRelations(entity.id);
              if (Array.isArray(inferred) && inferred.length > 0) inferred_relations.push(...inferred);
            } catch (e) {
              console.error(`Fehler bei impliziter Inferenz für ${entity.name}:`, e);
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
            return JSON.stringify({ error: "Suchanfrage darf nicht leer sein." });
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
            return JSON.stringify({ error: "Suchanfrage darf nicht leer sein." });
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
          if (!validitySpec) return JSON.stringify({ error: "Ungültiges as_of-Format" });

          let entityRes, obsRes, relOutRes;

          if (validitySpec === '"NOW"') {
            entityRes = await this.db.run(
              `?[name, type, metadata] := *entity {id: $id, name, type, metadata, @ "NOW"}`,
              { id: input.entity_id },
            );
            if (entityRes.rows.length === 0) return JSON.stringify({ error: "Entität nicht gefunden" });

            obsRes = await this.db.run(
              `?[text, metadata] := *observation {entity_id: $id, text, metadata, @ "NOW"}`,
              { id: input.entity_id },
            );
            relOutRes = await this.db.run(
              `?[target_id, type, target_name] := *relationship {from_id: $id, to_id: target_id, relation_type: type, @ "NOW"}, *entity {id: target_id, name: target_name, @ "NOW"}`,
              { id: input.entity_id },
            );
          } else {
            // Standard CozoDB @ Operator verwenden
            entityRes = await this.db.run(
              `?[name, type, metadata] := *entity {id: $id, name, type, metadata, @ ${validitySpec}}`,
              { id: input.entity_id },
            );
            if (entityRes.rows.length === 0) return JSON.stringify({ error: "Entität nicht gefunden" });

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
          if (entityRes.rows.length === 0) return JSON.stringify({ error: "Entität nicht gefunden" });

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

        return JSON.stringify({ error: "Unbekannte action" });
      },
    });

    const AnalyzeGraphSchema = z.discriminatedUnion("action", [
      z.object({
        action: z.literal("explore"),
        start_entity: z.string().describe("Start-Entität ID"),
        end_entity: z.string().optional().describe("Ziel-Entität ID"),
        max_hops: z.number().min(1).max(5).optional().default(3).describe("Maximale Anzahl der Hops"),
        relation_types: z.array(z.string()).optional().describe("Filter nach Beziehungstypen"),
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
        start_entity: z.string().describe("Start-Entität ID"),
        end_entity: z.string().describe("Ziel-Entität ID"),
      }),
      z.object({
        action: z.literal("bridge_discovery"),
      }),
      z.object({
        action: z.literal("infer_relations"),
        entity_id: z.string().describe("ID der Entität"),
      }),
      z.object({
        action: z.literal("get_relation_evolution"),
        from_id: z.string().describe("ID der Quell-Entität"),
        to_id: z.string().optional().describe("Optionale ID der Ziel-Entität (falls weggelassen, wird die Evolution aller ausgehenden Beziehungen der Quell-Entität gezeigt)"),
      }),
      z.object({
        action: z.literal("semantic_walk"),
        start_entity: z.string().describe("Start-Entität ID"),
        max_depth: z.number().optional().default(3).describe("Maximale Tiefe (Default: 3)"),
        min_similarity: z.number().optional().default(0.7).describe("Minimale Ähnlichkeit (0.0-1.0, Default: 0.7)"),
      }),
      z.object({
        action: z.literal("hnsw_clusters"),
      }),
    ]);

    const AnalyzeGraphParameters = z.object({
      action: z
        .enum(["explore", "communities", "pagerank", "betweenness", "hits", "connected_components", "shortest_path", "bridge_discovery", "infer_relations", "get_relation_evolution", "semantic_walk", "hnsw_clusters"])
        .describe("Aktion (bestimmt welche Felder erforderlich sind)"),
      start_entity: z.string().optional().describe("Für explore/shortest_path/semantic_walk erforderlich (Start-Entität ID)"),
      end_entity: z.string().optional().describe("Für explore (optional) / shortest_path (erforderlich)"),
      max_hops: z.number().optional().describe("Optional für explore"),
      relation_types: z.array(z.string()).optional().describe("Optional für explore"),
      entity_id: z.string().optional().describe("Für infer_relations erforderlich"),
      from_id: z.string().optional().describe("Für get_relation_evolution erforderlich"),
      to_id: z.string().optional().describe("Optional für get_relation_evolution"),
      max_depth: z.number().optional().describe("Optional für semantic_walk"),
      min_similarity: z.number().optional().describe("Optional für semantic_walk"),
    });

    this.mcp.addTool({
      name: "analyze_graph",
      description: `Graphen-Analyse und fortgeschrittene Retrieval-Strategien. Wähle die Operation über 'action'.
Unterstützte Aktionen:
- 'explore': Navigiert durch den Graphen. Params: { start_entity: string, end_entity?: string, max_hops?: number, relation_types?: string[] }.
  * Ohne end_entity: Liefert die Nachbarschaft (bis 5 Hops).
  * Mit end_entity: Findet den kürzesten Pfad (BFS).
- 'communities': Berechnet Entitäts-Gruppen (Communities) neu mittels Label Propagation.
- 'pagerank': Berechnet die Wichtigkeit von Entitäten (Top 10).
- 'betweenness': Findet zentrale Brücken-Entitäten (Betweenness Centrality).
- 'hits': Identifiziert Hubs und Authorities.
- 'connected_components': Identifiziert isolierte Teilgraphen.
- 'shortest_path': Berechnet den kürzesten Pfad zwischen zwei Entitäten (Dijkstra). Params: { start_entity: string, end_entity: string }.
- 'bridge_discovery': Identifiziert Brücken-Entitäten zwischen Communities.
- 'infer_relations': Startet die Inferenz-Engine für eine Entität. Params: { entity_id: string }.
- 'get_relation_evolution': Trackt die zeitliche Veränderung von Beziehungen. Params: { from_id: string, to_id?: string }.
- 'semantic_walk': Führt einen rekursiven "Graph Walk" durch, der sowohl expliziten Beziehungen als auch semantischer Ähnlichkeit folgt. Params: { start_entity: string, max_depth?: number, min_similarity?: number }.
- 'hnsw_clusters': Analysiert Cluster direkt auf dem HNSW-Graphen (Layer 0). Extrem schnell, da keine Vektorberechnungen nötig sind.`,
      parameters: AnalyzeGraphParameters,
      execute: async (args: any) => {
        await this.initPromise;
        const parsed = AnalyzeGraphSchema.safeParse(args);
        if (!parsed.success) return JSON.stringify({ error: "Ungültige Eingabe", issues: parsed.error.issues });
        const input = parsed.data as any;

        if (input.action === "infer_relations") {
          try {
            // Prüfe ob Entität existiert
            const entityRes = await this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: input.entity_id });
            if (entityRes.rows.length === 0) {
              return JSON.stringify({ error: `Entität mit ID '${input.entity_id}' nicht gefunden` });
            }
            const suggestions = await this.inferenceEngine.inferRelations(input.entity_id);
            return JSON.stringify({ entity_id: input.entity_id, suggestions });
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Fehler bei der Inferenz" });
          }
        }

        if (input.action === "bridge_discovery") {
          try {
            const bridges = await this.findBridgeEntities();
            return JSON.stringify({ bridge_count: bridges.length, bridges });
          } catch (error: any) {
            console.error("Bridge Discovery Error:", error);
            return JSON.stringify({ error: error.message || "Fehler bei der Bridge Discovery" });
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
            return JSON.stringify({ error: error.message || "Fehler bei der Community Detection" });
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
            return JSON.stringify({ error: error.message || "Fehler bei der PageRank-Berechnung" });
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
            return JSON.stringify({ error: error.message || "Fehler bei Betweenness Centrality" });
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
            return JSON.stringify({ error: error.message || "Fehler bei HITS-Berechnung" });
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
            return JSON.stringify({ error: error.message || "Fehler bei Connected Components" });
          }
        }

        if (input.action === "shortest_path") {
          try {
            const result = await this.computeShortestPath({
              start_entity: input.start_entity,
              end_entity: input.end_entity
            });
            if (!result) return JSON.stringify({ error: "Kein Pfad gefunden" });
            return JSON.stringify(result);
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Fehler bei Shortest Path" });
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
            console.error("Fehler bei Graph Traversal:", error);
            return JSON.stringify({ error: "Graph Traversal fehlgeschlagen", details: error.message });
          }
        }

        if (input.action === "get_relation_evolution") {
          try {
            const fromId = input.from_id;
            const toId = input.to_id;

            // Fetch entity names for better output
            const fromEntityRes = await this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: fromId });
            if (fromEntityRes.rows.length === 0) {
              return JSON.stringify({ error: `Quell-Entität mit ID '${fromId}' nicht gefunden` });
            }
            const fromName = fromEntityRes.rows[0][0];

            let query = "";
            let params: any = { from: fromId };

            if (toId) {
              const toEntityRes = await this.db.run('?[name] := *entity{id: $id, name, @ "NOW"}', { id: toId });
              if (toEntityRes.rows.length === 0) {
                return JSON.stringify({ error: `Ziel-Entität mit ID '${toId}' nicht gefunden` });
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
              description: "Zeigt die zeitliche Entwicklung von Beziehungen. 'ASSERTED' bedeutet die Beziehung wurde erstellt oder aktualisiert, 'RETRACTED' bedeutet sie wurde beendet/gelöscht."
            });
          } catch (error: any) {
            console.error("Fehler bei Relation Evolution:", error);
            return JSON.stringify({ error: error.message || "Fehler bei der Relation Evolution" });
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
              return JSON.stringify({ error: `Start-Entität mit ID '${startEntityId}' nicht gefunden` });
            }
            const startName = entityRes.rows[0][0];

            console.error(`[SemanticWalk] Starte Walk für '${startName}' (${startEntityId}) - Tiefe: ${maxDepth}, MinSim: ${minSimilarity}`);
            
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
            console.error("Fehler bei Semantic Walk:", error);
            return JSON.stringify({ error: error.message || "Fehler beim Semantic Walk" });
          }
        }

        if (input.action === "hnsw_clusters") {
          try {
            const clusters = await this.inferenceEngine.analyzeHnswClusters();
            return JSON.stringify({ cluster_count: clusters.length, clusters });
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Fehler bei HNSW Cluster Analysis" });
          }
        }

        return JSON.stringify({ error: "Unbekannte action" });
      },
    });

    const ManageSystemSchema = z.discriminatedUnion("action", [
      z.object({ action: z.literal("health") }),
      z.object({
        action: z.literal("snapshot_create"),
        metadata: MetadataSchema.optional().describe("Zusätzliche Metadaten für den Snapshot"),
      }),
      z.object({ action: z.literal("snapshot_list") }),
      z.object({
        action: z.literal("snapshot_diff"),
        snapshot_id_a: z.string().describe("Erster Snapshot"),
        snapshot_id_b: z.string().describe("Zweiter Snapshot"),
      }),
      z.object({
        action: z.literal("cleanup"),
        confirm: z.boolean().describe("Muss true sein, um die Bereinigung zu bestätigen"),
        older_than_days: z.number().min(1).max(3650).optional().default(30),
        max_observations: z.number().min(1).max(200).optional().default(20),
        min_entity_degree: z.number().min(0).max(100).optional().default(2),
        model: z.string().optional().default("demyagent-4b-i1:Q6_K"),
      }),
      z.object({
        action: z.literal("reflect"),
        entity_id: z.string().optional().describe("Optionale Entität-ID für gezielte Reflexion"),
        model: z.string().optional().default("demyagent-4b-i1:Q6_K"),
      }),
      z.object({
        action: z.literal("clear_memory"),
        confirm: z.boolean().describe("Muss true sein, um die Löschung zu bestätigen"),
      }),
    ]);

    const ManageSystemParameters = z.object({
      action: z
        .enum(["health", "snapshot_create", "snapshot_list", "snapshot_diff", "cleanup", "reflect", "clear_memory"])
        .describe("Aktion (bestimmt welche Felder erforderlich sind)"),
      snapshot_id_a: z.string().optional().describe("Für snapshot_diff erforderlich"),
      snapshot_id_b: z.string().optional().describe("Für snapshot_diff erforderlich"),
      metadata: MetadataSchema.optional().describe("Optional für snapshot_create"),
      confirm: z.boolean().optional().describe("Für cleanup/clear_memory erforderlich und muss true sein"),
      older_than_days: z.number().optional().describe("Optional für cleanup"),
      max_observations: z.number().optional().describe("Optional für cleanup"),
      min_entity_degree: z.number().optional().describe("Optional für cleanup"),
      model: z.string().optional().describe("Optional für cleanup/reflect"),
      entity_id: z.string().optional().describe("Optional für reflect"),
    });

    this.mcp.addTool({
      name: "manage_system",
      description: `System-Wartung und Speicher-Management. Wähle die Operation über 'action'.
Unterstützte Aktionen:
- 'health': Statusprüfung. Liefert DB-Counts und Embedding-Cache-Statistiken.
- 'snapshot_create': Erstellt einen Backup-Punkt. Params: { metadata?: object }.
- 'snapshot_list': Listet alle verfügbaren Snapshots auf.
- 'snapshot_diff': Vergleicht zwei Snapshots. Params: { snapshot_id_a: string, snapshot_id_b: string }.
- 'cleanup': Janitor-Service zur Konsolidierung. Params: { confirm: boolean, older_than_days?: number, max_observations?: number, min_entity_degree?: number, model?: string }.
  * Bei confirm=false: Dry-Run (zeigt Kandidaten).
  * Bei confirm=true: Fasst alte/isolierte Fragmente mittels LLM zusammen (Executive Summary) und löscht Rauschen.
- 'reflect': Reflexions-Service. Analysiert Memory auf Widersprüche und Einsichten. Params: { entity_id?: string, model?: string }.
- 'clear_memory': Setzt die gesamte Datenbank zurück. Params: { confirm: boolean (muss true sein) }.`,
      parameters: ManageSystemParameters,
      execute: async (args: any) => {
        await this.initPromise;
        const parsed = ManageSystemSchema.safeParse(args);
        if (!parsed.success) return JSON.stringify({ error: "Ungültige Eingabe", issues: parsed.error.issues });
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
            // Optimierung: Sequentielle Ausführung und Count-Aggregation statt Full-Fetch
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

            return JSON.stringify({ snapshot_id, ...counts, status: "Snapshot erstellt" });
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Fehler beim Erstellen des Snapshots" });
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
            return JSON.stringify({ error: error.message || "Fehler beim Auflisten der Snapshots" });
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
                error: "Snapshot nicht gefunden",
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
            return JSON.stringify({ error: error.message || "Fehler beim Diff der Snapshots" });
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
            return JSON.stringify({ error: error.message || "Fehler beim Cleanup" });
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
            return JSON.stringify({ error: error.message || "Fehler bei der Reflexion" });
          }
        }

        if (input.action === "clear_memory") {
          if (!input.confirm) {
            return JSON.stringify({ error: "Löschung nicht bestätigt. Setzen Sie 'confirm' auf true." });
          }

          try {
            await this.db.run(`
              { ?[id, created_at] := *observation{id, created_at} :rm observation {id, created_at} }
              { ?[from_id, to_id, relation_type, created_at] := *relationship{from_id, to_id, relation_type, created_at} :rm relationship {from_id, to_id, relation_type, created_at} }
              { ?[id, created_at] := *entity{id, created_at} :rm entity {id, created_at} }
            `);

            return JSON.stringify({ status: "Gedächtnis vollständig geleert" });
          } catch (error: any) {
            return JSON.stringify({ error: error.message || "Fehler beim Leeren des Gedächtnisses" });
          }
        }

        return JSON.stringify({ error: "Unbekannte action" });
      },
    });
  }

  public async start() {
    await this.mcp.start({ transportType: "stdio" });
    console.error("Cozo Memory MCP Server läuft auf stdio");
  }
}

if (require.main === module) {
  const server = new MemoryServer();
  server.start().catch((err) => {
    console.error("Server konnte nicht gestartet werden:", err);
    process.exit(1);
  });
}
