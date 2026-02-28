import { MemoryServer } from './index';
import * as fs from 'fs';
import * as path from 'path';

async function testExportImport() {
  console.log('=== Export/Import Test ===\n');

  const server = new MemoryServer('test_export_import.cozo');
  await server.initPromise;

  try {
    // 1. Create test data
    console.log('1. Creating test data...');
    const alice = await server.createEntity({ name: 'Alice', type: 'Person', metadata: { role: 'Developer' } });
    const project = await server.createEntity({ name: 'Project X', type: 'Project', metadata: { status: 'active' } });
    
    await server.addObservation({ 
      entity_id: (alice as any).id, 
      text: 'Alice is working on the feature flag system.' 
    });
    
    await server.createRelation({ 
      from_id: (alice as any).id, 
      to_id: (project as any).id, 
      relation_type: 'works_on', 
      strength: 1.0 
    });
    
    console.log('✓ Test data created\n');

    // 2. Test JSON Export
    console.log('2. Testing JSON export...');
    const jsonExport = await server.exportMemory({ format: 'json' });
    console.log(`✓ JSON export: ${jsonExport.stats.entities} entities, ${jsonExport.stats.observations} observations`);
    
    // Save to file
    fs.writeFileSync('export_test.json', JSON.stringify(jsonExport.data, null, 2));
    console.log('✓ Saved to export_test.json\n');

    // 3. Test Markdown Export
    console.log('3. Testing Markdown export...');
    const mdExport = await server.exportMemory({ format: 'markdown' });
    fs.writeFileSync('export_test.md', mdExport.data as string);
    console.log('✓ Saved to export_test.md\n');

    // 4. Test Obsidian ZIP Export
    console.log('4. Testing Obsidian ZIP export...');
    const obsidianExport = await server.exportMemory({ format: 'obsidian' });
    if (obsidianExport.zipBuffer) {
      fs.writeFileSync('export_test_obsidian.zip', obsidianExport.zipBuffer);
      console.log('✓ Saved to export_test_obsidian.zip\n');
    }

    // 5. Test Import from JSON (Cozo format)
    console.log('5. Testing import from Cozo JSON...');
    const importData = JSON.parse(fs.readFileSync('export_test.json', 'utf-8'));
    
    // Create new server instance for import test
    const server2 = new MemoryServer('test_import.cozo');
    await server2.initPromise;
    
    const importResult = await server2.importMemory({
      data: importData,
      sourceFormat: 'cozo',
      mergeStrategy: 'skip'
    });
    
    console.log(`✓ Import result: ${importResult.imported.entities} entities, ${importResult.imported.observations} observations, ${importResult.imported.relationships} relationships`);
    if (importResult.errors.length > 0) {
      console.log('Errors:', importResult.errors);
    }
    console.log('');

    // 6. Test Mem0 format import
    console.log('6. Testing Mem0 format import...');
    const mem0Data = [
      {
        id: 'mem0-1',
        memory: 'User prefers TypeScript over JavaScript',
        user_id: 'developer_123',
        metadata: { category: 'preference' },
        created_at: Date.now()
      },
      {
        id: 'mem0-2',
        memory: 'User works on backend systems',
        user_id: 'developer_123',
        metadata: { category: 'work' },
        created_at: Date.now()
      }
    ];
    
    const mem0Import = await server2.importMemory({
      data: mem0Data,
      sourceFormat: 'mem0',
      defaultEntityType: 'Person'
    });
    
    console.log(`✓ Mem0 import: ${mem0Import.imported.entities} entities, ${mem0Import.imported.observations} observations`);
    console.log('');

    // 7. Test Markdown import
    console.log('7. Testing Markdown import...');
    const markdownData = `
## Bob
- Bob is a senior engineer
- Bob mentors junior developers

## Carol
- Carol leads the design team
- Carol specializes in UX research
    `;
    
    const mdImport = await server2.importMemory({
      data: markdownData,
      sourceFormat: 'markdown',
      defaultEntityType: 'Person'
    });
    
    console.log(`✓ Markdown import: ${mdImport.imported.entities} entities, ${mdImport.imported.observations} observations`);
    console.log('');

    console.log('=== All Tests Passed ===');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Cleanup
    try {
      fs.unlinkSync('test_export_import.cozo.db');
      fs.unlinkSync('test_import.cozo.db');
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

testExportImport().catch(console.error);
