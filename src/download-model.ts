import { AutoModel, env } from "@xenova/transformers";
import * as path from 'path';

// Konfiguriere Cache-Pfad
const CACHE_DIR = path.resolve('./.cache');
env.cacheDir = CACHE_DIR;

const MODEL_ID = "Xenova/bge-m3";

async function downloadModel() {
    console.log(`Lade FP32 Modell für ${MODEL_ID} herunter...`);
    // quantized: false forces FP32 model download
    await AutoModel.from_pretrained(MODEL_ID, { quantized: false });
    console.log("Download abgeschlossen.");
}

downloadModel();
