# SOTA Memory Server Research – Neue Feature-Ideen für Cozo-Memory (März 2026)

Basierend auf der aktuellen Forschung zu Mem0, Zep/Graphiti, Letta/MemFS, Microsoft GraphRAG, und aktuellen Papers (2025/2026).

> [!NOTE]
> Features, die cozo-memory **bereits hat**, sind mit ✅ markiert. Neue Ideen mit 🆕.

---

## Übersicht: Was cozo-memory schon hat vs. SOTA

| Feature | Cozo-Memory | Mem0 | Zep/Graphiti | Letta/MemFS |
|:--------|:-----------:|:----:|:------------:|:-----------:|
| Hybrid Search (Vector+Keyword+Graph) | ✅ | ✅ | ✅ | ❌ |
| Graph-RAG / Multi-Hop Reasoning | ✅ | ✅ (Graph) | ✅ (Temporal KG) | ❌ |
| Community Summaries (Hierarchical) | ✅ | ❌ | ❌ | ❌ |
| Agentic Auto-Routing | ✅ | ❌ | ❌ | ❌ |
| Self-Improving Memory (Reflect) | ✅ | ❌ | ❌ | ❌ |
| Cross-Encoder Reranking | ✅ | ❌ | ✅ | ❌ |
| Time-Travel (Validity) | ✅ | ❌ | ✅ (valid_at) | ❌ |
| Session/Task Context | ✅ | ✅ | ❌ | ✅ |
| User Profile Boost | ✅ | ✅ | ✅ | ❌ |
| **Fact Lifecycle (valid_at/invalid_at)** | ❌ | ❌ | ✅ | ❌ |
| **Episodic Memory (Experience-Based)** | ❌ | ❌ | ✅ | ✅ |
| **Context Compaction** | ❌ | ❌ | ❌ | ✅ |
| **Memory Versioning (Git-Style)** | ❌ | ❌ | ❌ | ✅ |
| **Memory Defragmentation** | ❌ | ❌ | ❌ | ✅ |
| **Multi-Agent Shared Memory** | ❌ | ✅ | ❌ | ✅ |
| **Conversation Auto-Extraction** | ❌ | ✅ | ✅ | ❌ |
| **Framework Adapters** | ❌ | ✅ | ✅ | ✅ |

---

## 🆕 Neue Feature-Ideen (priorisiert nach Impact)

### 1. Fact Lifecycle Management (`valid_at` / `invalid_at`)
**Inspiration:** Zep/Graphiti
**Impact:** ⭐⭐⭐⭐⭐ | **Aufwand:** Mittel

# FERTIG
Cozo-Memory hat bereits `Validity` für Time-Travel. Was fehlt, ist ein **explizites Fact-Lifecycle-Modell**:
- Jede Observation / Relation bekommt `valid_at` (wann ist der Fakt gültig geworden?) und `invalid_at` (wann wurde er ungültig?)
- Bei widersprüchlichen Informationen: Alten Fakt automatisch invalidieren, neuen anlegen
- Queries können nach "aktuellem Stand" filtern (`WHERE invalid_at IS NULL`)

**Warum perfekt für Cozo?** CozoDB hat `Validity` schon nativ – der Leap zu echtem Fact-Lifecycle ist minimal. Das wäre ein **massiver USP** gegenüber Mem0 (das gar keinen Fact-Lifecycle hat).

```
Vorher: "Alice arbeitet bei Firma X" (Observation, created_at: 2025)
Update: "Alice arbeitet jetzt bei Firma Y"
Nachher: 
  - Observation 1: valid_at=2025, invalid_at=2026 (automatisch invalidiert)
  - Observation 2: valid_at=2026, invalid_at=NULL (aktuell gültig)
```

---

### 2. Context Compaction & Auto-Summarization
**Inspiration:** Letta/MemGPT, Anthropic Context Engineering
**Impact:** ⭐⭐⭐⭐⭐ | **Aufwand:** Mittel

