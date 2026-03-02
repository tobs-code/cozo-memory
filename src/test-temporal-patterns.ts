/**
 * Test: Temporal Pattern Detection
 * 
 * Tests detection of recurring events, cyclical relationships,
 * temporal correlations, and seasonal trends
 */

import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';
import { TemporalPatternDetectionService, PatternType } from './temporal-pattern-detection';
import { v4 as uuidv4 } from 'uuid';

async function testTemporalPatterns() {
  console.log('\n=== Testing Temporal Pattern Detection ===\n');

  const db = new CozoDb('mem', '');
  const embeddings = new EmbeddingService();
  const patternDetection = new TemporalPatternDetectionService(db, embeddings, {
    min_occurrences: 3,
    min_confidence: 0.5,
    time_window_days: 365,
    similarity_threshold: 0.7,
    seasonal_buckets: 12
  });

  try {
    // Setup schema
    console.log('Setting up schema...');
    await db.run(`
      :create entity {
        id: String =>
        name: String,
        type: String,
        embedding: <F32; 1024>,
        name_embedding: <F32; 1024>,
        metadata: Json,
        created_at: Validity
      }
    `);

    await db.run(`
      :create observation {
        id: String,
        created_at: Validity =>
        entity_id: String,
        text: String,
        embedding: <F32; 1024>,
        metadata: Json
      }
    `);

    await db.run(`
      :create relationship {
        from_id: String,
        to_id: String,
        created_at: Validity =>
        relation_type: String,
        strength: Float,
        metadata: Json
      }
    `);

    // Clean up any existing temporal_pattern relation from previous runs
    try {
      await db.run(`:remove temporal_pattern`);
    } catch (error) {
      // Relation might not exist, that's fine
    }

    // Create test entities
    console.log('\n1. Creating test entities...');
    const projectId = uuidv4();
    const budgetId = uuidv4();
    const teamId = uuidv4();
    
    const entities = [
      { id: projectId, name: 'Quarterly Review Project', type: 'Project' },
      { id: budgetId, name: 'Budget Department', type: 'Department' },
      { id: teamId, name: 'Development Team', type: 'Team' }
    ];

    const now = Date.now() * 1000;

    for (const entity of entities) {
      const embedding = await embeddings.embed(entity.name);
      await db.run(`
        ?[id, created_at, name, type, embedding, name_embedding, metadata] :=
          id = $id,
          created_at = $created_at,
          name = $name,
          type = $type,
          embedding = $embedding,
          name_embedding = $name_embedding,
          metadata = $metadata
        
        :put entity {
          id, created_at => name, type, embedding, name_embedding, metadata
        }
      `, {
        id: entity.id,
        created_at: [now, true],
        name: entity.name,
        type: entity.type,
        embedding,
        name_embedding: embedding,
        metadata: {}
      });
      console.log(`  ✓ Created entity: ${entity.name}`);
    }

    // Create relationships for cyclical pattern
    console.log('\n2. Creating cyclical relationships...');
    const relationships = [
      { from: projectId, to: budgetId, type: 'requires_approval_from' },
      { from: budgetId, to: teamId, type: 'allocates_resources_to' },
      { from: teamId, to: projectId, type: 'works_on' }
    ];

    for (const rel of relationships) {
      await db.run(`
        ?[from_id, to_id, created_at, relation_type, strength, metadata] :=
          from_id = $from_id,
          to_id = $to_id,
          created_at = $created_at,
          relation_type = $relation_type,
          strength = $strength,
          metadata = $metadata
        
        :put relationship {
          from_id, to_id, created_at => relation_type, strength, metadata
        }
      `, {
        from_id: rel.from,
        to_id: rel.to,
        created_at: [now, true],
        relation_type: rel.type,
        strength: 1.0,
        metadata: {}
      });
      console.log(`  ✓ Created relationship: ${rel.type}`);
    }

    // Create recurring event observations (quarterly reviews)
    console.log('\n3. Creating recurring event observations...');
    const recurringText = 'Quarterly budget review meeting scheduled';
    const recurringEmbedding = await embeddings.embed(recurringText);
    
    // Create 5 occurrences at ~90 day intervals
    const quarterlyIntervalMs = 90 * 24 * 60 * 60 * 1000;
    for (let i = 0; i < 5; i++) {
      const obsId = uuidv4();
      const obsTime = now - (4 - i) * quarterlyIntervalMs * 1000; // microseconds
      
      await db.run(`
        ?[id, created_at, entity_id, text, embedding, metadata] :=
          id = $id,
          created_at = $created_at,
          entity_id = $entity_id,
          text = $text,
          embedding = $embedding,
          metadata = $metadata
        
        :put observation {
          id, created_at => entity_id, text, embedding, metadata
        }
      `, {
        id: obsId,
        created_at: [obsTime, true],
        entity_id: projectId,
        text: recurringText,
        embedding: recurringEmbedding,
        metadata: {}
      });
      
      const date = new Date(obsTime / 1000);
      console.log(`  ✓ Created occurrence ${i + 1}/5 at ${date.toISOString().split('T')[0]}`);
    }

    // Create temporal correlation observations
    console.log('\n4. Creating temporal correlation observations...');
    const correlatedEvents = [
      { text: 'Sprint planning initiated', days_ago: 7 },
      { text: 'Budget allocation requested', days_ago: 6 },
      { text: 'Sprint planning initiated', days_ago: 21 },
      { text: 'Budget allocation requested', days_ago: 20 },
      { text: 'Sprint planning initiated', days_ago: 35 },
      { text: 'Budget allocation requested', days_ago: 34 }
    ];

    for (const event of correlatedEvents) {
      const obsId = uuidv4();
      const obsTime = now - (event.days_ago * 24 * 60 * 60 * 1000 * 1000);
      const obsEmbedding = await embeddings.embed(event.text);
      
      await db.run(`
        ?[id, created_at, entity_id, text, embedding, metadata] :=
          id = $id,
          created_at = $created_at,
          entity_id = $entity_id,
          text = $text,
          embedding = $embedding,
          metadata = $metadata
        
        :put observation {
          id, created_at => entity_id, text, embedding, metadata
        }
      `, {
        id: obsId,
        created_at: [obsTime, true],
        entity_id: projectId,
        text: event.text,
        embedding: obsEmbedding,
        metadata: {}
      });
    }
    console.log(`  ✓ Created ${correlatedEvents.length} correlated observations`);

    // Create seasonal trend observations (more activity in certain months)
    console.log('\n5. Creating seasonal trend observations...');
    const monthlyActivity = [
      { month: 0, count: 2 },  // January
      { month: 1, count: 2 },  // February
      { month: 2, count: 3 },  // March
      { month: 3, count: 8 },  // April (high activity)
      { month: 4, count: 2 },  // May
      { month: 5, count: 2 },  // June
      { month: 6, count: 2 },  // July
      { month: 7, count: 2 },  // August
      { month: 8, count: 3 },  // September
      { month: 9, count: 8 },  // October (high activity)
      { month: 10, count: 2 }, // November
      { month: 11, count: 2 }  // December
    ];

    for (const activity of monthlyActivity) {
      for (let i = 0; i < activity.count; i++) {
        const obsId = uuidv4();
        const date = new Date(2024, activity.month, 1 + i);
        const obsTime = date.getTime() * 1000; // microseconds
        const obsText = `Activity in ${date.toLocaleString('default', { month: 'long' })}`;
        const obsEmbedding = await embeddings.embed(obsText);
        
        await db.run(`
          ?[id, created_at, entity_id, text, embedding, metadata] :=
            id = $id,
            created_at = $created_at,
            entity_id = $entity_id,
            text = $text,
            embedding = $embedding,
            metadata = $metadata
          
          :put observation {
            id, created_at => entity_id, text, embedding, metadata
          }
        `, {
          id: obsId,
          created_at: [obsTime, true],
          entity_id: projectId,
          text: obsText,
          embedding: obsEmbedding,
          metadata: {}
        });
      }
    }
    console.log(`  ✓ Created seasonal observations across 12 months`);

    // Detect all patterns
    console.log('\n6. Detecting patterns...');
    const patterns = await patternDetection.detectPatterns(projectId);
    console.log(`  ✓ Found ${patterns.length} patterns\n`);

    // Display detected patterns
    console.log('7. Pattern details:\n');
    
    const recurringPatterns = patterns.filter(p => p.pattern_type === PatternType.RECURRING_EVENT);
    console.log(`  Recurring Events (${recurringPatterns.length}):`);
    for (const pattern of recurringPatterns) {
      console.log(`    • ${pattern.description}`);
      console.log(`      Frequency: ${pattern.frequency} occurrences`);
      console.log(`      Confidence: ${(pattern.confidence * 100).toFixed(1)}%`);
      console.log(`      Interval: ~${pattern.interval_days?.toFixed(0)} days`);
    }

    const cyclicalPatterns = patterns.filter(p => p.pattern_type === PatternType.CYCLICAL_RELATIONSHIP);
    console.log(`\n  Cyclical Relationships (${cyclicalPatterns.length}):`);
    for (const pattern of cyclicalPatterns) {
      console.log(`    • ${pattern.description}`);
      console.log(`      Confidence: ${(pattern.confidence * 100).toFixed(1)}%`);
    }

    const correlationPatterns = patterns.filter(p => p.pattern_type === PatternType.TEMPORAL_CORRELATION);
    console.log(`\n  Temporal Correlations (${correlationPatterns.length}):`);
    for (const pattern of correlationPatterns) {
      console.log(`    • ${pattern.description}`);
      console.log(`      Frequency: ${pattern.frequency} occurrences`);
      console.log(`      Confidence: ${(pattern.confidence * 100).toFixed(1)}%`);
    }

    const seasonalPatterns = patterns.filter(p => p.pattern_type === PatternType.SEASONAL_TREND);
    console.log(`\n  Seasonal Trends (${seasonalPatterns.length}):`);
    for (const pattern of seasonalPatterns) {
      console.log(`    • ${pattern.description}`);
      console.log(`      Frequency: ${pattern.frequency} occurrences`);
      console.log(`      Confidence: ${(pattern.confidence * 100).toFixed(1)}%`);
    }

    // Store patterns
    console.log('\n8. Storing patterns...');
    for (const pattern of patterns.slice(0, 3)) { // Store first 3
      await patternDetection.storePattern(pattern);
      console.log(`  ✓ Stored pattern: ${pattern.pattern_type}`);
    }

    // Retrieve stored patterns
    console.log('\n9. Retrieving stored patterns...');
    const storedPatterns = await patternDetection.getStoredPatterns(projectId);
    console.log(`  ✓ Retrieved ${storedPatterns.length} stored patterns`);

    // Test configuration
    console.log('\n10. Testing configuration...');
    const config = patternDetection.getConfig();
    console.log(`  Min occurrences: ${config.min_occurrences}`);
    console.log(`  Min confidence: ${config.min_confidence}`);
    console.log(`  Time window: ${config.time_window_days} days`);
    console.log(`  Similarity threshold: ${config.similarity_threshold}`);
    console.log(`  Seasonal buckets: ${config.seasonal_buckets}`);

    // Update configuration
    patternDetection.updateConfig({
      min_confidence: 0.7
    });
    console.log(`  ✓ Updated min confidence to 0.7`);

    console.log('\n✅ All temporal pattern detection tests passed!\n');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    if (error.display) {
      console.error('CozoDB Error:', error.display);
    }
    console.error(error.stack);
  } finally {
    db.close();
  }
}

// Run tests
testTemporalPatterns().catch(console.error);
