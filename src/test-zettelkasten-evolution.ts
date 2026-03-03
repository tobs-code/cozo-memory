import { CozoDb } from 'cozo-node';
import { ZettelkastenEvolutionService } from './zettelkasten-evolution';
import { EmbeddingService } from './embedding-service';

async function testZettelkastenEvolution() {
  console.log('=== Zettelkasten Memory Evolution Test ===\n');

  const db = new CozoDb();
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
    // Initialize database schema
    await db.run(`
      :create entity {
        id: String,
        =>
        name: String,
        type: String,
      }
    `);
    
    await db.run(`
      :create observation {
        id: String,
        created_at: Validity,
        =>
        entity_id: String,
        session_id: String?,
        task_id: String?,
        text: String,
        embedding: <F32; 1024>,
        metadata: Json?,
      }
    `);

    await db.run(`
      :create relationship {
        from_id: String,
        to_id: String,
        relation_type: String,
        =>
        strength: Float,
        metadata: Json?,
      }
    `);

    // Create HNSW index for semantic search
    await db.run(`
      ::hnsw create observation:semantic {
        dim: 1024,
        m: 50,
        dtype: F32,
        fields: [embedding],
        distance: Cosine,
        ef_construction: 200
      }
    `);
    
    console.log('✓ Database initialized\n');

    // Test 1: Create test entity
    console.log('Test 1: Creating test entity...');
    await db.run(`
      ?[id, name, type] <- [['test-entity', 'Knowledge Base', 'System']]
      :put entity {id, name, type}
    `);
    console.log('✓ Entity created\n');

    // Test 2: Create initial observations
    console.log('Test 2: Creating initial observations...');
    
    const testObservations = [
      {
        id: 'obs-1',
        text: 'Machine learning algorithms require large datasets for training. Deep learning models especially need millions of examples.',
      },
      {
        id: 'obs-2',
        text: 'Neural networks are inspired by biological neurons. They consist of layers of interconnected nodes.',
      },
      {
        id: 'obs-3',
        text: 'TypeScript provides static typing for JavaScript. This helps catch errors during development.',
      }
    ];

    for (const obs of testObservations) {
      const embedding = await embeddingService.embed(obs.text);
      const now = Date.now() * 1000; // Microseconds for Validity
      await db.run(`
        ?[id, created_at, entity_id, session_id, task_id, text, embedding, metadata] <- [[
          $id,
          $created_at,
          'test-entity',
          null,
          null,
          $text,
          $embedding,
          {}
        ]]
        :put observation {id, created_at => entity_id, session_id, task_id, text, embedding, metadata}
      `, { id: obs.id, created_at: now, text: obs.text, embedding });
    }

    console.log(`✓ Created ${testObservations.length} initial observations\n`);

    // Test 3: Add new observation and trigger evolution
    console.log('Test 3: Adding new observation with automatic evolution...');
    const newObsId = 'obs-4';
    const newObsText = 'Deep learning is a subset of machine learning that uses neural networks with multiple layers. Training requires substantial computational resources and large datasets.';
    const newObsEmbedding = await embeddingService.embed(newObsText);

    // Add to database
    const now = Date.now() * 1000; // Microseconds for Validity
    await db.run(`
      ?[id, created_at, entity_id, session_id, task_id, text, embedding, metadata] <- [[
        $id,
        $created_at,
        'test-entity',
        null,
        null,
        $text,
        $embedding,
        {}
      ]]
      :put observation {id, created_at => entity_id, session_id, task_id, text, embedding, metadata}
    `, { id: newObsId, created_at: now, text: newObsText, embedding: newObsEmbedding });

    // Trigger evolution
    const enrichmentResult = await zettelService.enrichObservation(
      newObsId,
      newObsText,
      newObsEmbedding,
      'test-entity'
    );

    console.log(`\nEnrichment Result:`);
    console.log(`  Observation ID: ${enrichmentResult.observationId}`);
    console.log(`  Extracted Keywords: ${enrichmentResult.extractedKeywords.join(', ')}`);
    console.log(`  Added Tags: ${enrichmentResult.addedTags.length > 0 ? enrichmentResult.addedTags.join(', ') : 'none'}`);
    console.log(`  Related Notes Found: ${enrichmentResult.relatedNotes.length}`);
    console.log(`  Bidirectional Links Created: ${enrichmentResult.createdLinks}`);
    console.log(`  Summary: ${enrichmentResult.evolutionSummary}\n`);

    if (enrichmentResult.relatedNotes.length > 0) {
      console.log(`Related Notes:`);
      for (const related of enrichmentResult.relatedNotes) {
        console.log(`  - ${related.observationId} (similarity: ${related.similarity.toFixed(3)})`);
        console.log(`    Type: ${related.connectionType}`);
        console.log(`    Reason: ${related.reason}`);
        console.log(`    Shared Keywords: ${related.sharedKeywords.join(', ') || 'none'}`);
        console.log(`    Text: ${related.text.substring(0, 80)}...`);
      }
      console.log();
    }

    // Test 4: Verify bidirectional links
    console.log('Test 4: Verifying bidirectional links...');
    const linksResult = await db.run(`
      ?[from_id, to_id, relation_type, strength] := 
        *relationship{from_id, to_id, relation_type, strength},
        relation_type == 'zettelkasten_link'
    `);

    console.log(`✓ Found ${linksResult.rows.length} zettelkasten links`);
    for (const [from, to, type, strength] of linksResult.rows) {
      console.log(`  ${from} → ${to} (strength: ${(strength as number).toFixed(3)})`);
    }
    console.log();

    // Test 5: Check metadata enrichment
    console.log('Test 5: Checking metadata enrichment...');
    const metadataResult = await db.run(`
      ?[id, metadata] := 
        *observation{id, metadata},
        metadata != null,
        get(metadata, "zettelkasten_enriched") == true
    `);

    console.log(`✓ ${metadataResult.rows.length} observations have been enriched`);
    for (const [id, metadata] of metadataResult.rows) {
      const meta = metadata as Record<string, any>;
      console.log(`  ${id}:`);
      if (meta.zettelkasten_keywords) {
        const keywords = JSON.parse(meta.zettelkasten_keywords as string);
        console.log(`    Keywords: ${keywords.join(', ')}`);
      }
      if (meta.zettelkasten_related) {
        const related = JSON.parse(meta.zettelkasten_related as string);
        console.log(`    Related: ${related.length} note(s)`);
      }
    }
    console.log();

    // Test 6: Get evolution statistics
    console.log('Test 6: Getting evolution statistics...');
    const stats = await zettelService.getEvolutionStats();
    console.log(`Total Observations: ${stats.totalObservations}`);
    console.log(`Enriched Observations: ${stats.enrichedObservations}`);
    console.log(`Total Zettelkasten Links: ${stats.totalLinks}`);
    console.log(`Average Links per Note: ${stats.averageLinksPerNote.toFixed(2)}`);
    console.log();

    // Test 7: Test keyword extraction
    console.log('Test 7: Testing keyword extraction...');
    const testTexts = [
      'Machine learning algorithms require training data',
      'The quick brown fox jumps over the lazy dog',
      'TypeScript TypeScript TypeScript is great for development development'
    ];

    for (const text of testTexts) {
      const keywords = (zettelService as any).extractKeywords(text);
      console.log(`Text: "${text.substring(0, 50)}..."`);
      console.log(`Keywords: ${keywords.join(', ') || 'none'}\n`);
    }

    // Test 8: Test tag extraction
    console.log('Test 8: Testing tag extraction...');
    const tagTexts = [
      'This is about #machinelearning and #ai',
      'Category: programming, Type: tutorial',
      'No tags here'
    ];

    for (const text of tagTexts) {
      const tags = (zettelService as any).extractTags(text);
      console.log(`Text: "${text}"`);
      console.log(`Tags: ${tags.join(', ') || 'none'}\n`);
    }

    // Test 9: Add another observation to see cascading evolution
    console.log('Test 9: Testing cascading evolution with another observation...');
    const cascadeObsId = 'obs-5';
    const cascadeObsText = 'Training neural networks requires backpropagation algorithm. Machine learning models learn from data patterns.';
    const cascadeObsEmbedding = await embeddingService.embed(cascadeObsText);

    const now2 = Date.now() * 1000; // Microseconds for Validity
    await db.run(`
      ?[id, created_at, entity_id, session_id, task_id, text, embedding, metadata] <- [[
        $id,
        $created_at,
        'test-entity',
        null,
        null,
        $text,
        $embedding,
        {}
      ]]
      :put observation {id, created_at => entity_id, session_id, task_id, text, embedding, metadata}
    `, { id: cascadeObsId, created_at: now2, text: cascadeObsText, embedding: cascadeObsEmbedding });

    const cascadeResult = await zettelService.enrichObservation(
      cascadeObsId,
      cascadeObsText,
      cascadeObsEmbedding,
      'test-entity'
    );

    console.log(`✓ Cascade enrichment completed`);
    console.log(`  Related Notes: ${cascadeResult.relatedNotes.length}`);
    console.log(`  New Links: ${cascadeResult.createdLinks}`);
    console.log(`  Keywords: ${cascadeResult.extractedKeywords.join(', ')}`);
    console.log();

    // Final stats
    const finalStats = await zettelService.getEvolutionStats();
    console.log('Final Statistics:');
    console.log(`  Total Observations: ${finalStats.totalObservations}`);
    console.log(`  Enriched: ${finalStats.enrichedObservations} (${(finalStats.enrichedObservations / finalStats.totalObservations * 100).toFixed(1)}%)`);
    console.log(`  Total Links: ${finalStats.totalLinks}`);
    console.log(`  Avg Links/Note: ${finalStats.averageLinksPerNote.toFixed(2)}`);
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
testZettelkastenEvolution().catch(console.error);
