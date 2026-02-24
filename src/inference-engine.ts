import { CozoDb } from "cozo-node";
import { EmbeddingService } from "./embedding-service.js";

export interface InferredRelation {
  from_id: string;
  to_id: string;
  relation_type: string;
  confidence: number;
  reason: string;
}

export class InferenceEngine {
  private db: CozoDb;
  private embeddingService: EmbeddingService;

  constructor(db: CozoDb, embeddingService: EmbeddingService) {
    this.db = db;
    this.embeddingService = embeddingService;
  }

  /**
   * Infers relations for a specific entity based on various strategies
   */
  async inferRelations(entityId: string): Promise<InferredRelation[]> {
    const results: InferredRelation[] = [];

    // 1. Co-occurrence in Observations (same entity mentioned in texts)
    const coOccurrences = await this.findCoOccurrences(entityId);
    results.push(...coOccurrences);

    // 2. Vector Proximity (Semantic Similarity)
    const similar = await this.findSimilarEntities(entityId);
    results.push(...similar);

    // 3. Transitive Relations (A -> B, B -> C => A -> C)
    const transitive = await this.findTransitiveRelations(entityId);
    results.push(...transitive);

    const expertise = await this.findTransitiveExpertise(entityId);
    results.push(...expertise);

    const custom = await this.applyCustomRules(entityId);
    results.push(...custom);

    return results;
  }


  async inferImplicitRelations(entityId: string): Promise<InferredRelation[]> {
    const expertise = await this.findTransitiveExpertise(entityId);
    const custom = await this.applyCustomRules(entityId);
    return [...expertise, ...custom];
  }

  private async findCoOccurrences(entityId: string): Promise<InferredRelation[]> {
    try {
      // Search for entities whose names appear in the observations of the target entity
      // Or entities that reference the same observation (if we had multi-entity observations)
      // Here: Search for entities whose name appears in the text of the observations of entityId
      const query = `
        ?[other_id, other_name, confidence, reason] :=
          *observation{entity_id: $target, text, @ "NOW"},
          *entity{id: other_id, name: other_name, @ "NOW"},
          other_id != $target,
          str_includes(text, other_name),
          confidence = 0.7,
          reason = concat('Mention of ', other_name, ' in observations')
      `;
      const res = await this.db.run(query, { target: entityId });
      
      return res.rows.map((row: any) => ({
        from_id: entityId,
        to_id: row[0],
        relation_type: "related_to",
        confidence: row[2],
        reason: row[3]
      }));
    } catch (e) {
      console.error("Inference: Co-occurrence failed", e);
      return [];
    }
  }

  private async findSimilarEntities(entityId: string): Promise<InferredRelation[]> {
    try {
      // Get embedding of the target entity
      const entityRes = await this.db.run('?[embedding] := *entity{id: $id, embedding, @ "NOW"}', { id: entityId });
      if (entityRes.rows.length === 0) return [];
      const embedding = entityRes.rows[0][0];

      // Search semantically similar entities via HNSW
      const query = `
        ?[other_id, other_name, confidence, reason] :=
          ~entity:semantic { id: other_id, embedding |
            query: vec($emb),
            k: 5,
            ef: 64,
            bind_distance: dist
          },
          *entity{id: other_id, name: other_name, @ "NOW"},
          other_id != $id,
          dist < 0.2,
          confidence = (1.0 - dist) * 0.9,
          reason = 'Semantic Similarity'
      `;
      const res = await this.db.run(query, { id: entityId, emb: embedding });

      return res.rows.map((row: any) => ({
        from_id: entityId,
        to_id: row[0],
        relation_type: "similar_to",
        confidence: row[2],
        reason: row[3]
      }));
    } catch (e) {
      console.error("Inference: Similarity failed", e);
      return [];
    }
  }

  private async findTransitiveRelations(entityId: string): Promise<InferredRelation[]> {
    try {
      // Finds A -> B -> C and proposes A -> C
      const query = `
        ?[target_id, target_name, confidence, reason] :=
          *relationship{from_id: $id, to_id: mid_id, relation_type: r1, @ "NOW"},
          *relationship{from_id: mid_id, to_id: target_id, relation_type: r2, @ "NOW"},
          *entity{id: target_id, name: target_name, @ "NOW"},
          target_id != $id,
          confidence = 0.5,
          reason = concat('Indirect connection via ', r1, ' and ', r2)
      `;
      const res = await this.db.run(query, { id: entityId });

      return res.rows.map((row: any) => ({
        from_id: entityId,
        to_id: row[0],
        relation_type: "potentially_related",
        confidence: row[2],
        reason: row[3]
      }));
    } catch (e) {
      console.error("Inference: Transitive failed", e);
      return [];
    }
  }

