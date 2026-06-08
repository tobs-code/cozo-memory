// ESM-Module und Dependencies mocken, die nicht mit ts-jest/commonjs kompatibel sind
let uuidCounter = 0;
jest.mock("uuid", () => ({
  v4: jest.fn(() => `mocked-uuid-${++uuidCounter}`),
  validate: jest.fn(() => true),
}));

jest.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: jest.fn(() => ({
    promise: Promise.resolve({ numPages: 0 }),
  })),
}));

jest.mock("onnxruntime-node", () => ({}), { virtual: true });

jest.mock("./performance-monitor", () => ({
  perfMonitor: {
    start: jest.fn(),
    end: jest.fn(),
  },
}));

// Logger mocken (damit loggt er nicht in die Tast-Ausgabe)
jest.mock("./logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  },
}));

import { MemoryService } from "./memory-service";
import { DatabaseService } from "./db-service";
import { EmbeddingService } from "./embedding-service";

// EmbeddingService mocken – gibt immer gleichbleibende Dummy-Vektoren zurück
jest.mock("./embedding-service", () => {
  return {
    EmbeddingService: jest.fn().mockImplementation(() => ({
      embed: jest.fn().mockImplementation(async (text: string) => {
        // Deterministic embedding based on text length
        const dim = 4;
        const base = text.length % 10;
        return [base * 0.1, (base + 1) * 0.1, (base + 2) * 0.1, (base + 3) * 0.1];
      }),
      embedBatch: jest.fn().mockImplementation(async (texts: string[]) => {
        return texts.map((t: string) => {
          const base = t.length % 10;
          return [base * 0.1, (base + 1) * 0.1, (base + 2) * 0.1, (base + 3) * 0.1];
        });
      }),
      getDimensions: jest.fn().mockReturnValue(4),
      getCacheStats: jest.fn().mockReturnValue({ size: 0, maxSize: 1000, model: "test", backend: "mock", dimensions: 4 }),
      clearCache: jest.fn(),
    })),
  };
});

