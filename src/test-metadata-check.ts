import { CozoDb } from 'cozo-node';

async function checkMetadata() {
  console.log('=== Checking Zettelkasten Metadata ===\n');

  const db = new CozoDb('sqlite', 'memory_db.cozo.db');

  try {
    // Check all observations with any metadata
    console.log('1. All observations with metadata:');
    const allMeta = await db.run(`
      ?[id, metadata] := *observation{id, metadata, @ "NOW"}, metadata != null
      :limit 10
    `);
    console.log(`   Found ${allMeta.rows.length} observations with metadata`);
    allMeta.rows.forEach((row: any, i: number) => {
      console.log(`   ${i + 1}. ${row[0]}`);
      console.log(`      Metadata:`, JSON.stringify(row[1], null, 2));
    });
    console.log();

    // Check specifically for zettelkasten_enriched
    console.log('2. Observations with zettelkasten_enriched flag:');
    const enriched = await db.run(`
      ?[id, metadata] := 
        *observation{id, metadata, @ "NOW"},
        metadata != null,
        metadata->'zettelkasten_enriched' == true
      :limit 10
    `);
    console.log(`   Found ${enriched.rows.length} enriched observations`);
    enriched.rows.forEach((row: any, i: number) => {
      console.log(`   ${i + 1}. ${row[0]}`);
      console.log(`      Metadata:`, JSON.stringify(row[1], null, 2));
    });
    console.log();

    // Check the specific observation we enriched in the test
    console.log('3. Check specific observation from test:');
    const specific = await db.run(`
      ?[id, text, metadata] := 
        *observation{id, text, metadata, @ "NOW"},
        text = "Likes clean code and best practices"
    `);
    if (specific.rows.length > 0) {
      console.log(`   ID: ${specific.rows[0][0]}`);
      console.log(`   Text: ${specific.rows[0][1]}`);
      console.log(`   Metadata:`, JSON.stringify(specific.rows[0][2], null, 2));
    } else {
      console.log('   Not found');
    }
    console.log();

    // Check zettelkasten links
    console.log('4. Zettelkasten links:');
    const links = await db.run(`
      ?[from_id, to_id, strength, metadata] := 
        *relationship{from_id, to_id, relation_type, strength, metadata, @ "NOW"},
        relation_type == 'zettelkasten_link'
      :limit 10
    `);
    console.log(`   Found ${links.rows.length} zettelkasten links`);
    links.rows.slice(0, 3).forEach((row: any, i: number) => {
      console.log(`   ${i + 1}. ${row[0]} -> ${row[1]} (strength: ${row[2]})`);
      console.log(`      Metadata:`, JSON.stringify(row[3], null, 2));
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

checkMetadata().catch(console.error);
