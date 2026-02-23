import { AutoTokenizer, env } from "@xenova/transformers";
import * as ort from 'onnxruntime-node';
import * as path from 'path';
import * as fs from 'fs';

// Konfiguriere Cache-Pfad
const CACHE_DIR = path.resolve('./.cache');
env.cacheDir = CACHE_DIR;

const MODEL_ID = "Xenova/bge-m3";
const QUANTIZED = false; 
const MODEL_FILE = QUANTIZED ? "model_quantized.onnx" : "model.onnx";

const BATCH_SIZE = 10;
const NUM_TEXTS = 200;

const texts = Array.from({ length: NUM_TEXTS }, (_, i) => 
  `Dies ist ein komplexer Testsatz Nummer ${i} für den Performance-Vergleich von CPU und GPU Embeddings. Je länger der Text ist, desto deutlicher sollte der Vorteil der parallelen Verarbeitung auf der Grafikkarte sichtbar werden, insbesondere bei Transformer-Modellen wie BGE-M3. Wir testen hier die DirectML Integration auf Windows mit einer RTX 2080.`
);

async function runBenchmark() {
  console.log("==========================================");
  console.log(`Starte Benchmark: CPU vs GPU (DirectML) [FP32 Mode]`);
  console.log(`Batch Size: ${BATCH_SIZE}, Total Texts: ${NUM_TEXTS}`);
  
  // 1. Prepare Model Path
  const modelPath = path.join(CACHE_DIR, 'Xenova', 'bge-m3', 'onnx', MODEL_FILE);
  if (!fs.existsSync(modelPath)) {
      console.error(`Modell nicht gefunden unter: ${modelPath}`);
      return;
  }
  console.log(`Modellpfad: ${modelPath}`);

  // 2. Load Tokenizer
  console.log("Lade Tokenizer...");
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);

  // 3. Define Helper for Inference
  async function runInference(session: ort.InferenceSession, label: string, useInt32: boolean = false) {
      console.log(`Starte ${label} Inferenz (Int32 Inputs: ${useInt32})...`);
      const start = performance.now();
      
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
          const batchTexts = texts.slice(i, i + BATCH_SIZE);
          const model_inputs = await tokenizer(batchTexts, { padding: true, truncation: true });
          
          const feeds: Record<string, ort.Tensor> = {};
          
          for (const [key, value] of Object.entries(model_inputs)) {
              if (key === 'input_ids' || key === 'attention_mask' || key === 'token_type_ids') {
                  // @ts-ignore
                  let data = value.data || value.cpuData;
                   // @ts-ignore
                  const dims = value.dims; // [batch_size, seq_len]

                  // Convert to Int32 if requested (for DirectML optimization)
                  // Note: The model input MUST support int32 in ONNX, otherwise this will fail.
                  // Most transformer models use int64 for input_ids. 
                  // If we change type here, we rely on ORT to cast or the model to accept it.
                  // DirectML often prefers Int32 for indices.
                  let type: 'int64' | 'int32' = 'int64';
                  if (useInt32) {
                      data = Int32Array.from(data);
                      type = 'int32';
                  } else {
                      // Ensure BigInt64Array
                      if (!(data instanceof BigInt64Array)) {
                          data = BigInt64Array.from(data);
                      }
                  }

                  try {
                    feeds[key] = new ort.Tensor(type, data, dims);
                  } catch (err: any) {
                      console.error(`Error creating tensor for ${key}:`, err.message);
                      throw err;
                  }
              }
          }

          // Run Inference
          await session.run(feeds);
          process.stdout.write(".");
      }
      
      const end = performance.now();
      const duration = (end - start) / 1000;
      console.log(`\n${label} Zeit: ${duration.toFixed(2)}s`);
      const speed = texts.length / duration;
      console.log(`${label} Geschwindigkeit: ${speed.toFixed(2)} Embeddings/s`);
      return speed;
  }

  // --- Phase 1: CPU Benchmark ---
  console.log("\n--- Phase 1: CPU Benchmark ---");
  let speedCpu = 0;
  try {
      const sessionCpu = await ort.InferenceSession.create(modelPath, {
          executionProviders: ['cpu']
      });
      console.log("CPU Session erstellt.");
      // CPU usually handles Int64 fine
      speedCpu = await runInference(sessionCpu, "CPU", false);

  } catch (e: any) {
      console.error("CPU Benchmark failed:", e.message);
  }

  // --- Phase 2: GPU Benchmark ---
  console.log("\n--- Phase 2: GPU (DirectML) Benchmark ---");
  try {
      const sessionOptions = {
          executionProviders: ['dml', 'cpu'],
          enableCpuMemArena: false // Sometimes helps with DML memory management
      };
      
      const startGpuLoad = performance.now();
      const sessionGpu = await ort.InferenceSession.create(modelPath, sessionOptions);
      const endGpuLoad = performance.now();
      console.log(`GPU Session erstellt in ${((endGpuLoad - startGpuLoad) / 1000).toFixed(2)}s`);
      
      // Warmup
      {
          const text = ["Warmup"];
          const model_inputs = await tokenizer(text, { padding: true, truncation: true });
          const feeds: Record<string, ort.Tensor> = {};
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

      // Try with Int64 first (standard)
      let speedGpu = await runInference(sessionGpu, "GPU (Int64)", false);

      // Compare
      if (speedCpu > 0) {
          const speedup = speedGpu / speedCpu;
          console.log("\n==========================================");
          console.log(`Ergebnis: GPU ist ${speedup.toFixed(2)}x schneller als CPU.`);
          console.log("==========================================");
      }
      
      // Optional: Try Int32 if result is bad?
      // Usually ONNX models are strict about input types. 
      // If the model expects Int64, passing Int32 might fail with "Type mismatch".
      // We can try catching it.
      /*
      try {
          console.log("\nVersuche GPU mit Int32 Inputs (experimentell)...");
          const speedGpu32 = await runInference(sessionGpu, "GPU (Int32)", true);
           if (speedCpu > 0) {
              const speedup = speedGpu32 / speedCpu;
              console.log(`Ergebnis (Int32): GPU ist ${speedup.toFixed(2)}x schneller als CPU.`);
          }
      } catch(e) {
          console.log("Int32 Inferenz nicht unterstützt vom Modell (erwartet).");
      }
      */

  } catch (e: any) {
      console.error("GPU Benchmark failed:", e.message);
      console.error(e.stack);
  }
}

runBenchmark();
