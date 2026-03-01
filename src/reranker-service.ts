import { env, AutoTokenizer, pipeline } from "@xenova/transformers";
import * as path from 'path';
import * as fs from 'fs';

// Robust path to project root
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.resolve(PROJECT_ROOT, '.cache');
env.cacheDir = CACHE_DIR;
env.allowLocalModels = true;

export interface RerankResult {
    index: number;
    score: number;
}

export class RerankerService {
    private pipe: any = null;
    private readonly modelId: string;
    private initialized: boolean = false;

    constructor() {
        // Using a tiny but effective cross-encoder
        this.modelId = process.env.RERANKER_MODEL || "Xenova/ms-marco-MiniLM-L-6-v2";
        console.error(`[RerankerService] Using model: ${this.modelId}`);
    }

    private async init() {
        if (this.initialized) return;

        try {
            // Check if model exists locally in cache
            const parts = this.modelId.split('/');
            const namespace = parts[0];
            const modelName = parts[1];
            const modelDir = path.join(CACHE_DIR, namespace, modelName);

            if (!fs.existsSync(modelDir)) {
                console.log(`[RerankerService] Model not found, downloading ${this.modelId}...`);
            }

            // We use the sequence-classification task for cross-encoders
            this.pipe = await pipeline('sequence-classification' as any, this.modelId, {
                quantized: true,
                // @ts-ignore
                progress_callback: (info) => {
                    if (info.status === 'done') {
                        console.error(`[RerankerService] Loaded shard: ${info.file}`);
                    }
                }
            });

            this.initialized = true;
            console.error(`[RerankerService] Initialization complete.`);
        } catch (error) {
            console.error(`[RerankerService] Initialization failed:`, error);
            throw error;
        }
    }

    /**
     * Reranks a list of documents based on a query.
     * @param query The search query
     * @param documents Array of document strings to rank
     * @returns Array of { index, score } sorted by score descending
     */
    async rerank(query: string, documents: string[]): Promise<RerankResult[]> {
        if (documents.length === 0) return [];

        await this.init();

        try {
            const results: RerankResult[] = [];

            // Cross-encoders take pairs of [query, document]
            // We can process them in a single batch
            const inputs = documents.map(doc => [query, doc]);

            // @ts-ignore
            const outputs = await this.pipe(inputs, {
                topk: 1 // We want the score for the "relevant" class (usually index 1 or the only output)
            });

            // Handle both array of results and single result (if only 1 doc)
            const outputArray = Array.isArray(outputs) ? outputs : [outputs];

            for (let i = 0; i < outputArray.length; i++) {
                // Cross-encoders for ms-marco typically output a single logit/score or a 2-class distribution
                // transformers.js sequence-classification returns { label: string, score: number }[]
                // For ms-marco, label 'LABEL_1' is usually the relevance score
                const out = outputArray[i];
                results.push({
                    index: i,
                    score: out.score || 0
                });
            }

            // Sort by score descending
            return results.sort((a, b) => b.score - a.score);

        } catch (error) {
            console.error(`[RerankerService] Reranking failed:`, error);
            // Fallback: return original order with neutral scores
            return documents.map((_, i) => ({ index: i, score: 0 }));
        }
    }
}
