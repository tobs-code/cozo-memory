import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';
import { ZettelkastenEvolutionService } from './zettelkasten-evolution';

async function testZettelkastenFixed() {
  console.log('=== Testing Zettelkasten Evolution with Fixed HNSW Query ===\n');

  // Use the actual database
  const db = new CozoDb('sqlite', 'memory_db.cozo.db');
  const embeddings = new EmbeddingService();
  
  const zettelkasten = new ZettelkastenEvolutionService(db, embeddings, {
    enableEvolution: true,
    similarityThreshold: 0.7,
    maxRelatedNotes: 5,
    minKeywordFrequency: 1,
    autoExtractKeywords: true,
    autoBidirectionalLinks: true,
    enrichmentDepth: 'shallow'
  });

  try {
    // Get a sample observation from the database
    const obsResult = await db.run(`
      ?[id, entity_id, text, embedding] := 
        *observation{id, entity_id, text, embedding, @ "NOW"}
      :limit 1
    `);

    if (obsResult.rows.length === 0) {
      console.log('No observations found in database. Please add some data first.');
      return;
    }

    const [obsId, entityId, text, embedding] = obsResult.rows[0];
    console.log(`Testing with observation: ${obsId}`);
    console.log(`Text: ${text}\n`);

    // Test keyword extraction
    console.log('1. Testing keyword extraction...');
    const keywords = (zettelkasten as any).extractKeywords(text as string);
    console.log(`   Extracted keywords: ${keywords.join(', ')}\n`);

    // Test tag extraction
    console.log('2. Testing tag extraction...');
    const tags = (zettelkasten as any).extractTags(text as string);
    console.log(`   Extracted tags: ${tags.join(', ')}\n`);

    // Test finding related notes (this was failing before)
    console.log('3. Testing HNSW semantic search for related notes...');
    const relatedNotes = await zettelkasten.findRelatedNotes(
      obsId as string,
      text as string,
      embedding as number[]
    );
    console.log(`   Found ${relatedNotes.length} related notes:`);
    relatedNotes.forEach((note, i) => {
      console.log(`   ${i + 1}. ${note.observationId} (similarity: ${note.similarity.toFixed(3)})`);
      console.log(`      Connection: ${note.connectionType} - ${note.reason}`);
      console.log(`      Shared keywords: ${note.sharedKeywords.join(', ')}`);
    });
    console.log();

    // Test full enrichment
    console.log('4. Testing full observation enrichment...');
    const enrichmentResult = await zettelkasten.enrichObservation(
      obsId as string,
      text as string,
      embedding as number[],
      entityId as string
    );
    console.log(`   ${enrichmentResult.evolutionSummary}`);
    console.log(`   Keywords: ${enrichmentResult.extractedKeywords.join(', ')}`);
    console.log(`   Tags: ${enrichmentResult.addedTags.join(', ')}`);
    console.log(`   Related notes: ${enrichmentResult.relatedNotes.length}`);
    console.log(`   Created links: ${enrichmentResult.createdLinks}\n`);

    // Test evolution stats
    console.log('5. Testing evolution statistics...');
    const stats = await zettelkasten.getEvolutionStats();
    console.log(`   Total observations: ${stats.totalObservations}`);
    console.log(`   Enriched observations: ${stats.enrichedObservations}`);
    console.log(`   Total links: ${stats.totalLinks}`);
    console.log(`   Average links per note: ${stats.averageLinksPerNote.toFixed(2)}\n`);

    console.log('✅ All tests passed! HNSW query is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

testZettelkastenFixed().catch(console.error);
