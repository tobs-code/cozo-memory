import { EmbeddingService } from "./embedding-service";

async function main() {
    console.log("Starting Embedding Test...");
    const service = new EmbeddingService();
    
    try {
        console.log("Generating embedding for 'Hello World'...");
        const vec = await service.embed("Hello World");
        console.log("Embedding vector length:", vec.length);
        
        // Check if all are 0
        const isAllZero = vec.every(v => v === 0);
        console.log("Is vector only zeros?", isAllZero);
        
        if (!isAllZero) {
            console.log("First 5 values:", vec.slice(0, 5));
        }
        
    } catch (e: any) {
        console.error("Error in test:", e);
    }
}

main();