  private async findTransitiveExpertise(entityId: string): Promise<InferredRelation[]> {
    try {
      const query = `
        ?[tech_id, tech_name, tech_type, confidence, reason] :=
          *entity{id: $id, type: 'Person', @ "NOW"},
          *relationship{from_id: $id, to_id: proj_id, relation_type: 'works_on', @ "NOW"},
          *relationship{from_id: proj_id, to_id: tech_id, relation_type: 'uses_tech', @ "NOW"},
          *entity{id: tech_id, name: tech_name, type: tech_type, @ "NOW"},
          confidence = 0.7,
          reason = concat('Transitive expertise via works_on -> uses_tech: ', tech_name)
      `;
      const res = await this.db.run(query, { id: entityId });

      const bestByTarget = new Map<string, InferredRelation>();
      for (const row of res.rows as any[]) {
        const to_id = row[0];
        const confidence = Number(row[3]);
        const candidate: any = {
          from_id: entityId,
          to_id,
          relation_type: "expert_in",
          confidence,
          reason: row[4],
          target_name: row[1],
          target_type: row[2],
        };
        const current = bestByTarget.get(to_id);
        if (!current || confidence > current.confidence) bestByTarget.set(to_id, candidate);
      }

      return Array.from(bestByTarget.values());
    } catch (e) {
      console.error("Inference: Transitive expertise failed", e);
      return [];
    }
  }

  /**
   * Performs a recursive "Graph Walk" that follows both explicit relations and
   * semantic similarity. This enables finding paths like:
   * A -> (explicit) -> B -> (semantically similar) -> C -> (explicit) -> D
   * 
   * @param startEntityId The starting entity
   * @param maxDepth Maximum depth of the search (Default: 3)
   * @param minSimilarity Minimum similarity for semantic jumps (0.0 - 1.0, Default: 0.7)
   */
  async semanticGraphWalk(startEntityId: string, maxDepth: number = 3, minSimilarity: number = 0.7): Promise<{
    entity_id: string;
    distance: number;
    path_score: number;
    path_type: string; // 'explicit', 'semantic', 'mixed'
  }[]> {
    try {
      // Get embedding of the start entity for the first semantic jump
      const entityRes = await this.db.run('?[embedding] := *entity{id: $id, embedding, @ "NOW"}', { id: startEntityId });
      if (entityRes.rows.length === 0) return [];
      const startEmbedding = entityRes.rows[0][0];

      // Recursive Datalog query
      // We avoid complex aggregation of strings in Datalog as this can cause errors.
      // Instead, we implicitly group by 'type' as well and filter later in JS.
      const query = `
        # 1. Start point
        path[id, depth, score, type] := 
          id = $startId, 
          depth = 0, 
          score = 1.0, 
          type = 'start'

        # 2. Recursion: Follow explicit relations
        path[next_id, new_depth, new_score, new_type] :=
          path[curr_id, depth, score, curr_type],
          depth < $maxDepth,
          *relationship{from_id: curr_id, to_id: next_id, relation_type, strength, @ "NOW"},
          new_depth = depth + 1,
          new_score = score * strength,
          new_type = if(curr_type == 'start', 'explicit', if(curr_type == 'explicit', 'explicit', 'mixed'))

        # 3. Recursion: Follow semantic similarity (via HNSW Index)
        path[next_id, new_depth, new_score, new_type] :=
          path[curr_id, depth, score, curr_type],
          depth < $maxDepth,
          *entity{id: curr_id, embedding: curr_emb, @ "NOW"}, # Load embedding
          # Search for the K nearest neighbors to the current embedding
          ~entity:semantic { id: next_id |
            query: curr_emb,
            k: 5,
            ef: 20,
            bind_distance: dist
          },
          next_id != curr_id, # No self-reference
          sim = 1.0 - dist,
          sim >= $minSim,
          new_depth = depth + 1,
          new_score = score * sim * 0.8, # Penalize semantic jumps slightly (damping)
          new_type = if(curr_type == 'start', 'semantic', if(curr_type == 'semantic', 'semantic', 'mixed'))

        # Aggregate result (Grouping by ID and Type)
        ?[id, min_depth, max_score, type] := 
          path[id, d, s, type],
          id != $startId,
          min_depth = min(d),
          max_score = max(s)
          :limit 100
      `;

      const res = await this.db.run(query, {
        startId: startEntityId,
        maxDepth: maxDepth,
        minSim: minSimilarity
      });

      // Post-processing in JS: Select best path type per ID
      const bestPaths = new Map<string, any>();
      
      for (const row of res.rows) {
        const [id, depth, score, type] = row;
        
        // Cozo sometimes returns arrays or raw values, ensure we have Strings/Numbers
        const cleanId = String(id);
        const cleanDepth = Number(depth);
        const cleanScore = Number(score);
        const cleanType = String(type);

        if (!bestPaths.has(cleanId) || cleanScore > bestPaths.get(cleanId).path_score) {
            bestPaths.set(cleanId, {
                entity_id: cleanId,
                distance: cleanDepth,
                path_score: cleanScore,
                path_type: cleanType
            });
        }
      }

      return Array.from(bestPaths.values());
    } catch (e: any) {
      console.error("Semantic Graph Walk Failed:", e.message);
      return [];
    }
  }

