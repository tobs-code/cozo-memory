import { CozoDb } from 'cozo-node';

async function testMetadataUpdate() {
  console.log('=== Testing Metadata Update ===\n');

  const db = new CozoDb('sqlite', 'memory_db.cozo.db');

  try {
    const obsId = '0edaaeaa-5e3e-479e-a759-42227f59c868';

    // Get current metadata
    console.log('1. Current metadata:');
    const current = await db.run(`
      ?[id, metadata] := *observation{id, metadata, @ "NOW"}, id = $id
    `, { id: obsId });
    console.log('   ', JSON.stringify(current.rows[0][1], null, 2));
    console.log();

    // Try updating with concat
    console.log('2. Attempting update with concat...');
    try {
      await db.run(`
        ?[id, created_at, entity_id, session_id, task_id, text, embedding, metadata] := 
          *observation{id, created_at, entity_id, session_id, task_id, text, embedding, metadata, @ "NOW"},
          id = $id,
          new_metadata = {
            "zettelkasten_test": "value1",
            "zettelkasten_enriched": true
          },
          metadata = if(is_null(metadata), new_metadata, concat(metadata, new_metadata))
        
        :put observation {id, created_at => entity_id, session_id, task_id, text, embedding, metadata}
      `, { id: obsId });
      console.log('   Success!');
    } catch (error: any) {
      console.log('   Failed:', error.message);
    }
    console.log();

    // Check if it worked
    console.log('3. Metadata after concat attempt:');
    const after1 = await db.run(`
      ?[id, metadata] := *observation{id, metadata, @ "NOW"}, id = $id
    `, { id: obsId });
    console.log('   ', JSON.stringify(after1.rows[0][1], null, 2));
    console.log();

    // Try a different approach - merge manually
    console.log('4. Attempting update with manual merge...');
    try {
      const currentMeta = await db.run(`
        ?[metadata] := *observation{id, metadata, @ "NOW"}, id = $id
      `, { id: obsId });
      
      const existingMeta = currentMeta.rows[0][0] || {};
      const mergedMeta = {
        ...existingMeta,
        zettelkasten_test2: "value2",
        zettelkasten_enriched: true,
        zettelkasten_keywords: ["test", "keywords"]
      };

      await db.run(`
        ?[id, created_at, entity_id, session_id, task_id, text, embedding, metadata] := 
          *observation{id, created_at, entity_id, session_id, task_id, text, embedding, @ "NOW"},
          id = $id,
          metadata = $new_metadata
        
        :put observation {id, created_at => entity_id, session_id, task_id, text, embedding, metadata}
      `, { id: obsId, new_metadata: mergedMeta });
      console.log('   Success!');
    } catch (error: any) {
      console.log('   Failed:', error.message);
    }
    console.log();

    // Check final result
    console.log('5. Final metadata:');
    const final = await db.run(`
      ?[id, metadata] := *observation{id, metadata, @ "NOW"}, id = $id
    `, { id: obsId });
    console.log('   ', JSON.stringify(final.rows[0][1], null, 2));
    console.log();

    // Check if zettelkasten_enriched is now detectable
    console.log('6. Can we query for zettelkasten_enriched?');
    const enrichedCheck = await db.run(`
      ?[id] := 
        *observation{id, metadata, @ "NOW"},
        metadata != null,
        metadata->'zettelkasten_enriched' == true
    `);
    console.log(`   Found ${enrichedCheck.rows.length} enriched observations`);

  } catch (error) {
    console.error('Error:', error);
  }
}

testMetadataUpdate().catch(console.error);
