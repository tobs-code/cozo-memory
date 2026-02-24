
import { AutoTokenizer, env } from "@xenova/transformers";
import * as ort from 'onnxruntime-node';
import * as path from 'path';
import * as fs from 'fs';

// Configure cache path
const CACHE_DIR = path.resolve('./.cache');
env.cacheDir = CACHE_DIR;

const EMBEDDING_DIM = 1024; // bge-m3
const MODEL_ID = "Xenova/bge-m3";
const QUANTIZED = false; 
const MODEL_FILE = QUANTIZED ? "model_quantized.onnx" : "model.onnx";

// Massive Load Configuration
const BATCH_SIZE = 10; // Process 10 items concurrently
const NUM_TEXTS = 50;
const TEXT_LENGTH_MULTIPLIER = 5; // 5x longer texts

const baseText = `This is a very long complex test sentence for the extended performance comparison of CPU and GPU embeddings. We want to maximize the graphics card (RTX 2080) utilization to make the activity visible in the Task Manager. DirectML should show what it can do here. `;
const longText = baseText.repeat(TEXT_LENGTH_MULTIPLIER);

const texts = Array.from({ length: NUM_TEXTS }, (_, i) => 
  `[${i}] ${longText}`
);

async function runBenchmark() {
  console.log("==========================================");
  console.log(`Starting HEAVY Benchmark: CPU vs GPU (DirectML) [FP32 Mode]`);
  console.log(`Batch Size: ${BATCH_SIZE}, Total Texts: ${NUM_TEXTS}`);
  console.log(`Text Length: ~${longText.length} chars`);
  console.log("==========================================");
  
  // 1. Prepare Model Path
  const modelPath = path.join(CACHE_DIR, 'Xenova', 'bge-m3', 'onnx', MODEL_FILE);
  if (!fs.existsSync(modelPath)) {
      console.error(`Model not found at: ${modelPath}`);
      return;
  }
  console.log(`Model path: ${modelPath}`);

  // 2. Load Tokenizer
  console.log("Loading Tokenizer...");
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);

  // 3. Define Helper for Inference
  async function runInference(session: any, label: string) {
      console.log(`Starting ${label} inference...`);
      const start = performance.now();
      
      let processed = 0;
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
          const batchTexts = texts.slice(i, i + BATCH_SIZE);
          const model_inputs = await tokenizer(batchTexts, { padding: true, truncation: true, maxLength: 512 });
          
          const feeds: Record<string, any> = {};
          
          for (const [key, value] of Object.entries(model_inputs)) {
              if (key === 'input_ids' || key === 'attention_mask' || key === 'token_type_ids') {
                  // @ts-ignore
                  let data = value.data || value.cpuData;
                   // @ts-ignore
                  const dims = value.dims; // [batch_size, seq_len]

                  // Ensure BigInt64Array
                  if (!(data instanceof BigInt64Array)) {
                      data = BigInt64Array.from(data);
                  }

                  try {
                    feeds[key] = new ort.Tensor('int64', data, dims);
                  } catch (err: any) {
                      console.error(`Error creating tensor for ${key}:`, err.message);
                      throw err;
                  }
              }
          }

          // Run Inference
          await session.run(feeds);
          processed += batchTexts.length;
          if (processed % (BATCH_SIZE * 5) === 0) {
            process.stdout.write(`\r${label}: ${processed}/${NUM_TEXTS} Embeddings...`);
          }
      }
      
      const end = performance.now();
      const duration = (end - start) / 1000;
      console.log(`\n${label} Time: ${duration.toFixed(2)}s`);
      const speed = texts.length / duration;
      console.log(`${label} Speed: ${speed.toFixed(2)} Embeddings/s`);
      return speed;
  }

  // --- Phase 1: GPU Benchmark (Priority) ---
  console.log("\n--- Phase 1: GPU (DirectML) Benchmark ---");
  let speedGpu = 0;
  try {
      const sessionOptions: any = {
          executionProviders: [
            {
              name: 'dml',
              device_id: 0,
            },
            'cpu'
          ],
          graphOptimizationLevel: 'all',
          enableCpuMemArena: false
      };
      
      console.log("Creating GPU Session (This might take a moment)...");
      const startGpuLoad = performance.now();
      const sessionGpu = await ort.InferenceSession.create(modelPath, sessionOptions);
      const endGpuLoad = performance.now();
      console.log(`GPU Session created in ${((endGpuLoad - startGpuLoad) / 1000).toFixed(2)}s`);
      
      // @ts-ignore
      console.log(`Providers: ${sessionGpu.getProviders ? sessionGpu.getProviders() : 'Unknown'}`);

      // Warmup
      console.log("GPU Warmup...");
      {
          const text = ["Warmup sentence to wake up the GPU."];
          const model_inputs = await tokenizer(text, { padding: true, truncation: true });
          const feeds: Record<string, any> = {};
          for (const [key, value] of Object.entries(model_inputs)) {
              if (key === 'input_ids' || key === 'attention_mask' || key === 'token_type_ids') {
                  // @ts-ignore
                  let data = value.data || value.cpuData;
                   // @ts-ignore
                  const dims = value.dims;
                  if (!(data instanceof BigInt64Array)) data = BigInt64Array.from(data);
                  feeds[key] = new ort.Tensor('int64', data, dims);
              }
          }
          await sessionGpu.run(feeds);
      }

      console.log("PLEASE WATCH TASK MANAGER GPU TAB NOW!");
      await new Promise(resolve => setTimeout(resolve, 2000)); // Give user time to switch

      speedGpu = await runInference(sessionGpu, "GPU");

  } catch (e: any) {
      console.error("GPU Benchmark failed:", e.message);
      console.error(e.stack);
  }

  // --- Phase 2: CPU Benchmark (Comparison) ---
  // Only run if GPU succeeded to compare, or if user wants to see baseline
  console.log("\n--- Phase 2: CPU Benchmark ---");
  let speedCpu = 0;
  try {
      const sessionCpu = await ort.InferenceSession.create(modelPath, {
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'all'
      });
      console.log("CPU Session created.");
      
      // Limit CPU run to avoid waiting too long if it's very slow
      // We'll run a subset for CPU
      const cpuTextsOriginal = texts;
      // Use fewer texts for CPU to save time, then extrapolate
      // 200 texts is enough for a reliable CPU speed measure
      const CPU_SUBSET_SIZE = 200; 
      console.log(`(Using only ${CPU_SUBSET_SIZE} texts for CPU Benchmark to save time...)`);
      
      // Mock the texts array temporarily or adjust the function
      // Actually, let's just slice the array in the function call? 
      // No, the function uses the global 'texts'. I should have made it an argument.
      // I'll just change the global 'texts' variable? No it's const.
      // I'll create a new runner function or just accept it runs on full set?
      // 2000 texts on CPU might take forever if it's 5/s -> 400s = 6 mins. Too long.
      
      // I'll define a new runInferenceForCpu that takes texts
      async function runInferenceSubset(session: any, label: string, subset: string[]) {
          console.log(`Starting ${label} inference (Subset: ${subset.length})...`);
          const start = performance.now();
          let processed = 0;
          for (let i = 0; i < subset.length; i += BATCH_SIZE) {
              const batchTexts = subset.slice(i, i + BATCH_SIZE);
              const model_inputs = await tokenizer(batchTexts, { padding: true, truncation: true, maxLength: 512 });
              const feeds: Record<string, any> = {};
              for (const [key, value] of Object.entries(model_inputs)) {
                  if (key === 'input_ids' || key === 'attention_mask' || key === 'token_type_ids') {
                      // @ts-ignore
                      let data = value.data || value.cpuData;
                       // @ts-ignore
                      const dims = value.dims;
                      if (!(data instanceof BigInt64Array)) data = BigInt64Array.from(data);
                      feeds[key] = new (ort as any).Tensor('int64', data, dims);
                  }
              }
              await session.run(feeds);
              processed += batchTexts.length;
              process.stdout.write(`.`);
          }
          const end = performance.now();
          const duration = (end - start) / 1000;
          console.log(`\n${label} Time: ${duration.toFixed(2)}s`);
          const speed = subset.length / duration;
          console.log(`${label} Speed: ${speed.toFixed(2)} Embeddings/s`);
          return speed;
      }

      speedCpu = await runInferenceSubset(sessionCpu, "CPU", texts.slice(0, CPU_SUBSET_SIZE));

  } catch (e: any) {
      console.error("CPU Benchmark failed:", e.message);
  }

  // Final Result
  if (speedGpu > 0 && speedCpu > 0) {
      const speedup = speedGpu / speedCpu;
      console.log("\n==========================================");
      console.log(`Result: GPU is ${speedup.toFixed(2)}x faster than CPU.`);
      console.log(`GPU Throughput: ${speedGpu.toFixed(2)} emb/s`);
      console.log(`CPU Throughput: ${speedCpu.toFixed(2)} emb/s`);
      console.log("==========================================");
  }
}

runBenchmark();
