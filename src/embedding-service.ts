import 'dotenv/config'; // Load .env file first
import { AutoTokenizer, env } from "@xenova/transformers";
const ort = require('onnxruntime-node');
import * as path from 'path';
import * as fs from 'fs';

// Robust path to project root
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.resolve(PROJECT_ROOT, '.cache');
env.cacheDir = CACHE_DIR;
env.allowLocalModels = true;

// Simple LRU Cache Implementation
class LRUCache<T> {
  private cache = new Map<string, { value: T; timestamp: number }>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize: number = 1000, ttlMs: number = 3600000) { // 1 hour TTL
    this.maxSize = maxSize;
    this.ttl = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
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
    // If key already exists, remove old position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // If cache is full, remove oldest entry
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
  private session: any | null = null;
  private tokenizer: any = null;
  private readonly modelId: string;
  private readonly dimensions: number;
  private readonly useOllama: boolean;
  private readonly ollamaModel: string;
  private readonly ollamaBaseUrl: string;
  private queue: Promise<any> = Promise.resolve();

  constructor() {
    this.cache = new LRUCache<number[]>(1000, 3600000); // 1000 entries, 1h TTL
    
    // Check if Ollama should be used
    this.useOllama = process.env.USE_OLLAMA === 'true';
    this.ollamaModel = process.env.OLLAMA_EMBEDDING_MODEL || 'argus-ai/pplx-embed-v1-0.6b:q8_0';
    this.ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    
    // Support multiple embedding models via environment variable
    this.modelId = process.env.EMBEDDING_MODEL || "Xenova/bge-m3";
    
    // Set dimensions based on model
    const dimensionMap: Record<string, number> = {
      "Xenova/bge-m3": 1024,
      "Xenova/all-MiniLM-L6-v2": 384,
      "Xenova/bge-small-en-v1.5": 384,
      "Xenova/nomic-embed-text-v1": 768,
      "onnx-community/Qwen3-Embedding-0.6B-ONNX": 1024,
      // Note: perplexity-ai models require manual ONNX file placement
      // See PPLX_EMBED_INTEGRATION.md for instructions
      "perplexity-ai/pplx-embed-v1-0.6b": 1024,
      "perplexity-ai/pplx-embed-v1-4b": 2560,
      // Ollama models
      "argus-ai/pplx-embed-v1-0.6b:q8_0": 1024,
    };
    
    this.dimensions = dimensionMap[this.useOllama ? this.ollamaModel : this.modelId] || 1024;
    
    if (this.useOllama) {
      console.error(`[EmbeddingService] Using Ollama: ${this.ollamaModel} @ ${this.ollamaBaseUrl} (${this.dimensions} dimensions)`);
    } else {
      console.error(`[EmbeddingService] Using ONNX model: ${this.modelId} (${this.dimensions} dimensions)`);
    }
  }

  // Public getter for dimensions
  getDimensions(): number {
    return this.dimensions;
  }

  // Serializes embedding execution to avoid event loop blocking
  private async runSerialized<T>(task: () => Promise<T>): Promise<T> {
    // Chain the task to the queue
    const res = this.queue.then(() => task());
    // Update the queue to wait for this task (but catch errors so queue doesn't stall)
    this.queue = res.catch(() => {}); 
    return res;
  }

  private async init() {
    if (this.session && this.tokenizer) return;
    
    // Skip ONNX initialization if using Ollama
    if (this.useOllama) {
      console.error('[EmbeddingService] Using Ollama backend, skipping ONNX initialization');
      return;
    }

    try {
      // 1. Check if model needs to be downloaded
      // Extract namespace and model name from modelId (e.g., "Xenova/bge-m3" or "onnx-community/Qwen3-Embedding-0.6B-ONNX")
      const parts = this.modelId.split('/');
      const namespace = parts[0];
      const modelName = parts[1];
      
      // Try both possible cache locations
      let baseDir = path.join(env.cacheDir, namespace, modelName, 'onnx');
      let fp32Path = path.join(baseDir, 'model.onnx');
      let quantizedPath = path.join(baseDir, 'model_quantized.onnx');
      
      // If ONNX model files don't exist, download them
      if (!fs.existsSync(fp32Path) && !fs.existsSync(quantizedPath)) {
        console.log(`[EmbeddingService] Model not found, downloading ${this.modelId}...`);
        console.log(`[EmbeddingService] This may take a few minutes on first run.`);
        
        // Check if this is a Xenova-compatible model
        if (namespace === 'Xenova' || namespace === 'onnx-community') {
          // Import AutoModel dynamically to trigger download
          const { AutoModel } = await import("@xenova/transformers");
          await AutoModel.from_pretrained(this.modelId, { quantized: false });
          
          console.log(`[EmbeddingService] Model download completed.`);
        } else {
          // For non-Xenova models (like perplexity-ai), provide manual download instructions
          console.error(`[EmbeddingService] ERROR: Model ${this.modelId} is not available via @xenova/transformers`);
          console.error(`[EmbeddingService] Please download the model manually:`);
          console.error(`[EmbeddingService] 1. Visit: https://huggingface.co/${this.modelId}`);
          console.error(`[EmbeddingService] 2. Download the 'onnx' folder contents`);
          console.error(`[EmbeddingService] 3. Place files in: ${baseDir}`);
          console.error(`[EmbeddingService] See PPLX_EMBED_INTEGRATION.md for detailed instructions`);
          throw new Error(`Model ${this.modelId} requires manual download. See error messages above.`);
        }
      }

      // 2. Load Tokenizer
      if (!this.tokenizer) {
          this.tokenizer = await AutoTokenizer.from_pretrained(this.modelId);
      }

      // 3. Determine model path
      // Priority: FP32 (model.onnx) > Quantized (model_quantized.onnx)
      let modelPath = fp32Path;
      
      if (!fs.existsSync(modelPath)) {
        modelPath = quantizedPath;
      }

      if (!fs.existsSync(modelPath)) {
        throw new Error(`Model file not found at: ${modelPath}. Download may have failed.`);
      }

      // 4. Create Session
      if (!this.session) {
          const options: any = {
            executionProviders: ['cpu'], // Use CPU backend to avoid native conflicts
            graphOptimizationLevel: 'all'
          };

          this.session = await ort.InferenceSession.create(modelPath, options);
      }

    } catch (err: any) {
      console.error("[EmbeddingService] Critical initialization error:", err);
      throw err;
    }
  }

  async embed(text: any): Promise<number[]> {
    return this.runSerialized(async () => {
      let textStr = String(text || "");
      
      // For Qwen3-Embedding models, add instruction prefix for better results
      // (only for queries, not for documents being indexed)
      if (this.modelId.includes('Qwen3-Embedding')) {
        // Add instruction prefix if not already present
        if (!textStr.startsWith('Instruct:')) {
          textStr = `Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery: ${textStr}`;
        }
      }
      
      // 1. Cache lookup
      const cached = this.cache.get(textStr);
      if (cached) {
        return cached;
      }

      try {
        // Use Ollama if enabled
        if (this.useOllama) {
          return await this.embedWithOllama(textStr);
        }

        await this.init();
        if (!this.session || !this.tokenizer) throw new Error("Session/Tokenizer not initialized");

        // 2. Tokenization
        const model_inputs = await this.tokenizer(textStr, { padding: true, truncation: true });
        
        // 3. Tensor Creation
        const feeds: Record<string, any> = {};
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

                feeds[key] = new (ort as any).Tensor('int64', data, dims);
            }
        }

        // 4. Inference
        const results = await this.session.run(feeds);
        
        // 5. Pooling & Normalization
        // Output name usually 'last_hidden_state' or 'logits'
        const outputName = this.session.outputNames[0]; 
        const outputTensor = results[outputName];
        
        // Ensure we have data
        if (!outputTensor || !attentionMaskData) {
            throw new Error("No output data or attention mask available");
        }

        // Choose pooling strategy based on model
        let embedding: number[];
        if (this.modelId.includes('Qwen3-Embedding')) {
          // Qwen3-Embedding uses last token pooling
          embedding = this.lastTokenPooling(
            outputTensor.data as Float32Array,
            attentionMaskData,
            outputTensor.dims
          );
        } else {
          // BGE and other models use mean pooling
          embedding = this.meanPooling(
            outputTensor.data as Float32Array, 
            attentionMaskData, 
            outputTensor.dims
          );
        }
        
        // Normalize
        const normalized = this.normalize(embedding);

        this.cache.set(textStr, normalized);
        return normalized;

      } catch (error: any) {
        console.error(`[EmbeddingService] Error embedding "${textStr.substring(0, 20)}...":`, error?.message || error);
        return new Array(this.dimensions).fill(0);
      }
    });
  }

  private async embedWithOllama(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid response from Ollama API');
      }

      const embedding = data.embedding;
      
      // Normalize the embedding
      const normalized = this.normalize(embedding);
      
      // Cache it
      this.cache.set(text, normalized);
      
      return normalized;
    } catch (error: any) {
      console.error(`[EmbeddingService] Ollama error for "${text.substring(0, 20)}...":`, error?.message || error);
      return new Array(this.dimensions).fill(0);
    }
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

  private lastTokenPooling(data: Float32Array, attentionMask: BigInt64Array, dims: readonly number[]): number[] {
    // dims: [batch_size, seq_len, hidden_size]
    // Extract the last valid token's hidden state
    const [batchSize, seqLen, hiddenSize] = dims;
    
    // Find last valid token position
    let lastValidIdx = seqLen - 1;
    for (let i = seqLen - 1; i >= 0; i--) {
      if (attentionMask[i] === 1n) {
        lastValidIdx = i;
        break;
      }
    }
    
    // Extract embedding at last valid position
    const embedding = new Float32Array(hiddenSize);
    for (let j = 0; j < hiddenSize; j++) {
      embedding[j] = data[lastValidIdx * hiddenSize + j];
    }
    
    return Array.from(embedding);
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

  // Cache Statistics
  getCacheStats() {
    return {
      size: this.cache.size(),
      maxSize: 1000,
      model: this.useOllama ? this.ollamaModel : this.modelId,
      backend: this.useOllama ? 'ollama' : 'onnx',
      dimensions: this.dimensions
    };
  }

  // Clear Cache
  clearCache(): void {
    this.cache.clear();
  }
}