Ein neuer `compact` Action für `manage_system`:
- **Session-Kompaktierung:** Am Ende einer Session werden alle Observations automatisch zu 2-3 Bullet Points zusammengefasst (via Ollama)
- **Entity-Kompaktierung:** Wenn eine Entity >N Observations hat, werden ältere automatisch in ein Executive Summary verdichtet
- **Progressive Summarization:** Neue Infos werden mit bestehenden Summaries gemergt statt append-only

**Unterschied zum bestehenden Janitor:** Der Janitor bereinigt nur auf expliziten `cleanup`-Aufruf. Compaction sollte **automatisch** beim Session-Ende oder bei Überschreitung eines Schwellwerts passieren.

---

### 3. Episodic Memory Layer
**Inspiration:** Research Papers 2025, Generative Semantic Workspaces
**Impact:** ⭐⭐⭐⭐ | **Aufwand:** Hoch

Unterscheidung zwischen zwei Memory-Typen:
- **Semantic Memory** (was cozo schon hat): Fakten, Entitäten, Beziehungen
- **Episodic Memory** (NEU): Konkrete Erfahrungen/Events mit temporalem Kontext

```typescript
// Neuer Entity-Type: "Episode"
{
  type: "Episode",
  metadata: {
    session_id: "...",
    outcome: "success" | "failure",
    tools_used: ["search", "create_entity"],
    lesson_learned: "User bevorzugt kurze Antworten",
    decay_factor: 0.95  // Vergessenskurve
  }
}
```

Features:
- **Erfahrungsbasiertes Lernen:** Agent merkt sich was funktioniert hat und was nicht
- **Forgetting Curve:** Episodische Erinnerungen verblassen über Zeit (exponentieller Decay)
- **Pattern Recognition:** "Jedes Mal wenn User X fragt, will er Format Y"

---

### 4. Memory Defragmentation (`defrag`)
**Inspiration:** Letta MemFS
**Impact:** ⭐⭐⭐⭐ | **Aufwand:** Mittel

Ein `defrag` Action der:
- Doppelte/redundante Observations erkennt und merged
- Fragmentierte Wissensinseln (Connected Components mit nur 1-2 Nodes) mit Hauptgraph verbindet
- Verwaiste Entities ohne Observations oder Relations aufräumt
- **Statistiken liefert:** "12 Duplikate gemergt, 3 Waisen entfernt, 2 Inseln verbunden"

**Unterschied zum Janitor:** Der Janitor summarisiert alte Daten. Defrag reorganisiert die **Struktur** des Graphen.

---

### 5. Conversation Auto-Extraction
**Inspiration:** Mem0, Zep/Graphiti
**Impact:** ⭐⭐⭐⭐ | **Aufwand:** Hoch

Ein neuer `ingest_conversation` Action:
- Nimmt eine rohe Conversation (Array von `{role, content}` Messages)
- Extrahiert automatisch via LLM:
  - Entities (Personen, Projekte, Technologien)
  - Relationships (wer arbeitet woran)
  - Fakten/Observations
  - User-Präferenzen → `global_user_profile`
- **Async Processing:** Conversation wird im Hintergrund verarbeitet

```json
{
  "action": "ingest_conversation",
  "messages": [
    {"role": "user", "content": "Kannst du mir bei meinem React-Projekt helfen?"},
    {"role": "assistant", "content": "Klar! Nutzt du TypeScript?"},
    {"role": "user", "content": "Ja, mit Next.js 14"}
  ]
}
// Extrahiert automatisch:
// Entity: "User's React Project" (type: Project)
// Observation: "Nutzt TypeScript mit Next.js 14"
// User Profile: "Bevorzugt React + TypeScript + Next.js"
```

---

### 6. Multi-Agent Shared Memory
**Inspiration:** Mem0, Letta, CrewAI
**Impact:** ⭐⭐⭐ | **Aufwand:** Mittel

Erweiterung der bestehenden Session/Task-Architektur:
- **Agent-Scoped Memory:** Jeder Agent hat seinen eigenen Namespace
- **Shared Memory Space:** Explizite "Shared" Entities die alle Agents lesen/schreiben können
- **Handover Protocol:** Agent A kann relevanten Kontext an Agent B übergeben

