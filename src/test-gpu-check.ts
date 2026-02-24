import { EmbeddingService } from "./embedding-service";

async function checkGpu() {
  console.log("Starting Embedding Test...");
  try {
    const service = new EmbeddingService();
    // Embedding a dummy text to trigger initialization
    await service.embed("Test Embedding");
    console.log("Embedding successfully completed.");
  } catch (error) {
    console.error("Error during embedding:", error);
  }
}

checkGpu();