  /**
   * Analyzes the cluster structure directly on the HNSW graph (Layer 0).
   * This is extremely fast because no vector calculations (K-Means) are necessary,
   * but the already indexed neighborhood topology is used.
   */
  async analyzeHnswClusters(): Promise<{ 
    cluster_id: number; 
    size: number; 
    examples: string[] 
  }[]> {
    try {
      const query = `
        # 1. Extract edges from HNSW Layer 0 (Base Layer)
        # We use unweighted edges (weight=1.0) for pure topology analysis
        hnsw_edges[from, to, weight] := 
            *entity:semantic{layer: 0, fr_id: from, to_id: to},
            from != to,
            weight = 1.0

        # 2. Run Label Propagation on the HNSW graph
        # This finds natural density clusters in the vector space
        communities[cluster_id, node_id] <~ LabelPropagation(hnsw_edges[from, to, weight])

        # 3. Get names for the nodes
        cluster_nodes[cluster_id, name] :=
            communities[cluster_id, node_id],
            *entity{id: node_id, name, @ "NOW"}
        
        # 4. Aggregate results: size and examples per cluster
        # We get the raw data and aggregate in JS to avoid string aggregation problems
        ?[cluster_id, name] :=
            cluster_nodes[cluster_id, name]
      `;

      const res = await this.db.run(query);
      
      // Post-Processing: Aggregation in JS
      const clusterMap = new Map<number, { size: number; examples: string[] }>();

      for (const row of res.rows) {
        const clusterId = Number(row[0]);
        const name = row[1] as string;

        if (!clusterMap.has(clusterId)) {
          clusterMap.set(clusterId, { size: 0, examples: [] });
        }
        
        const entry = clusterMap.get(clusterId)!;
        entry.size++;
        if (entry.examples.length < 5) {
          entry.examples.push(name);
        }
      }

      const clusters = Array.from(clusterMap.entries()).map(([id, data]) => ({
        cluster_id: id,
        size: data.size,
        examples: data.examples
      }));

      // Sort by cluster size descending
      return clusters.sort((a, b) => b.size - a.size);

    } catch (e: any) {
      console.error("HNSW Cluster Analysis Failed:", e.message);
      return [];
    }
  }

  private async applyCustomRules(entityId: string): Promise<InferredRelation[]> {
    try {
      const rulesRes = await this.db.run('?[id, name, datalog] := *inference_rule{id, name, datalog}');
      if (rulesRes.rows.length === 0) return [];
      const results: InferredRelation[] = [];
      for (const row of rulesRes.rows as any[]) {
        const ruleId = String(row[0]);
        const ruleName = String(row[1]);
        const datalog = String(row[2]);
        try {
          const res = await this.db.run(datalog, { id: entityId });
          for (const r of res.rows as any[]) {
            if (!r || r.length < 5) continue;
            results.push({
              from_id: String(r[0]),
              to_id: String(r[1]),
              relation_type: String(r[2]),
              confidence: Number(r[3]),
              reason: String(r[4]),
            });
          }
        } catch (e) {
          console.error("Inference: Custom rule failed", ruleId, ruleName, e);
        }
      }
      return results;
    } catch (e) {
      console.error("Inference: Custom rules load failed", e);
      return [];
    }
  }
}