```json
{
  "action": "create_entity",
  "name": "Shared Context",
  "type": "SharedMemory",
  "metadata": {
    "agent_scope": "shared",  // vs "agent_1", "agent_2"
    "accessible_by": ["agent_1", "agent_2", "agent_3"]
  }
}
```

---

### 7. Memory Snapshots mit Diff-Visualisierung
**Inspiration:** Letta MemFS (Git-Style)
**Impact:** ⭐⭐⭐ | **Aufwand:** Gering

Cozo hat bereits `snapshot_create` und `snapshot_diff`. Erweiterungen:
- **Auto-Snapshots:** Automatisches Snapshot beim Session-Ende
- **Diff-Visualisierung:** Mermaid-Graph der zeigt was sich zwischen zwei Snapshots verändert hat
- **Rollback:** `snapshot_restore` um zu einem früheren Zustand zurückzukehren
- **Branching:** Experimentelle "Was-wäre-wenn" Branches

---

### 8. Adaptive Retrieval Strategies (Query-Intent-Aware)
**Inspiration:** Aktuelle RAG-Forschung, ReMindRAG
**Impact:** ⭐⭐⭐ | **Aufwand:** Gering

Erweiterung des bestehenden [agentic_search](file:///C:/Users/tobs/.cursor/workspace/cozo-memory/src/tui.py#438-454):
- **Confidence Score:** Wie sicher ist sich das Routing? Bei niedriger Confidence → Hybrid/Fallback
- **Query Decomposition:** Komplexe Queries automatisch in Sub-Queries zerlegen
- **Cascading Retrieval:** Erst schneller Cache → dann Vector → dann Graph-Walk → dann Community
- **Memory Replay (ReMindRAG-Style):** Bei Graph-Traversal vergangene erfolgreiche Pfade bevorzugen

---

### 9. Framework Adapters (LangChain / LlamaIndex / CrewAI)
**Inspiration:** Alle großen Player
**Impact:** ⭐⭐⭐⭐⭐ | **Aufwand:** Mittel

Separate npm-Packages:
- `cozo-memory-langchain` – LangChain/LangGraph Memory Integration
- `cozo-memory-llamaindex` – LlamaIndex Storage Integration
- `cozo-memory-crewai` – CrewAI Memory Backend

Das ist **überlebenswichtig für Adoption**. Ohne Adapter in den populären Frameworks bleibt cozo-memory ein Nischenprodukt.

---

## Empfohlene Roadmap (Quick Wins zuerst)

| Prio | Feature | Aufwand | Impact | Abhängigkeit |
|:----:|:--------|:-------:|:------:|:------------:|
| 🥇 | Fact Lifecycle (valid_at/invalid_at) | Mittel | ⭐⭐⭐⭐⭐ | CozoDB Validity (vorhanden) |
| 🥈 | Context Compaction | Mittel | ⭐⭐⭐⭐⭐ | Ollama (vorhanden) |
| 🥉 | Memory Defragmentation | Mittel | ⭐⭐⭐⭐ | Graph-Algorithmen (vorhanden) |
| 4 | Conversation Auto-Extraction | Hoch | ⭐⭐⭐⭐ | Ollama (vorhanden) |
| 5 | Episodic Memory Layer | Hoch | ⭐⭐⭐⭐ | Session/Task (vorhanden) |
| 6 | Framework Adapters | Mittel | ⭐⭐⭐⭐⭐ | Separates Repo |
| 7 | Auto-Snapshots + Rollback | Gering | ⭐⭐⭐ | Snapshots (vorhanden) |
| 8 | Multi-Agent Shared Memory | Mittel | ⭐⭐⭐ | Sessions (vorhanden) |
| 9 | Adaptive Retrieval (Cascading) | Gering | ⭐⭐⭐ | Agentic Search (vorhanden) |

> [!TIP]
> **Biggest Quick Win:** Fact Lifecycle! CozoDB's `Validity` ist perfekt dafür designed. Cozo-Memory wäre damit eines der wenigen Open-Source-Projekte mit echtem temporalem Fakten-Management – ein Feature das selbst Mem0 nicht hat.
