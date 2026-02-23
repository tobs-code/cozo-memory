import { EmbeddingService } from "./embedding-service";

async function checkGpu() {
  console.log("Starte Embedding-Test...");
  try {
    const service = new EmbeddingService();
    // Embedding eines Dummy-Textes, um die Initialisierung zu triggern
    await service.embed("Test Embedding");
    console.log("Embedding erfolgreich abgeschlossen.");
  } catch (error) {
    console.error("Fehler beim Embedding:", error);
  }
}

checkGpu();
