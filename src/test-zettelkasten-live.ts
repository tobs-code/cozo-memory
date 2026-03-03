import { CozoDb } from 'cozo-node';
import { ZettelkastenEvolutionService } from './zettelkasten-evolution';
import { EmbeddingService } from './embedding-service';

async function testZettelkastenLive() {
  console.log('=== Zettelkasten Live Test with Existing Data ===\n');

  // Open the actual database file
  const db = new CozoDb('sqlite', 'memory_db.cozo.db');
  const embeddingService = new EmbeddingService();
  const zettelService = new ZettelkastenEvolutionService(db, embeddingService, {
    enableEvolution: true,
    similarityThreshold: 0.7,
    maxRelatedNotes: 5,
    minKeywordFrequency: 1, // Lower for testing
    autoExtractKeywords: true,
    autoBidirectionalLinks: true,
    enrichmentDepth: 'shallow'
  });

  try {
    // Test 1: Get current evolution stats
    console.log('Test 1: Getting current evolution statistics...');
    const stats = await zettelService.getEvolutionStats();
    console.log(`Total Observations: ${stats.totalObservations}`);
    console.log(`Enriched Observations: ${stats.enrichedObservations}`);
    console.log(`Total Zettelkasten Links: ${stats.totalLinks}`);
    console.log(`Average Links per Note: ${stats.averageLinksPerNote.toFixed(2)}`);
    console.log();

    // Test 2: Get the last observation we created
    console.log('Test 2: Fetching recent observations...');
    const obsResult = await db.run(`
      ?[id, entity_id, text, embedding] := 
        *observation{id, entity_id, text, embedding, @ "NOW"}
      :limit 5
    `);

    if (obsResult.rows.length === 0) {
      console.log('No observations found in database');
      return;
    }

    console.log(`Found ${obsResult.rows.length} observations\n`);

    // Test 3: Test keyword extraction on existing observations
    console.log('Test 3: Testing keyword extraction...');
    for (const row of obsResult.rows.slice(0, 3)) {
      const text = row[2] as string;
      const keywords = (zettelService as any).extractKeywords(text);
      console.log(`Text: "${text.substring(0, 60)}..."`);
      console.log(`Keywords: ${keywords.join(', ') || 'none'}\n`);
    }

    // Test 4: Test tag extraction
    console.log('Test 4: Testing tag extraction...');
    const testTexts = [
      'This is about #machinelearning and #ai',
      'Category: programming, Type: tutorial',
      obsResult.rows[0][2] as string
    ];

    for (const text of testTexts) {
      const tags = (zettelService as any).extractTags(text);
      console.log(`Text: "${text.substring(0, 50)}..."`);
      console.log(`Tags: ${tags.join(', ') || 'none'}\n`);
    }

    // Test 5: Find related notes for the first observation
    console.log('Test 5: Finding related notes...');
    const firstObs = obsResult.rows[0];
    const obsId = firstObs[0] as string;
    const obsText = firstObs[2] as string;
    const obsEmbedding = firstObs[3] as number[];

    console.log(`Analyzing observation: ${obsId}`);
    console.log(`Text: "${obsText.substring(0, 80)}..."\n`);

    const relatedNotes = await zettelService.findRelatedNotes(
      obsId,
      obsText,
      obsEmbedding
    );

    console.log(`Found ${relatedNotes.length} related notes:`);
    for (const related of relatedNotes) {
      console.log(`  - ${related.observationId}`);
      console.log(`    Similarity: ${related.similarity.toFixed(3)}`);
      console.log(`    Type: ${related.connectionType}`);
      console.log(`    Reason: ${related.reason}`);
      console.log(`    Shared Keywords: ${related.sharedKeywords.join(', ') || 'none'}`);
      console.log(`    Text: ${related.text.substring(0, 60)}...`);
      console.log();
    }

    // Test 6: Enrich one observation
    if (obsResult.rows.length > 0) {
      console.log('Test 6: Enriching an observation...');
      const testObs = obsResult.rows[0];
      const testId = testObs[0] as string;
      const testText = testObs[2] as string;
      const testEmbedding = testObs[3] as number[];
      const testEntityId = testObs[1] as string;

      const enrichmentResult = await zettelService.enrichObservation(
        testId,
        testText,
        testEmbedding,
        testEntityId
      );

      console.log(`Enrichment Result:`);
      console.log(`  Observation ID: ${enrichmentResult.observationId}`);
      console.log(`  Extracted Keywords: ${enrichmentResult.extractedKeywords.join(', ')}`);
      console.log(`  Added Tags: ${enrichmentResult.addedTags.length > 0 ? enrichmentResult.addedTags.join(', ') : 'none'}`);
      console.log(`  Related Notes: ${enrichmentResult.relatedNotes.length}`);
      console.log(`  Links Created: ${enrichmentResult.createdLinks}`);
      console.log(`  Summary: ${enrichmentResult.evolutionSummary}`);
      console.log();
    }

    // Test 7: Check final stats
    console.log('Test 7: Final statistics...');
    const finalStats = await zettelService.getEvolutionStats();
    console.log(`Total Observations: ${finalStats.totalObservations}`);
    console.log(`Enriched: ${finalStats.enrichedObservations}`);
    console.log(`Total Links: ${finalStats.totalLinks}`);
    console.log(`Avg Links/Note: ${finalStats.averageLinksPerNote.toFixed(2)}`);
    console.log();

    console.log('=== All Tests Completed Successfully ===');

  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  } finally {
    db.close();
  }
}

// Run tests
testZettelkastenLive().catch(console.error);
