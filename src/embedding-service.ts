
import { AutoTokenizer, env } from "@xenova/transformers";
import * as ort from 'onnxruntime-node';
import * as path from 'path';
import * as fs from 'fs';

// Robuster Pfad zum Projekt-Root
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.resolve(PROJECT_ROOT, '.cache');
env.cacheDir = CACHE_DIR;
env.allowLocalModels = true;

// Einfache LRU Cache Implementierung
class LRUCache<T> {
  private cache = new Map<string, { value: T; timestamp: number }>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize: number = 1000, ttlMs: number = 3600000) { // 1 Stunde TTL
    this.maxSize = maxSize;
    this.ttl = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Prüfe TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    // Wenn Key bereits existiert, entferne alte Position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // Wenn Cache voll ist, entferne ältesten Eintrag
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export class EmbeddingService {
  private cache: LRUCache<number[]>;
  private session: ort.InferenceSession | null = null;
  private tokenizer: any = null;
  private readonly modelId: string = "Xenova/bge-m3";
  private readonly dimensions: number = 1024;
  private queue: Promise<any> = Promise.resolve();

  constructor() {
    this.cache = new LRUCache<number[]>(1000, 3600000); // 1000 Einträge, 1h TTL
  }

  // Serialisiert die Ausführung von Embeddings, um Event-Loop-Blockaden zu vermeiden
  private async runSerialized<T>(task: () => Promise<T>): Promise<T> {
    // Chain the task to the queue
    const res = this.queue.then(() => task());
    // Update the queue to wait for this task (but catch errors so queue doesn't stall)
    this.queue = res.catch(() => {}); 
    return res;
  }

  private async init() {
    if (this.session && this.tokenizer) return;

    try {
      // 1. Tokenizer laden
      if (!this.tokenizer) {
          this.tokenizer = await AutoTokenizer.from_pretrained(this.modelId);
      }

      // 2. Modell-Pfad ermitteln
      const baseDir = path.join(env.cacheDir, 'Xenova', 'bge-m3', 'onnx');
      
      // Priorität: FP32 (model.onnx) > Quantized (model_quantized.onnx)
      let modelPath = path.join(baseDir, 'model.onnx');
      
      if (!fs.existsSync(modelPath)) {
        modelPath = path.join(baseDir, 'model_quantized.onnx');
      }

      if (!fs.existsSync(modelPath)) {
        throw new Error(`Modell-Datei nicht gefunden unter: ${modelPath}`);
      }

      // 3. Session erstellen
      if (!this.session) {
          const options: ort.InferenceSession.SessionOptions = {
            executionProviders: ['dml', 'cpu'], // DirectML first
            graphOptimizationLevel: 'all'
          };

          this.session = await ort.InferenceSession.create(modelPath, options);
      }

    } catch (err: any) {
      console.error("[EmbeddingService] Kritischer Fehler bei Initialisierung:", err);
      throw err;
    }
  }

  async embed(text: any): Promise<number[]> {
    return this.runSerialized(async () => {
      const textStr = String(text || "");
      
      // 1. Cache lookup
      const cached = this.cache.get(textStr);
      if (cached) {
        return cached;
      }

      try {
        await this.init();
        if (!this.session || !this.tokenizer) throw new Error("Session/Tokenizer nicht initialisiert");

        // 2. Tokenization
        const model_inputs = await this.tokenizer(textStr, { padding: true, truncation: true });
        
        // 3. Tensor Creation
        const feeds: Record<string, ort.Tensor> = {};
        let attentionMaskData: BigInt64Array | null = null;

        for (const [key, value] of Object.entries(model_inputs)) {
            if (key === 'input_ids' || key === 'attention_mask' || key === 'token_type_ids') {
                 // @ts-ignore
                const data = BigInt64Array.from(value.data || value.cpuData);
                 // @ts-ignore
                const dims = value.dims;
                
                // Store attention mask for pooling
                if (key === 'attention_mask') {
                    attentionMaskData = data;
                }

                feeds[key] = new ort.Tensor('int64', data, dims);
            }
        }

        // 4. Inference
        const results = await this.session.run(feeds);
        
        // 5. Pooling & Normalization
        // Output name usually 'last_hidden_state' or 'logits'
        // For BGE-M3, the first output is usually the hidden states [batch, seq_len, hidden_size]
        const outputName = this.session.outputNames[0]; 
        const outputTensor = results[outputName];
        
        // Ensure we have data
        if (!outputTensor || !attentionMaskData) {
            throw new Error("Keine Output-Daten oder Attention Mask vorhanden");
        }

        const embedding = this.meanPooling(
            outputTensor.data as Float32Array, 
            attentionMaskData, 
            outputTensor.dims
        );
        
        // Normalize
        const normalized = this.normalize(embedding);

        this.cache.set(textStr, normalized);
        return normalized;

      } catch (error: any) {
        console.error(`[EmbeddingService] Fehler bei Embedding für "${textStr.substring(0, 20)}...":`, error?.message || error);
        return new Array(this.dimensions).fill(0);
      }
    });
  }

  // Batch-Embeddings
  async embedBatch(texts: string[]): Promise<number[][]> {
      // For now, process sequentially via serialized queue to avoid overloading
      // In future, true batching can be implemented by passing array to tokenizer
      const results: number[][] = [];
      for (const text of texts) {
          results.push(await this.embed(text));
      }
      return results;
  }

  private meanPooling(data: Float32Array, attentionMask: BigInt64Array, dims: readonly number[]): number[] {
    // dims: [batch_size, seq_len, hidden_size]
    // We assume batch_size = 1 for single embedding call
    const [batchSize, seqLen, hiddenSize] = dims;
    
    // Create accumulator
    const embedding = new Float32Array(hiddenSize).fill(0);
    let validTokens = 0;

    for (let i = 0; i < seqLen; i++) {
        // Check mask (1 = valid token, 0 = padding)
        if (attentionMask[i] === 1n) {
            validTokens++;
            for (let j = 0; j < hiddenSize; j++) {
                // data is flat array: [batch * seq * hidden]
                // index = i * hiddenSize + j
                embedding[j] += data[i * hiddenSize + j];
            }
        }
    }

    // Divide by valid count
    if (validTokens > 0) {
        for (let j = 0; j < hiddenSize; j++) {
            embedding[j] /= validTokens;
        }
    }

    return Array.from(embedding);
  }

  private normalize(vector: number[]): number[] {
      const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
      if (norm === 0) return vector;
      return vector.map(v => v / norm);
  }

  // Cache-Statistiken
  getCacheStats() {
    return {
      size: this.cache.size(),
      maxSize: 1000,
      model: this.modelId,
      dimensions: this.dimensions
    };
  }

  // Cache leeren
  clearCache(): void {
    this.cache.clear();
  }
}
