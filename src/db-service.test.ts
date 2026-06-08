import { DatabaseService } from "./db-service";
import type { Entity, Observation, Relationship } from "./types";

describe("DatabaseService", () => {
  let db: DatabaseService;

  beforeEach(async () => {
    db = new DatabaseService(":memory:", "sqlite");
    await db.initialize();
  });

  // ── Entity CRUD ──────────────────────────────────────────────
  describe("Entity CRUD", () => {
    const sampleEntity: Entity = {
      id: "e1",
      name: "Test Entity",
      type: "Test",
      embedding: [0.1, 0.2, 0.3],
      name_embedding: [0.4, 0.5, 0.6],
      metadata: { key: "value" },
      created_at: 1000,
    };

    it("should create and get an entity", async () => {
      await db.createEntity(sampleEntity);
      const result = await db.getEntity("e1");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Test Entity");
      expect(result!.type).toBe("Test");
      expect(result!.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result!.metadata).toEqual({ key: "value" });
    });

    it("should return null for non-existent entity", async () => {
      const result = await db.getEntity("non_existent");
      expect(result).toBeNull();
    });

    it("should update an entity partially", async () => {
      await db.createEntity(sampleEntity);
      await db.updateEntity("e1", { name: "Updated Entity", metadata: { new: "meta" } });

      const result = await db.getEntity("e1");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Updated Entity");
      // metadata should be merged
      expect(result!.metadata).toEqual({ key: "value", new: "meta" });
    });

    it("should update embedding fields", async () => {
      await db.createEntity(sampleEntity);
      const newEmbedding = [0.9, 0.8, 0.7];
      await db.updateEntity("e1", { embedding: newEmbedding });

      const result = await db.getEntity("e1");
      expect(result!.embedding).toEqual(newEmbedding);
      // name_embedding should remain unchanged
      expect(result!.name_embedding).toEqual([0.4, 0.5, 0.6]);
    });

    it("should not throw when updating non-existent entity", async () => {
      await expect(db.updateEntity("ghost", { name: "X" })).resolves.not.toThrow();
    });

    it("should delete an entity and its observations", async () => {
      await db.createEntity(sampleEntity);
      await db.addObservation({
        id: "obs1",
        entity_id: "e1",
        text: "test",
        embedding: [],
        metadata: {},
        created_at: 1001,
      });
      await db.deleteEntity("e1");

      const entity = await db.getEntity("e1");
      expect(entity).toBeNull();

      // Observation should also be deleted
      const obs = await db.getObservationsForEntity("e1");
      expect(obs).toHaveLength(0);
    });
  });

  // ── Observations ─────────────────────────────────────────────
  describe("Observation CRUD", () => {
    beforeEach(async () => {
      await db.createEntity({
        id: "e2",
        name: "Entity With Obs",
        type: "Test",
        embedding: [],
        name_embedding: [],
        metadata: {},
        created_at: 2000,
      });
    });

    it("should add and retrieve observations for an entity", async () => {
      await db.addObservation({
        id: "obs1",
        entity_id: "e2",
        text: "First observation",
        embedding: [1.0, 2.0],
        metadata: { source: "test" },
        created_at: 2001,
      });
      await db.addObservation({
        id: "obs2",
        entity_id: "e2",
        text: "Second observation",
        embedding: [3.0, 4.0],
        metadata: {},
        created_at: 2002,
      });

      const obs = await db.getObservationsForEntity("e2");
      expect(obs).toHaveLength(2);
      expect(obs[0].text).toBe("First observation");
      expect(obs[1].text).toBe("Second observation");
    });

    it("should return empty array for entity with no observations", async () => {
      const obs = await db.getObservationsForEntity("e2");
      expect(obs).toHaveLength(0);
    });

    it("should return empty array for non-existent entity", async () => {
      const obs = await db.getObservationsForEntity("ghost");
      expect(obs).toHaveLength(0);
    });
  });

  // ── Relationships ────────────────────────────────────────────
  describe("Relationship CRUD", () => {
    beforeEach(async () => {
      for (const id of ["a", "b", "c"]) {
        await db.createEntity({
          id,
          name: `Entity ${id}`,
          type: "Test",
          embedding: [],
          name_embedding: [],
          metadata: {},
          created_at: 3000,
        });
      }
    });

    it("should create and list all relations", async () => {
      await db.createRelation({
        from_id: "a", to_id: "b", relation_type: "knows",
        strength: 0.8, metadata: {}, created_at: 3001,
      });
      await db.createRelation({
        from_id: "b", to_id: "c", relation_type: "likes",
        strength: 1.0, metadata: { since: "2024" }, created_at: 3002,
      });

      const all = await db.getRelations();
      expect(all).toHaveLength(2);
    });

    it("should filter relations by from_id", async () => {
      await db.createRelation({
        from_id: "a", to_id: "b", relation_type: "knows",
        strength: 0.5, metadata: {}, created_at: 3001,
      });
      await db.createRelation({
        from_id: "a", to_id: "c", relation_type: "knows",
        strength: 0.3, metadata: {}, created_at: 3002,
      });
      await db.createRelation({
        from_id: "b", to_id: "c", relation_type: "likes",
        strength: 0.9, metadata: {}, created_at: 3003,
      });

      const fromA = await db.getRelations("a");
      expect(fromA).toHaveLength(2);

      const fromB = await db.getRelations("b");
      expect(fromB).toHaveLength(1);
      expect(fromB[0].to_id).toBe("c");
    });

    it("should filter relations by to_id", async () => {
      await db.createRelation({
        from_id: "a", to_id: "c", relation_type: "knows",
        strength: 0.5, metadata: {}, created_at: 3001,
      });
      await db.createRelation({
        from_id: "b", to_id: "c", relation_type: "likes",
        strength: 0.9, metadata: {}, created_at: 3002,
      });

      const toC = await db.getRelations(undefined, "c");
      expect(toC).toHaveLength(2);
    });

    it("should delete entity and cascade its relations", async () => {
      await db.createRelation({
        from_id: "a", to_id: "b", relation_type: "knows",
        strength: 0.5, metadata: {}, created_at: 3001,
      });
      await db.deleteEntity("a");

      const all = await db.getRelations();
      expect(all).toHaveLength(0);
    });
  });

  // ── Vector Search ────────────────────────────────────────────
  describe("Vector Search", () => {
    beforeEach(async () => {
      const entities = [
        { id: "vec1", name: "Cat", embedding: [1.0, 0.0, 0.0] },
        { id: "vec2", name: "Dog", embedding: [0.0, 1.0, 0.0] },
        { id: "vec3", name: "Fish", embedding: [0.0, 0.0, 1.0] },
      ];
      for (const e of entities) {
        await db.createEntity({
          id: e.id, name: e.name, type: "Animal",
          embedding: e.embedding, name_embedding: e.embedding,
          metadata: {}, created_at: 4000,
        });
      }
    });

    it("should find closest entity by cosine similarity", async () => {
      // Query vector closest to [1, 0, 0] → "Cat"
      const results = await db.vectorSearchEntity([0.9, 0.1, 0.0], 1);
      expect(results).toHaveLength(1);
      expect(results[0][0]).toBe("vec1"); // id
      expect(results[0][4]).toBeGreaterThan(0.9); // score
    });

    it("should return correct limit", async () => {
      const results = await db.vectorSearchEntity([0.5, 0.5, 0.5], 2);
      expect(results).toHaveLength(2);
    });

    it("should handle empty query vector gracefully (returns zero-score results)", async () => {
      const results = await db.vectorSearchEntity([], 10);
      // Empty vector produces cosine=0 for all entities, so all are returned with score 0
      expect(results).toHaveLength(3);
      expect(results[0][4]).toBe(0);
    });
  });

  // ── Full-Text Search ─────────────────────────────────────────
  describe("Full-Text Search", () => {
    beforeEach(async () => {
      await db.createEntity({
        id: "fts1", name: "Alice Wonderland", type: "Person",
        embedding: [], name_embedding: [], metadata: {}, created_at: 5000,
      });
      await db.createEntity({
        id: "fts2", name: "Bob The Builder", type: "Person",
        embedding: [], name_embedding: [], metadata: {}, created_at: 5001,
      });
      await db.addObservation({
        id: "fobs1", entity_id: "fts1",
        text: "Alice lives in a wonderland of dreams",
        embedding: [], metadata: {}, created_at: 5002,
      });
    });

    it("should find entity by name substring", async () => {
      const results = await db.fullTextSearchEntity("alice");
      expect(results).toHaveLength(1);
      expect(results[0][0]).toBe("fts1");
    });

    it("should be case-insensitive", async () => {
      const results = await db.fullTextSearchEntity("BOB");
      expect(results).toHaveLength(1);
      expect(results[0][0]).toBe("fts2");
    });

    it("should find observation by text substring", async () => {
      const results = await db.fullTextSearchObservation("wonderland");
      expect(results).toHaveLength(1);
      expect(results[0][1]).toBe("fts1");
    });

    it("should return empty array for no match", async () => {
      const results = await db.fullTextSearchEntity("nobody");
      expect(results).toHaveLength(0);
    });
  });

  // ── Export & Stats ───────────────────────────────────────────
  describe("Export & Stats", () => {
    it("should export empty database", async () => {
      const exported = await db.exportRelations();
      expect(exported).toHaveProperty("entity");
      expect(exported).toHaveProperty("observation");
      expect(exported).toHaveProperty("relationship");
      expect(exported.entity).toHaveLength(0);
      expect(exported.observation).toHaveLength(0);
      expect(exported.relationship).toHaveLength(0);
    });

    it("should export correct counts", async () => {
      await db.createEntity({
        id: "exp1", name: "Export Test", type: "Test",
        embedding: [], name_embedding: [], metadata: {}, created_at: 6000,
      });
      await db.addObservation({
        id: "exp_obs1", entity_id: "exp1", text: "Obs",
        embedding: [], metadata: {}, created_at: 6001,
      });
      await db.createRelation({
        from_id: "exp1", to_id: "exp1", relation_type: "self",
        strength: 1.0, metadata: {}, created_at: 6002,
      });

      const exported = await db.exportRelations();
      expect(exported.entity).toHaveLength(1);
      expect(exported.observation).toHaveLength(1);
      expect(exported.relationship).toHaveLength(1);
    });

    it("should return correct stats", async () => {
      await db.createEntity({
        id: "stat1", name: "Stats", type: "T",
        embedding: [], name_embedding: [], metadata: {}, created_at: 7000,
      });
      const stats = await db.getStats();
      expect(stats.entities).toBe(1);
      expect(stats.observations).toBe(0);
      expect(stats.relationships).toBe(0);
    });
  });

  // ── Lifecycle ────────────────────────────────────────────────
  describe("Lifecycle", () => {
    it("should initialize without error", async () => {
      await expect(db.initialize()).resolves.not.toThrow();
    });

    it("should close without error", async () => {
      await expect(db.close()).resolves.not.toThrow();
    });

    it("should backup and restore without error", async () => {
      await expect(db.backup("/tmp/test_backup.cozo")).resolves.not.toThrow();
      await expect(db.restore("/tmp/test_backup.cozo")).resolves.not.toThrow();
    });

    it("should run a query without error", async () => {
      const result = await db.runQuery("SELECT 1");
      expect(result).toEqual({ rows: [] });
    });
  });
});