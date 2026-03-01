import { CozoDb } from "cozo-node";

/**
 * Logical Edges Service (v1.0)
 * 
 * Discovers implicit relationships from entity metadata using logical inference rules.
 * 
 * Research Foundation:
 * - SAGE (ICLR 2026): Implicit graph exploration with on-demand edge discovery
 * - Metadata Knowledge Graphs (Atlan 2026): Metadata-driven relationship inference
 * - Knowledge Graph Completion (Frontiers 2025): Predicting implicit relationships
 * 
 * Patterns:
 * 1. **Metadata-Based Edges**: Same category, type, domain, etc.
 * 2. **Semantic Edges**: Entities with similar metadata patterns
 * 3. **Hierarchical Edges**: Parent-child relationships from metadata
 * 4. **Contextual Edges**: Time-based, location-based, or domain-based grouping
 * 5. **Transitive Edges**: Derived from existing relationships + metadata
 */
export class LogicalEdgesService {
  private db: CozoDb;

  constructor(db: CozoDb) {
    this.db = db;
  }

  /**
   * Discover all logical edges for an entity based on metadata patterns
   */
  async discoverLogicalEdges(entityId: string): Promise<LogicalEdge[]> {
    const edges: LogicalEdge[] = [];

    // 1. Same Category Edges
    const categoryEdges = await this.findSameCategoryEdges(entityId);
    edges.push(...categoryEdges);

    // 2. Same Type Edges
    const typeEdges = await this.findSameTypeEdges(entityId);
    edges.push(...typeEdges);

    // 3. Hierarchical Edges (parent-child from metadata)
    const hierarchicalEdges = await this.findHierarchicalEdges(entityId);
    edges.push(...hierarchicalEdges);

    // 4. Contextual Edges (domain, time period, location)
    const contextualEdges = await this.findContextualEdges(entityId);
    edges.push(...contextualEdges);

    // 5. Transitive Edges (derived from relationships + metadata)
    const transitiveEdges = await this.findTransitiveLogicalEdges(entityId);
    edges.push(...transitiveEdges);

    // Deduplicate and return
    return this.deduplicateEdges(edges);
  }

  /**
   * Pattern 1: Same Category Edges
   * 
   * Entities with the same category metadata are logically related
   * Example: All "Machine Learning" papers are related
   */
  private async findSameCategoryEdges(entityId: string): Promise<LogicalEdge[]> {
    try {
      const query = `
        # Get the category of the target entity
        source_category[category] :=
          *entity{id: $entity_id, metadata, @ "NOW"},
          category = get(metadata, 'category')

        # Find all entities with the same category
        ?[other_id, other_name, other_type, confidence, reason] :=
          source_category[category],
          category != null,
          *entity{id: other_id, name: other_name, type: other_type, metadata, @ "NOW"},
          other_id != $entity_id,
          get(metadata, 'category') == category,
          confidence = 0.8,
          reason = concat('Same category: ', category)
      `;

      const result = await this.db.run(query, { entity_id: entityId });

      return result.rows.map((r: any) => ({
        from_id: entityId,
        to_id: r[0],
        relation_type: "same_category",
        confidence: r[3],
        reason: r[4],
        pattern: "metadata_category"
      }));
    } catch (error: any) {
      console.error("[LogicalEdges] Same category error:", error.message);
      return [];
    }
  }

  /**
   * Pattern 2: Same Type Edges
   * 
   * Entities of the same type are logically related
   * Example: All "Person" entities, all "Project" entities
   */
  private async findSameTypeEdges(entityId: string): Promise<LogicalEdge[]> {
    try {
      const query = `
        # Get the type of the target entity
        source_type[entity_type] :=
          *entity{id: $entity_id, type: entity_type, @ "NOW"}

        # Find all entities with the same type
        ?[other_id, other_name, confidence, reason] :=
          source_type[entity_type],
          *entity{id: other_id, name: other_name, type: entity_type, @ "NOW"},
          other_id != $entity_id,
          confidence = 0.7,
          reason = concat('Same type: ', entity_type)
      `;

      const result = await this.db.run(query, { entity_id: entityId });

      return result.rows.map((r: any) => ({
        from_id: entityId,
        to_id: r[0],
        relation_type: "same_type",
        confidence: r[2],
        reason: r[3],
        pattern: "metadata_type"
      }));
    } catch (error: any) {
      console.error("[LogicalEdges] Same type error:", error.message);
      return [];
    }
  }

  /**
   * Pattern 3: Hierarchical Edges
   * 
   * Parent-child relationships derived from metadata hierarchy
   * Example: "parent_id" in metadata indicates parent entity
   */
  private async findHierarchicalEdges(entityId: string): Promise<LogicalEdge[]> {
    try {
      const query = `
        # Get parent_id from metadata
        source_parent[parent_id] :=
          *entity{id: $entity_id, metadata, @ "NOW"},
          parent_id = get(metadata, 'parent_id'),
          parent_id != null

        # Find parent entity
        ?[parent_id, parent_name, confidence, reason] :=
          source_parent[parent_id],
          *entity{id: parent_id, name: parent_name, @ "NOW"},
          confidence = 0.9,
          reason = 'Parent relationship from metadata'

        # Also find children (reverse direction)
        ?[child_id, child_name, confidence, reason] :=
          *entity{id: child_id, metadata, @ "NOW"},
          get(metadata, 'parent_id') == $entity_id,
          *entity{id: child_id, name: child_name, @ "NOW"},
          confidence = 0.9,
          reason = 'Child relationship from metadata'
      `;

      const result = await this.db.run(query, { entity_id: entityId });

      return result.rows.map((r: any) => ({
        from_id: entityId,
        to_id: r[0],
        relation_type: "hierarchical",
        confidence: r[2],
        reason: r[3],
        pattern: "metadata_hierarchy"
      }));
    } catch (error: any) {
      console.error("[LogicalEdges] Hierarchical error:", error.message);
      return [];
    }
  }