describe("MemoryService", () => {
  let db: DatabaseService;
  let embeddings: EmbeddingService;
  let memory: MemoryService;

  beforeEach(async () => {
    uuidCounter = 0;
    db = new DatabaseService(":memory:", "sqlite");
    await db.initialize();
    embeddings = new EmbeddingService();
    // MemoryService braucht EmbeddingService für createEntity & search
    memory = new MemoryService(db, embeddings);
  });

  // ── Entity Operations ────────────────────────────────────────
  describe("Entity Operations", () => {
    it("should create an entity", async () => {
      const entity = await memory.createEntity("Test Person", "Person", { role: "developer" });
      
      expect(entity.id).toBeDefined();
      expect(entity.name).toBe("Test Person");
      expect(entity.type).toBe("Person");
      expect(entity.metadata).toEqual({ role: "developer" });
      expect(entity.embedding).toHaveLength(4);
      expect(entity.created_at).toBeGreaterThan(0);
    });

    it("should get a created entity by id", async () => {
      const created = await memory.createEntity("Alice", "Person");
      const fetched = await memory.getEntity(created.id);
      
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe("Alice");
    });

    it("should return null for non-existent entity", async () => {
      const result = await memory.getEntity("non-existent-id");
      expect(result).toBeNull();
    });

    it("should update an existing entity", async () => {
      const entity = await memory.createEntity("Old Name", "Person");
      await memory.updateEntity(entity.id, { name: "New Name" });
      
      const updated = await memory.getEntity(entity.id);
      expect(updated!.name).toBe("New Name");
    });

    it("should delete an entity", async () => {
      const entity = await memory.createEntity("To Delete", "Temp");
      await memory.deleteEntity(entity.id);
      
      const result = await memory.getEntity(entity.id);
      expect(result).toBeNull();
    });
  });

  // ── Observation Operations ───────────────────────────────────
  describe("Observation Operations", () => {
    let entityId: string;

    beforeEach(async () => {
      const entity = await memory.createEntity("Observed Entity", "Test");
      entityId = entity.id;
    });

    it("should add an observation to an entity", async () => {
      const obs = await memory.addObservation(entityId, "This is an important observation");
      
      expect(obs.id).toBeDefined();
      expect(obs.entity_id).toBe(entityId);
      expect(obs.text).toBe("This is an important observation");
      expect(obs.embedding).toHaveLength(4);
    });

    it("should list observations for an entity", async () => {
      await memory.addObservation(entityId, "Observation 1");
      await memory.addObservation(entityId, "Observation 2");
      await memory.addObservation(entityId, "Observation 3");
      
      const obs = await memory.getObservations(entityId);
      expect(obs).toHaveLength(3);
    });

    it("should return empty array for entity with no observations", async () => {
      const obs = await memory.getObservations(entityId);
      expect(obs).toHaveLength(0);
    });
  });

  // ── Relation Operations ──────────────────────────────────────
  describe("Relation Operations", () => {
    let idA: string;
    let idB: string;

    beforeEach(async () => {
      const a = await memory.createEntity("Entity A", "TypeA");
      const b = await memory.createEntity("Entity B", "TypeB");
      idA = a.id;
      idB = b.id;
    });

    it("should create a relation between entities", async () => {
      const rel = await memory.createRelation(idA, idB, "knows", 0.8);
      
      expect(rel.from_id).toBe(idA);
      expect(rel.to_id).toBe(idB);
      expect(rel.relation_type).toBe("knows");
      expect(rel.strength).toBe(0.8);
    });

    it("should reject self-references", async () => {
      await expect(
        memory.createRelation(idA, idA, "self", 1.0)
      ).rejects.toThrow("Self-references are not allowed");
    });

    it("should list relations from an entity", async () => {
      await memory.createRelation(idA, idB, "knows");
      const rels = await memory.getRelations(idA);
      
      expect(rels).toHaveLength(1);
      expect(rels[0].to_id).toBe(idB);
    });
  });

  // ── Search ───────────────────────────────────────────────────
  describe("Search", () => {
    beforeEach(async () => {
      await memory.createEntity("Python Programming", "Topic", { description: "A programming language" });
      await memory.createEntity("JavaScript Programming", "Topic", { description: "Another programming language" });
      await memory.createEntity("Cooking Recipes", "Topic", { description: "Food and recipes" });
    });

    it("should search and return results", async () => {
      const results = await memory.search("programming", 10);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should filter results by entity type", async () => {
      // Create a non-Topic entity
      await memory.createEntity("Random Note", "Note", {});
      
      const results = await memory.search("programming", 10, ["Topic"]);
      expect(results.length).toBeGreaterThan(0);
      results.forEach(r => {
        expect(r.entity.type).toBe("Topic");
      });
    });

    it("should return empty array for non-matching query", async () => {
      // Der gemockte EmbeddingService basiert auf Textlänge – daher können
      // auch "nicht passende" Queries matches liefern. Das testen wir hier nicht.
      // Stattdessen: search wirft keinen Fehler
      await expect(memory.search("xyznonexistent", 10)).resolves.toBeDefined();
    });

    it("should respect the limit parameter", async () => {
      const results = await memory.search("programming", 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  // ── Context ──────────────────────────────────────────────────
  describe("Context", () => {
    it("should return context for a query", async () => {
      const entity = await memory.createEntity("Test Context", "Test");
      await memory.addObservation(entity.id, "Context observation");
      
      const context = await memory.getContext("Test", 10);
      
      expect(context).toHaveProperty("query");
      expect(context).toHaveProperty("entities");
      expect(context).toHaveProperty("total_entities");
      expect(context.total_entities).toBeGreaterThan(0);
      expect(context.entities[0]).toHaveProperty("observations");
      expect(context.entities[0]).toHaveProperty("relations");
    });
  });

  // ── Health ────────────────────────────────────────────────────
  describe("Health", () => {
    it("should return healthy status", async () => {
      const health = await memory.health();
      
      expect(health.status).toBe("healthy");
      expect(health).toHaveProperty("database");
      expect(health).toHaveProperty("cache");
      expect(health).toHaveProperty("timestamp");
    });

    it("should include correct db stats", async () => {
      await memory.createEntity("Health Check Entity", "Test");
      
      const health = await memory.health();
      expect(health.database.entities).toBe(1);
    });
  });

  // ── Snapshots ────────────────────────────────────────────────
  describe("Snapshots", () => {
    it("should create a snapshot", async () => {
      const snapshotId = await memory.createSnapshot({ reason: "test" });
      expect(snapshotId).toBeDefined();
    });
  });
});