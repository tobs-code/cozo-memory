
import { EmbeddingService } from './embedding-service';

async function verifyGpu() {
  console.log("Starting GPU Verification for EmbeddingService...");
  
  try {
    const service = new EmbeddingService();
    console.log("Service created. Generating embedding (Run 1)...");
    
    let start = performance.now();
    let embedding = await service.embed("This is a test sentence to verify GPU usage.");
    let end = performance.now();
    
    console.log(`Run 1: Embedding generated in ${(end - start).toFixed(2)}ms`);

    console.log("Generating embedding (Run 2)...");
    start = performance.now();
    embedding = await service.embed("This is a second test sentence.");
    end = performance.now();
    console.log(`Run 2: Embedding generated in ${(end - start).toFixed(2)}ms`);

    console.log(`Embedding length: ${embedding.length}`);
    
    if (embedding.length > 0 && embedding.some(v => v !== 0)) {
        console.log("Embedding contains non-zero values (Success).");
    } else {
        console.log("Embedding contains all zeros (Failure/Fallback triggered).");
    }
    
  } catch (error) {
    console.error("Verification failed:", error);
  }
}

verifyGpu();
