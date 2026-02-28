
import { MemoryServer } from "./index";
import { performance } from "perf_hooks";
import path from "path";
import fs from "fs";

const EVAL_DB_PATH = path.join(process.cwd(), "eval_db");

interface EvalTask {
    query: string;
    expectedEntityNames: string[];
    type: "factual" | "multi-hop" | "relational";
}

const EVAL_DATASET: EvalTask[] = [
    {
        query: "Where does Alice live?",
        expectedEntityNames: ["Alice"],
        type: "factual"
    },
    {
        query: "Which technology does CozoDB use?",
        expectedEntityNames: ["Datalog"],
        type: "factual"
    },
    {
        query: "Which technology is used by the project Alice works on?",
        expectedEntityNames: ["Datalog"],
        type: "multi-hop"
    },
    {
        query: "What language is used by the project Bob works on?",
        expectedEntityNames: ["Datalog"],
        type: "multi-hop"
    },
    {
        query: "Who is Bob's colleague?",
        expectedEntityNames: ["Alice"],
        type: "relational"
    },
    {
        query: "What is the background of Bob's coworkers?",
        expectedEntityNames: ["Alice"],
        type: "relational"
    }
];

async function setupEvalData(server: MemoryServer) {
    console.log("• Setting up Evaluation Knowledge Graph...");

    // Create Entities
    const alice = await server.createEntity({ name: "Alice", type: "Person", metadata: { location: "Berlin" } });
    const bob = await server.createEntity({ name: "Bob", type: "Person", metadata: { role: "Developer" } });
    const cozodb = await server.createEntity({ name: "CozoDB", type: "Project", metadata: { category: "Database" } });
    const datalog = await server.createEntity({ name: "Datalog", type: "Technology", metadata: { type: "Logic Language" } });

    const aid = (alice as any).id;
    const bid = (bob as any).id;
    const cid = (cozodb as any).id;
    const did = (datalog as any).id;

    // Add Observations
    await server.addObservation({ entity_id: aid, text: "Alice lives in Berlin and works as a Senior Engineer." });
    await server.addObservation({ entity_id: aid, text: "Alice is a leading expert in CozoDB and recursive queries." });
    await server.addObservation({ entity_id: cid, text: "CozoDB is a powerful graph-vector relational database." });
    await server.addObservation({ entity_id: cid, text: "CozoDB uses Datalog as its primary query language." });
    await server.addObservation({ entity_id: bid, text: "Bob is a software developer focused on backend systems." });
    await server.addObservation({ entity_id: did, text: "Datalog is a declarative logic programming language used for deductive databases." });

    // Create Relations
    await server.createRelation({ from_id: aid, to_id: cid, relation_type: "works_on", strength: 1.0 });
    await server.createRelation({ from_id: bid, to_id: cid, relation_type: "works_on", strength: 1.0 });
    await server.createRelation({ from_id: bid, to_id: aid, relation_type: "colleague_of", strength: 0.9 });
    await server.createRelation({ from_id: cid, to_id: did, relation_type: "uses_tech", strength: 1.0 });

    console.log("  -> Knowledge Graph populated.");
}

function calculateRecall(results: any[], expected: string[], k: number): number {
    const topK = results.slice(0, k);
    const found = expected.filter(name =>
        topK.some(r => (r.name || "").toLowerCase() === name.toLowerCase())
    );
    return found.length / expected.length;
}

function calculateMRR(results: any[], expected: string[]): number {
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (expected.some(name => (r.name || "").toLowerCase() === name.toLowerCase())) {
            return 1 / (i + 1);
        }
    }
    return 0;
}

async function runEvaluation() {
    console.log("==================================================");
    console.log("🚀 Cozo Memory Evaluation Suite");
    console.log("==================================================");

    if (fs.existsSync(EVAL_DB_PATH + ".db")) {
        fs.unlinkSync(EVAL_DB_PATH + ".db");
    }

    const server = new MemoryServer(EVAL_DB_PATH);
    await server.embeddingService.embed("warmup");
    await setupEvalData(server);

    const methods = [
        { name: "Hybrid Search", func: (q: string) => server.hybridSearch.search({ query: q, limit: 10 }) },
        { name: "Graph-RAG", func: (q: string) => server.hybridSearch.graphRag({ query: q, limit: 10, graphConstraints: { maxDepth: 2 } }) },
        { name: "Graph-Walking", func: (q: string) => server.graph_walking({ query: q, limit: 10, max_depth: 3 }) }
    ];

    const summary: any[] = [];

    for (const method of methods) {
        console.log(`\n• Evaluating ${method.name}...`);
        let totalRecall3 = 0;
        let totalRecall10 = 0;
        let totalMRR = 0;
        let totalLatency = 0;

        for (const task of EVAL_DATASET) {
            const t0 = performance.now();
            const results = await method.func(task.query);
            const t1 = performance.now();

            const r3 = calculateRecall(results, task.expectedEntityNames, 3);
            const r10 = calculateRecall(results, task.expectedEntityNames, 10);
            const mrr = calculateMRR(results, task.expectedEntityNames);

            totalRecall3 += r3;
            totalRecall10 += r10;
            totalMRR += mrr;
            totalLatency += (t1 - t0);
        }

        const n = EVAL_DATASET.length;
        summary.push({
            Method: method.name,
            "Recall@3": (totalRecall3 / n).toFixed(3),
            "Recall@10": (totalRecall10 / n).toFixed(3),
            MRR: (totalMRR / n).toFixed(3),
            "Avg Latency": (totalLatency / n).toFixed(2) + "ms"
        });
    }

    console.log("\n==================================================");
    console.log("Final Evaluation Results:");
    console.table(summary);
    console.log("==================================================");

    // Cleanup
    // @ts-ignore
    server.db.close();
    if (fs.existsSync(EVAL_DB_PATH + ".db")) {
        fs.unlinkSync(EVAL_DB_PATH + ".db");
    }
}

runEvaluation().catch(console.error);
