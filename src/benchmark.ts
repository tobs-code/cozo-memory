import { MemoryServer } from "./index";
import { EmbeddingService } from "./embedding-service";
import path from "path";
import fs from "fs";
import { performance } from "perf_hooks";

const BENCHMARK_DB_PATH = path.join(process.cwd(), "benchmark_db");

type OutputFormat = "text" | "json" | "markdown";

interface BenchmarkOptions {
  format: OutputFormat;
  runs: number;
  warmupRuns: number;
  csvPath?: string;
  enableRerank: boolean;
}

function parseArgs(): BenchmarkOptions {
  const args = process.argv.slice(2);
  const opts: BenchmarkOptions = {
    format: (process.env.BENCH_FORMAT as OutputFormat) || "text",
    runs: parseInt(process.env.BENCH_RUNS || "5", 10),
    warmupRuns: parseInt(process.env.BENCH_WARMUP || "2", 10),
    enableRerank: (process.env.BENCH_ENABLE_RERANK || "false").toLowerCase() !== "false",
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--format" && args[i + 1]) opts.format = args[++i] as OutputFormat;
    else if (a === "--runs" && args[i + 1]) opts.runs = Math.max(1, parseInt(args[++i], 10));
    else if (a === "--warmup" && args[i + 1]) opts.warmupRuns = Math.max(0, parseInt(args[++i], 10));
    else if (a === "--csv" && args[i + 1]) opts.csvPath = args[++i];
    else if (a === "--enable-rerank") opts.enableRerank = true;
    else if (a === "--no-rerank") opts.enableRerank = false;
  }

  if (!["text", "json", "markdown"].includes(opts.format)) {
    opts.format = "text";
  }
  return opts;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * p;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return percentile(sorted, 0.5);
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const v = values.reduce((s, x) => s + (x - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

function formatNum(n: number, digits = 2): string {
  return n.toFixed(digits);
}

interface RecallResult {
  method: string;
  recallAt10: number;
  recallAt3: number;
  mrr: number;
  ndcgAt10: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
}

interface IngestionResult {
  totalMs: number;
  avgPerOpMs: number;
  throughputOpsPerSec: number;
}

interface MemoryResult {
  rssAfterInitMB: number;
  rssAfterDataMB: number;
  rssFinalMB: number;
  heapUsedFinalMB: number;
}

interface BenchmarkSummary {
  environment: {
    nodeVersion: string;
    platform: string;
    timestamp: string;
    embeddingModel: string;
    dbEngine: string;
  };
  warmup: {
    initMs: number;
    firstEmbeddingMs: number;
  };
  ingestion: IngestionResult;
  memory: MemoryResult;
  queries: {
    rawVectorMs: { avg: number; p50: number; p95: number };
    hybrid: { avg: number; p50: number; p95: number };
    reranked: { avg: number; p50: number; p95: number };
    graphRag: { avg: number; p50: number; p95: number };
    graphWalking: { avg: number; p50: number; p95: number };
  };
  recall: RecallResult[];
}

async function time<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = performance.now();
  const result = await fn();
  const t1 = performance.now();
  return { result, ms: t1 - t0 };
}

async function warmupServer(server: MemoryServer, times = 2): Promise<number> {
  const durations: number[] = [];
  for (let i = 0; i < times; i++) {
    const { ms } = await time(async () => {
      await server.hybridSearch.search({ query: "warmup benchmark", limit: 5, includeEntities: true, includeObservations: true });
      await server.hybridSearch.graphRag({ query: "warmup", limit: 5, graphConstraints: { maxDepth: 1 } });
    });
    durations.push(ms);
  }
  return durations.length ? mean(durations) : 0;
}

function computeNDCG(results: any[], expectedNames: string[], k: number): number {
  const topK = results.slice(0, k);
  const relevances: number[] = topK.map((r: any) => {
    const name = (r.name || "").toLowerCase();
    return expectedNames.some(e => e.toLowerCase() === name) ? 1 : 0;
  });

  const ideal = expectedNames.slice(0, k).map(() => 1);
  const dcg = relevances.reduce((sum, rel, idx) => sum + rel / Math.log2(idx + 2), 0);
  const idealDcg = ideal.reduce((sum, rel, idx) => sum + rel / Math.log2(idx + 2), 0);
  return idealDcg === 0 ? 0 : dcg / idealDcg;
}

function computeRecall(results: any[], expectedNames: string[], k: number): number {
  const topK = results.slice(0, k);
  const found = expectedNames.filter(name =>
    topK.some(r => (r.name || "").toLowerCase() === name.toLowerCase())
  );
  return expectedNames.length ? found.length / expectedNames.length : 0;
}

function computeMRR(results: any[], expectedNames: string[]): number {
  for (let i = 0; i < results.length; i++) {
    const name = (results[i].name || "").toLowerCase();
    if (expectedNames.some(e => e.toLowerCase() === name)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

async function seedData(server: MemoryServer) {
  const entities: any[] = [];
  const addEntity = async (name: string, type: string, metadata: any): Promise<any> => {
    const entity: any = await server.createEntity({ name, type, metadata });
    entities.push(entity);
    return entity;
  };

  const acme = await addEntity("Acme Corp", "Organization", {});
  const openai = await addEntity("OpenAI", "Organization", {});
  const google = await addEntity("Google", "Organization", {});
  const samOpenAI = await addEntity("Sam Altman", "Person", {});
  const samAcme = await addEntity("Sam Brown", "Person", {});
  const aliceGoogle = await addEntity("Alice Chen", "Person", {});
  const aliceAcme = await addEntity("Alice Walker", "Person", {});
  const bobEngineer = await addEntity("Bob Martinez", "Person", {});
  const projectX = await addEntity("Project X", "Project", {});
  const projectY = await addEntity("Project Y", "Project", {});
  const datalog = await addEntity("Datalog", "Technology", {});
  const python = await addEntity("Python", "Technology", {});
  const rust = await addEntity("Rust", "Technology", {});
  const oldInitiative = await addEntity("Legacy Initiative", "Project", {});
  const newInitiative = await addEntity("Cloud Initiative", "Project", {});

  const obs = async (entityId: string, text: string, metadata?: any) => server.addObservation({ entity_id: entityId, text, metadata });
  const rel = async (fromId: string, toId: string, relationType: string, strength = 0.9) => server.createRelation({ from_id: fromId, to_id: toId, relation_type: relationType, strength });

  await obs(samOpenAI.id, "Sam Altman is the CEO of OpenAI since 2019.", { year: 2019 });
  await obs(samOpenAI.id, "Sam Altman briefly joined Acme Corp as advisor in 2023.", { year: 2023 });
  await obs(samOpenAI.id, "Sam Altman returned to OpenAI full-time in late 2023.", { year: 2023 });

  await obs(samAcme.id, "Sam Brown is the CFO of Acme Corp since 2021.", { year: 2021 });

  await obs(aliceGoogle.id, "Alice Chen works at Google on search ranking.", { year: 2022 });
  await obs(aliceGoogle.id, "Alice Chen moved to Acme Corp as VP Engineering in 2024.", { year: 2024 });

  await obs(aliceAcme.id, "Alice Walker is a product manager at Acme Corp.", { year: 2020 });

  await obs(bobEngineer.id, "Bob Martinez is a senior engineer on Project X.", { year: 2022 });
  await obs(bobEngineer.id, "Bob Martinez switched from Python to Rust in 2024.", { year: 2024 });

  await obs(projectX.id, "Project X is Acme Corp's internal search engine.", { year: 2021 });
  await obs(projectX.id, "Project X is being rewritten in Rust.", { year: 2024 });

  await obs(projectY.id, "Project Y is Acme Corp's data lake.", { year: 2022 });
  await obs(projectY.id, "Project Y was paused in 2024.", { year: 2024 });

  await obs(acme.id, "Acme Corp acquired a Datalog startup in 2022.", { year: 2022 });
  await obs(acme.id, "Acme Corp is headquartered in Berlin.", { year: 2020 });

  await obs(datalog.id, "Datalog is used inside Project X for policy rules.", { year: 2023 });
  await obs(datalog.id, "Datalog was replaced by SQL in Project Y.", { year: 2024 });

  await obs(oldInitiative.id, "Legacy Initiative was cancelled in 2023.", { year: 2023 });
  await obs(newInitiative.id, "Cloud Initiative started in 2024.", { year: 2024 });

  await rel(samOpenAI.id, openai.id, "works_at", 0.95);
  await rel(samOpenAI.id, acme.id, "advised", 0.7);
  await rel(samAcme.id, acme.id, "works_at", 0.95);
  await rel(aliceGoogle.id, google.id, "works_at", 0.9);
  await rel(aliceGoogle.id, acme.id, "works_at", 0.95);
  await rel(aliceAcme.id, acme.id, "works_at", 0.95);
  await rel(bobEngineer.id, projectX.id, "works_on", 0.95);
  await rel(bobEngineer.id, projectY.id, "works_on", 0.4);
  await rel(projectX.id, datalog.id, "uses_tech", 0.9);
  await rel(projectX.id, rust.id, "uses_tech", 0.85);
  await rel(projectY.id, python.id, "uses_tech", 0.8);
  await rel(acme.id, oldInitiative.id, "owns", 0.7);
  await rel(acme.id, newInitiative.id, "owns", 0.9);

  const distractors: string[] = [];
  for (let i = 0; i < 220; i++) {
    distractors.push(`Background note ${i}: noise about ${i % 5 === 0 ? 'Paris' : i % 5 === 1 ? 'Tokyo' : i % 5 === 2 ? 'finance' : i % 5 === 3 ? 'marketing' : 'logistics'} seed ${i}.`);
  }
  for (let i = 0; i < distractors.length; i++) {
    const target = entities[i % entities.length];
    await server.addObservation({ entity_id: target.id, text: distractors[i] });
  }

  return { entities, NUM_ENTITIES: entities.length, NUM_OBSERVATIONS: 265, NUM_RELATIONS: 14 };
}

async function measureRecall(server: MemoryServer, runs: number, warmupRuns: number, opts: BenchmarkOptions): Promise<RecallResult[]> {
  const tasks: { query: string; expected: string[]; type: string }[] = [
    { query: "Who works at OpenAI?", expected: ["Sam Altman", "OpenAI"], type: "factual" },
    { query: "Current CEO of OpenAI", expected: ["Sam Altman"], type: "factual" },
    { query: "Alice engineering manager Acme", expected: ["Alice Walker", "Alice Chen"], type: "ambiguous" },
    { query: "Who is Bob's colleague on the search engine project?", expected: ["Project X"], type: "relational" },
    { query: "Project using Datalog and Rust", expected: ["Project X"], type: "multi-hop" },
    { query: "Technology switched by Bob in 2024", expected: ["Rust", "Python"], type: "temporal" },
    { query: "Current Acme active initiative 2024", expected: ["Cloud Initiative"], type: "temporal" },
    { query: "Acme acquisition technology 2022", expected: ["Datalog"], type: "multi-hop" },
    { query: "Sam Altman Acme advisor", expected: ["Sam Altman", "Acme Corp"], type: "relational" },
    { query: "Person VP Engineering Acme 2024", expected: ["Alice Chen", "Alice Walker"], type: "temporal" },
  ];

  const methods = [
    { name: "Hybrid Search", fn: (q: string) => server.hybridSearch.search({ query: q, limit: 10, includeEntities: true, includeObservations: true }) },
    { name: "Graph-RAG", fn: (q: string) => server.hybridSearch.graphRag({ query: q, limit: 10, graphConstraints: { maxDepth: 2 } }) },
    { name: "Graph-Walking", fn: (q: string) => server.graph_walking({ query: q, limit: 10, max_depth: 3 }) },
    ...(opts.enableRerank ? [
      { name: "Reranked Search", fn: (q: string) => server.hybridSearch.search({ query: q, limit: 10, rerank: true, includeEntities: true, includeObservations: true }) },
      { name: "Graph-RAG (Reranked)", fn: (q: string) => server.hybridSearch.graphRag({ query: q, limit: 10, graphConstraints: { maxDepth: 2 }, rerank: true }) },
    ] : []),
  ];

  const results: RecallResult[] = [];

  for (const method of methods) {
    const allRunsRecall10: number[] = [];
    const allRunsRecall3: number[] = [];
    const allRunsMRR: number[] = [];
    const allRunsNDCG10: number[] = [];
    const allRunsLatency: number[] = [];

    for (let r = 0; r < warmupRuns + runs; r++) {
      await server.hybridSearch.clearCache();
      let r10 = 0, r3 = 0, mrr = 0, ndcg = 0, lat = 0;
      for (const task of tasks) {
        const { result, ms } = await time(() => method.fn(task.query));
        r10 += computeRecall(result, task.expected, 10);
        r3 += computeRecall(result, task.expected, 3);
        mrr += computeMRR(result, task.expected);
        ndcg += computeNDCG(result, task.expected, 10);
        lat += ms;
      }
      const n = tasks.length;
      if (r >= warmupRuns) {
        allRunsRecall10.push(r10 / n);
        allRunsRecall3.push(r3 / n);
        allRunsMRR.push(mrr / n);
        allRunsNDCG10.push(ndcg / n);
        allRunsLatency.push(lat / n);
      }
    }

    results.push({
      method: method.name,
      recallAt10: mean(allRunsRecall10),
      recallAt3: mean(allRunsRecall3),
      mrr: mean(allRunsMRR),
      ndcgAt10: mean(allRunsNDCG10),
      avgLatencyMs: mean(allRunsLatency),
      p50LatencyMs: median(allRunsLatency),
      p95LatencyMs: percentile(allRunsLatency.slice().sort((a, b) => a - b), 0.95),
    });
  }

  return results;
}

async function runBenchmark(opts: BenchmarkOptions) {
  console.log(`🚀 Starting Performance Benchmark (runs=${opts.runs}, warmup=${opts.warmupRuns}, format=${opts.format})`);

  if (fs.existsSync(BENCHMARK_DB_PATH + ".db")) {
    fs.unlinkSync(BENCHMARK_DB_PATH + ".db");
  }

  const memStart = process.memoryUsage();
  const envStart = performance.now();

  console.log("• Initializing Server & Loading Embedding Model...");
  const server = new MemoryServer(BENCHMARK_DB_PATH);
  await server.initPromise;
  const embedWarmupStart = performance.now();
  await server.embeddingService.embed("benchmark-warmup");
  const embedWarmupEnd = performance.now();
  const initMs = embedWarmupEnd - envStart;
  const firstEmbeddingMs = embedWarmupEnd - embedWarmupStart;

  console.log(`  -> Init + Warmup: ${formatNum(initMs)}ms`);
  console.log(`  -> First embedding: ${formatNum(firstEmbeddingMs)}ms`);

  const memAfterInit = process.memoryUsage();

  console.log(`\n• Seeding Data...`);
  const seedStart = performance.now();
  const { entities, NUM_ENTITIES, NUM_OBSERVATIONS, NUM_RELATIONS } = await seedData(server);
  const seedEnd = performance.now();
  const totalOps = NUM_ENTITIES + NUM_OBSERVATIONS + NUM_RELATIONS;
  const ingestionTotalMs = seedEnd - seedStart;
  const ingestionAvgMs = ingestionTotalMs / totalOps;

  console.log(`  -> Data Ingestion: ${formatNum(ingestionTotalMs)}ms (${formatNum(ingestionAvgMs)} ms/op)`);

  const memAfterData = process.memoryUsage();

  await warmupServer(server, opts.warmupRuns);

  console.log("\n• Running Query Benchmarks...");
  const queries = [
    "observation number 10",
    "alpha beta gamma",
    `Entity_${NUM_ENTITIES - 1}`,
    "Project related",
    "delta observation keywords",
    "colleague technology",
    "Bob Alice relation",
    "works on project",
    "Senior Engineer Berlin",
    "graph traversal seed",
  ];

  const runs: {
    hybrid: number[];
    reranked: number[];
    graphRag: number[];
    graphWalking: number[];
    rawVector: number[];
  } = { hybrid: [], reranked: [], graphRag: [], graphWalking: [], rawVector: [] };

  for (let r = 0; r < opts.runs; r++) {
    await server.hybridSearch.clearCache();

    for (const q of queries) {
      const hybridMs = (await time(() => server.hybridSearch.search({
        query: q,
        limit: 10,
        includeEntities: true,
        includeObservations: true,
      }))).ms;
      runs.hybrid.push(hybridMs);

      if (opts.enableRerank) {
        const rerankedMs = (await time(() => server.hybridSearch.search({
          query: q,
          limit: 10,
          rerank: true,
          includeEntities: true,
          includeObservations: true,
        }))).ms;
        runs.reranked.push(rerankedMs);
      }

      const graphRagMs = (await time(() => server.hybridSearch.graphRag({
        query: q,
        limit: 10,
        graphConstraints: { maxDepth: 2 },
      }))).ms;
      runs.graphRag.push(graphRagMs);

      const startEntityId = entities[r % entities.length].id;
      const walkMs = (await time(() => server.graph_walking({
        query: q,
        start_entity_id: startEntityId,
        max_depth: 3,
        limit: 10,
      }))).ms;
      runs.graphWalking.push(walkMs);
    }

    const qEmb = await server.embeddingService.embed("benchmark-vector-baseline");
    const vectorMs = (await time(() => server.db.run(
      `?[id, score] := ~entity:semantic { id | query: vec($qEmb), k: 10, ef: 20 }, score = 1.0`,
      { qEmb }
    ))).ms;
    runs.rawVector.push(vectorMs);
  }

  console.log("\n• Running Recall Evaluation...");
  const recall = await measureRecall(server, opts.runs, opts.warmupRuns, opts);

  const memFinal = process.memoryUsage();
  console.log(`\n• Final Memory Stats:`);
  console.log(`  -> RSS Init: ${formatNum(memAfterInit.rss / 1024 / 1024)} MB`);
  console.log(`  -> RSS After Data: ${formatNum(memAfterData.rss / 1024 / 1024)} MB`);
  console.log(`  -> RSS Final: ${formatNum(memFinal.rss / 1024 / 1024)} MB`);
  console.log(`  -> Heap Used Final: ${formatNum(memFinal.heapUsed / 1024 / 1024)} MB`);

  const summary: BenchmarkSummary = {
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      timestamp: new Date().toISOString(),
      embeddingModel: process.env.EMBEDDING_MODEL || "Xenova/bge-m3",
      dbEngine: process.env.DB_ENGINE || "sqlite",
    },
    warmup: {
      initMs,
      firstEmbeddingMs,
    },
    ingestion: {
      totalMs: ingestionTotalMs,
      avgPerOpMs: ingestionAvgMs,
      throughputOpsPerSec: 1000 / ingestionAvgMs,
    },
    memory: {
      rssAfterInitMB: memAfterInit.rss / 1024 / 1024,
      rssAfterDataMB: memAfterData.rss / 1024 / 1024,
      rssFinalMB: memFinal.rss / 1024 / 1024,
      heapUsedFinalMB: memFinal.heapUsed / 1024 / 1024,
    },
    queries: {
      rawVectorMs: { avg: mean(runs.rawVector), p50: median(runs.rawVector), p95: percentile(runs.rawVector.slice().sort((a, b) => a - b), 0.95) },
      hybrid: { avg: mean(runs.hybrid), p50: median(runs.hybrid), p95: percentile(runs.hybrid.slice().sort((a, b) => a - b), 0.95) },
      reranked: { avg: mean(runs.reranked), p50: median(runs.reranked), p95: percentile(runs.reranked.slice().sort((a, b) => a - b), 0.95) },
      graphRag: { avg: mean(runs.graphRag), p50: median(runs.graphRag), p95: percentile(runs.graphRag.slice().sort((a, b) => a - b), 0.95) },
      graphWalking: { avg: mean(runs.graphWalking), p50: median(runs.graphWalking), p95: percentile(runs.graphWalking.slice().sort((a, b) => a - b), 0.95) },
    },
    recall,
  };

  const output = renderSummary(summary, opts);
  if (opts.format === "json") {
    console.log(JSON.stringify(summary, null, 2));
  } else if (opts.format === "markdown") {
    console.log(output);
  } else {
    console.log(output);
  }

  if (opts.csvPath && recall.length) {
    const header = ["method", "recall_at_10", "recall_at_3", "mrr", "ndcg_at_10", "avg_latency_ms", "p50_latency_ms", "p95_latency_ms"];
    const rows = recall.map(r => [r.method, r.recallAt10.toFixed(4), r.recallAt3.toFixed(4), r.mrr.toFixed(4), r.ndcgAt10.toFixed(4), r.avgLatencyMs.toFixed(2), r.p50LatencyMs.toFixed(2), r.p95LatencyMs.toFixed(2)]);
    const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    fs.writeFileSync(opts.csvPath, csv);
    console.log(`\n• CSV written to: ${opts.csvPath}`);
  }

  server.db.close();
  if (fs.existsSync(BENCHMARK_DB_PATH + ".db")) {
    fs.unlinkSync(BENCHMARK_DB_PATH + ".db");
  }
}

function renderSummary(s: BenchmarkSummary, opts: BenchmarkOptions): string {
  const lines: string[] = [];

  lines.push("==================================================");
  lines.push("CozoDB Memory Benchmark Results");
  lines.push("==================================================");
  lines.push(`Environment: ${s.environment.nodeVersion} on ${s.environment.platform}`);
  lines.push(`Timestamp:   ${s.environment.timestamp}`);
  lines.push(`Embedding:   ${s.environment.embeddingModel}`);
  lines.push(`DB Engine:   ${s.environment.dbEngine}`);
  lines.push(`Runs:        ${opts.runs}  Warmup: ${opts.warmupRuns}`);
  lines.push("");

  lines.push("## Warmup");
  lines.push(`- Init + Warmup:          ${formatNum(s.warmup.initMs)} ms`);
  lines.push(`- First embedding:       ${formatNum(s.warmup.firstEmbeddingMs)} ms`);
  lines.push("");

  lines.push("## Ingestion");
  lines.push(`- Total ingestion:       ${formatNum(s.ingestion.totalMs)} ms`);
  lines.push(`- Avg per operation:     ${formatNum(s.ingestion.avgPerOpMs)} ms`);
  lines.push(`- Throughput:            ${formatNum(s.ingestion.throughputOpsPerSec)} ops/sec`);
  lines.push("");

  lines.push("## Memory");
  lines.push(`- RSS after init:        ${formatNum(s.memory.rssAfterInitMB)} MB`);
  lines.push(`- RSS after data load:   ${formatNum(s.memory.rssAfterDataMB)} MB`);
  lines.push(`- RSS final:             ${formatNum(s.memory.rssFinalMB)} MB`);
  lines.push(`- Heap used final:       ${formatNum(s.memory.heapUsedFinalMB)} MB`);
  lines.push("");

  lines.push("## Query Latency (ms)");
  lines.push("| Method           | Avg      | P50      | P95      |");
  lines.push("|------------------|----------|----------|----------|");
  lines.push(`| Raw Vector       | ${formatNum(s.queries.rawVectorMs.avg,2).padEnd(8)} | ${formatNum(s.queries.rawVectorMs.p50,2).padEnd(8)} | ${formatNum(s.queries.rawVectorMs.p95,2).padEnd(8)} |`);
  lines.push(`| Hybrid Search    | ${formatNum(s.queries.hybrid.avg,2).padEnd(8)} | ${formatNum(s.queries.hybrid.p50,2).padEnd(8)} | ${formatNum(s.queries.hybrid.p95,2).padEnd(8)} |`);
  if (opts.enableRerank) {
    lines.push(`| Reranked Search  | ${formatNum(s.queries.reranked.avg,2).padEnd(8)} | ${formatNum(s.queries.reranked.p50,2).padEnd(8)} | ${formatNum(s.queries.reranked.p95,2).padEnd(8)} |`);
  }
  lines.push(`| Graph-RAG        | ${formatNum(s.queries.graphRag.avg,2).padEnd(8)} | ${formatNum(s.queries.graphRag.p50,2).padEnd(8)} | ${formatNum(s.queries.graphRag.p95,2).padEnd(8)} |`);
  lines.push(`| Graph-Walking    | ${formatNum(s.queries.graphWalking.avg,2).padEnd(8)} | ${formatNum(s.queries.graphWalking.p50,2).padEnd(8)} | ${formatNum(s.queries.graphWalking.p95,2).padEnd(8)} |`);
  lines.push("");

  lines.push(`## Recall & Quality (Mean across ${opts.runs} runs)`);
  lines.push("| Method                | Recall@10 | Recall@3 | MRR   | nDCG@10 | Avg Latency | P50 Latency | P95 Latency |");
  lines.push("|-----------------------|-----------|----------|-------|---------|-------------|-------------|-------------|");
  for (const r of s.recall) {
    lines.push(`| ${r.method.padEnd(21)} | ${r.recallAt10.toFixed(3).padStart(9)} | ${r.recallAt3.toFixed(3).padStart(8)} | ${r.mrr.toFixed(3).padStart(5)} | ${r.ndcgAt10.toFixed(3).padStart(7)} | ${formatNum(r.avgLatencyMs,2).padStart(11)} | ${formatNum(r.p50LatencyMs,2).padStart(11)} | ${formatNum(r.p95LatencyMs,2).padStart(11)} |`);
  }
  lines.push("");
  lines.push("## Benchmarking external systems");
  lines.push("Recall/Quality numbers for Chroma, Qdrant, Mem0 are not generated by this script.");
  lines.push("Fill the comparison table in docs/BENCHMARKS.md only from published/public benchmarks.");
  lines.push("Do not insert internal estimates into the publication table.");
  lines.push("");
  lines.push("==================================================");

  return lines.join("\n");
}

const opts = parseArgs();
runBenchmark(opts).catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