  /**
   * Pattern 4: Contextual Edges
   * 
   * Entities sharing context (domain, time period, location, organization)
   * Example: All papers from 2025, all entities in "AI" domain
   */
  private async findContextualEdges(entityId: string): Promise<LogicalEdge[]> {
    try {
      // Simplified contextual edge discovery
      // Find entities with same domain
      const query = `
        # Get domain from metadata
        source_domain[domain] :=
          *entity{id: $entity_id, metadata, @ "NOW"},
          domain = get(metadata, 'domain'),
          domain != null

        # Find entities with matching domain
        ?[other_id, other_name, confidence, reason] :=
          source_domain[domain],
          *entity{id: other_id, name: other_name, metadata, @ "NOW"},
          other_id != $entity_id,
          get(metadata, 'domain') == domain,
          confidence = 0.75,
          reason = concat('Same domain: ', domain)
      `;

      const result = await this.db.run(query, { entity_id: entityId });

      return result.rows.map((r: any) => ({
        from_id: entityId,
        to_id: r[0],
        relation_type: "contextual",
        confidence: r[2],
        reason: r[3],
        pattern: "metadata_context"
      }));
    } catch (error: any) {
      console.error("[LogicalEdges] Contextual error:", error.message);
      return [];
    }
  }

  /**
   * Pattern 5: Transitive Logical Edges
   * 
   * Derived from existing relationships combined with metadata patterns
   * Example: If A -> B (explicit) and B has same category as C, then A -> C (transitive)
   */
  private async findTransitiveLogicalEdges(entityId: string): Promise<LogicalEdge[]> {
    try {
      const query = `
        # Get entities connected via explicit relationships
        connected[mid_id] :=
          *relationship{from_id: $entity_id, to_id: mid_id, @ "NOW"}

        # Get metadata of connected entities
        connected_metadata[mid_id, mid_category, mid_type] :=
          connected[mid_id],
          *entity{id: mid_id, type: mid_type, metadata, @ "NOW"},
          mid_category = get(metadata, 'category')

        # Find entities with same category as connected entities
        ?[other_id, other_name, confidence, reason] :=
          connected_metadata[mid_id, category, _],
          category != null,
          *entity{id: other_id, name: other_name, metadata, @ "NOW"},
          other_id != $entity_id,
          other_id != mid_id,
          get(metadata, 'category') == category,
          confidence = 0.6,
          reason = concat('Transitive via category match through ', mid_id)

        # Find entities with same type as connected entities
        ?[other_id, other_name, confidence, reason] :=
          connected_metadata[mid_id, _, entity_type],
          *entity{id: other_id, name: other_name, type: entity_type, @ "NOW"},
          other_id != $entity_id,
          other_id != mid_id,
          confidence = 0.55,
          reason = concat('Transitive via type match through ', mid_id)
      `;

      const result = await this.db.run(query, { entity_id: entityId });

      return result.rows.map((r: any) => ({
        from_id: entityId,
        to_id: r[0],
        relation_type: "transitive_logical",
        confidence: r[2],
        reason: r[3],
        pattern: "metadata_transitive"
      }));
    } catch (error: any) {
      console.error("[LogicalEdges] Transitive error:", error.message);
      return [];
    }
  }

  /**
   * Deduplicate edges by (from_id, to_id, relation_type)
   * Keep the one with highest confidence
   */
  private deduplicateEdges(edges: LogicalEdge[]): LogicalEdge[] {
    const map = new Map<string, LogicalEdge>();

    for (const edge of edges) {
      const key = `${edge.from_id}|${edge.to_id}|${edge.relation_type}`;
      const existing = map.get(key);

      if (!existing || edge.confidence > existing.confidence) {
        map.set(key, edge);
      }
    }

    return Array.from(map.values());
  }

  /**
   * Create logical edges as explicit relationships in the database
   * (Optional: for performance optimization)
   */
  async materializeLogicalEdges(entityId: string): Promise<number> {
    try {
      const edges = await this.discoverLogicalEdges(entityId);
      let created = 0;

      for (const edge of edges) {
        try {
          const now = Date.now() * 1000;
          await this.db.run(
            `?[from_id, to_id, relation_type, created_at, strength, metadata] <- [
              [$from_id, $to_id, $rel_type, [${now}, true], $strength, $metadata]
            ] :insert relationship {from_id, to_id, relation_type, created_at => strength, metadata}`,
            {
              from_id: edge.from_id,
              to_id: edge.to_id,
              rel_type: edge.relation_type,
              strength: edge.confidence,
              metadata: { logical_edge: true, pattern: edge.pattern, reason: edge.reason }
            }
          );
          created++;
        } catch (e: any) {
          // Ignore duplicate key errors
          if (!e.message?.includes("duplicate")) {
            console.error("[LogicalEdges] Materialization error:", e.message);
          }
        }
      }

      return created;
    } catch (error: any) {
      console.error("[LogicalEdges] Materialization failed:", error.message);
      return 0;
    }
  }
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface LogicalEdge {
  from_id: string;
  to_id: string;
  relation_type: string;
  confidence: number;
  reason: string;
  pattern: "metadata_category" | "metadata_type" | "metadata_hierarchy" | "metadata_context" | "metadata_transitive";
}
