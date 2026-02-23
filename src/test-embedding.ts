import { EmbeddingService } from "./embedding-service";

async function main() {
    console.log("Starte Embedding Test...");
    const service = new EmbeddingService();
    
    try {
        console.log("Erzeuge Embedding für 'Hallo Welt'...");
        const vec = await service.embed("Hallo Welt");
        console.log("Embedding Vektor Länge:", vec.length);
        
        // Prüfe ob alles 0 ist
        const isAllZero = vec.every(v => v === 0);
        console.log("Ist Vektor nur Nullen?", isAllZero);
        
        if (!isAllZero) {
            console.log("Erste 5 Werte:", vec.slice(0, 5));
        }
        
    } catch (e: any) {
        console.error("Fehler im Test:", e);
    }
}

main();
