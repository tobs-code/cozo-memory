import 'dotenv/config';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { env } from "@xenova/transformers";

// Configure cache path
const CACHE_DIR = path.resolve('./.cache');
env.cacheDir = CACHE_DIR;

const MODEL_ID = "perplexity-ai/pplx-embed-v1-0.6b";
const BASE_URL = `https://huggingface.co/${MODEL_ID}/resolve/main/onnx`;

// Model variant to download (quantized is recommended for smaller size)
const USE_QUANTIZED = true; // Set to false for FP32 full precision

// Files to download based on variant
const FILES = USE_QUANTIZED ? [
  { name: 'model_quantized.onnx', size: '614 KB' },
  { name: 'model_quantized.onnx_data', size: '706 MB' }
] : [
  { name: 'model.onnx', size: '520 KB' },
  { name: 'model.onnx_data', size: '2.09 GB' },
  { name: 'model.onnx_data_1', size: '306 MB' }
];

// Target directory
const targetDir = path.join(CACHE_DIR, 'perplexity-ai', 'pplx-embed-v1-0.6b', 'onnx');

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlinkSync(dest);
          return downloadFile(redirectUrl, dest).then(resolve).catch(reject);
        }
      }
      
      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const progress = ((downloadedSize / totalSize) * 100).toFixed(2);
        process.stdout.write(`\r  Progress: ${progress}% (${(downloadedSize / 1024 / 1024).toFixed(2)} MB / ${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('\n  ✓ Download complete');
        resolve();
      });
    }).on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function downloadPplxEmbed() {
  console.log('='.repeat(70));
  console.log('Downloading Perplexity pplx-embed-v1-0.6b ONNX files');
  console.log(`Variant: ${USE_QUANTIZED ? 'INT8 Quantized (Recommended)' : 'FP32 Full Precision'}`);
  console.log('='.repeat(70));
  console.log();
  
  // Create target directory
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`✓ Created directory: ${targetDir}`);
  }
  
  console.log();
  console.log('Files to download:');
  FILES.forEach(f => console.log(`  - ${f.name} (${f.size})`));
  console.log();
  console.log(`Total size: ${USE_QUANTIZED ? '~706 MB' : '~2.5 GB'}`);
  console.log(`This may take ${USE_QUANTIZED ? '3-10' : '10-30'} minutes depending on your internet connection.`);
  console.log();
  
  if (USE_QUANTIZED) {
    console.log('ℹ Using INT8 quantized model (recommended):');
    console.log('  ✓ 3x smaller than FP32 (~706 MB vs ~2.4 GB)');
    console.log('  ✓ Minimal quality loss (~1.5% MTEB drop)');
    console.log('  ✓ Faster inference');
    console.log();
    console.log('  To use FP32 instead, edit src/download-pplx-embed.ts');
    console.log('  and set USE_QUANTIZED = false');
    console.log();
  }
  
  // Download each file
  for (const file of FILES) {
    const filePath = path.join(targetDir, file.name);
    
    // Skip if already exists
    if (fs.existsSync(filePath)) {
      console.log(`⊘ Skipping ${file.name} (already exists)`);
      continue;
    }
    
    console.log(`⬇ Downloading ${file.name} (${file.size})...`);
    const url = `${BASE_URL}/${file.name}`;
    
    try {
      await downloadFile(url, filePath);
    } catch (error: any) {
      console.error(`✗ Failed to download ${file.name}:`, error.message);
      console.error('  Please download manually from:');
      console.error(`  ${url}`);
      process.exit(1);
    }
  }
  
  console.log();
  console.log('='.repeat(70));
  console.log('✓ All files downloaded successfully!');
  console.log('='.repeat(70));
  console.log();
  console.log('You can now use the model by setting in .env:');
  console.log('  EMBEDDING_MODEL=perplexity-ai/pplx-embed-v1-0.6b');
  console.log();
  console.log('Then start the server with:');
  console.log('  npm run start');
  console.log();
}

downloadPplxEmbed().catch(console.error);
