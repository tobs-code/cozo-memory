import 'dotenv/config'; // Load .env file first
import { AutoModel, env } from "@xenova/transformers";
import * as path from 'path';

// Configure cache path
const CACHE_DIR = path.resolve('./.cache');
env.cacheDir = CACHE_DIR;

// Read model from environment variable or use default
const MODEL_ID = process.env.EMBEDDING_MODEL || "Xenova/bge-m3";

async function downloadModel() {
    console.log(`Downloading FP32 model for ${MODEL_ID}...`);
    // quantized: false forces FP32 model download
    await AutoModel.from_pretrained(MODEL_ID, { quantized: false });
    console.log("Download completed.");
}

downloadModel();
