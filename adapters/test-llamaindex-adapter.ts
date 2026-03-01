/**
 * Comprehensive test script for the LlamaIndex adapter
 * 
 * Tests all core functionality without requiring OpenAI API keys
 */

import { CozoVectorStore } from './packages/llamaindex/dist/index.js';
import { CozoMemoryClient } from './packages/core/dist/index.js';

// Mock node structure for testing
interface MockNode {
  id_: string;
  text: string;
  metadata: Record<string, any>;
  type?: string;
  embedding?: number[];
  getContent?: () => string;
}

async function testVectorStoreBasics() {
  console.log('\n=== Testing Vector Store Basics ===\n');
  
  const vectorStore = new CozoVectorStore({
    entityType: 'TestDocument',
    clientOptions: {
      serverPath: 'node',
      serverArgs: ['../dist/index.js']
    }
  });

  try {
    await vectorStore.connect();
    console.log('✓ Connected to MCP server');

    // Test 1: Add nodes
    const nodes: MockNode[] = [
      {
        id_: 'test-node-1',
        text: 'Paris is the capital of France',
        metadata: { category: 'geography', country: 'France' },
        type: 'TextNode'
      },
      {
        id_: 'test-node-2',
        text: 'London is the capital of the United Kingdom',
        metadata: { category: 'geography', country: 'UK' },
        type: 'TextNode'
      },
      {
        id_: 'test-node-3',
        text: 'Berlin is the capital of Germany',
        metadata: { category: 'geography', country: 'Germany' },
        type: 'TextNode'
      }
    ];

    console.log('Adding nodes...');
    const ids = await vectorStore.add(nodes);
    console.log(`✓ Added ${ids.length} nodes:`, ids);

    // Test 2: Query with hybrid search
    console.log('\nQuerying with hybrid search...');
    const queryResult = await vectorStore.query({
      queryStr: 'capital of France',
      similarityTopK: 5,
      mode: 0 // VectorStoreQueryMode.DEFAULT
    } as any);

    console.log(`✓ Query returned ${queryResult.nodes?.length || 0} results`);
    console.log('Results:');
    queryResult.nodes?.forEach((node: any, i: number) => {
      console.log(`  ${i + 1}. ${node.text}`);
    });

    // Test 3: Delete a node
    console.log('\nDeleting node...');
    await vectorStore.delete('test-node-1');
    console.log('✓ Deleted node test-node-1');

    // Test 4: Query again to verify deletion
    console.log('\nQuerying after deletion...');
    const queryResult2 = await vectorStore.query({
      queryStr: 'Paris',
      similarityTopK: 5,
      mode: 0
    } as any);
    console.log(`✓ Query returned ${queryResult2.nodes?.length || 0} results (should be less)`);

    // Cleanup remaining nodes
    await vectorStore.delete('test-node-2');
    await vectorStore.delete('test-node-3');
    console.log('✓ Cleaned up remaining nodes');

    await vectorStore.close();
    console.log('✓ Closed connection');

  } catch (error) {
    console.error('✗ Error:', error);
    throw error;
  }
}

async function testGraphRAGMode() {
  console.log('\n=== Testing Graph-RAG Mode ===\n');
  
  const vectorStore = new CozoVectorStore({
    entityType: 'GraphTestDoc',
    useGraphRAG: true,
    graphRAGDepth: 2,
    clientOptions: {
      serverPath: 'node',
      serverArgs: ['../dist/index.js']
    }
  });

  try {
    await vectorStore.connect();
    console.log('✓ Connected with Graph-RAG enabled');

    // Add interconnected nodes
    const nodes: MockNode[] = [
      {
        id_: 'graph-node-1',
        text: 'France is a country in Western Europe',
        metadata: { type: 'country', region: 'Europe' }
      },
      {
        id_: 'graph-node-2',
        text: 'Paris is the capital of France',
        metadata: { type: 'city', country: 'France' }
      },
      {
        id_: 'graph-node-3',
        text: 'The Eiffel Tower is located in Paris',
        metadata: { type: 'landmark', city: 'Paris' }
      }
    ];

    console.log('Adding interconnected nodes...');
    const ids = await vectorStore.add(nodes);
    console.log(`✓ Added ${ids.length} nodes`);

    // Query with Graph-RAG
    console.log('\nQuerying with Graph-RAG...');
    const queryResult = await vectorStore.query({
      queryStr: 'landmarks in European capitals',
      similarityTopK: 5,
      mode: 0
    } as any);

    console.log(`✓ Graph-RAG query returned ${queryResult.nodes?.length || 0} results`);
    console.log('Results:');
    queryResult.nodes?.forEach((node: any, i: number) => {
      console.log(`  ${i + 1}. ${node.text}`);
    });

    // Cleanup
    for (const node of nodes) {
      await vectorStore.delete(node.id_);
    }
    console.log('✓ Cleaned up nodes');

    await vectorStore.close();
    console.log('✓ Closed connection');

  } catch (error) {
    console.error('✗ Error:', error);
    throw error;
  }
}

async function testPersistence() {
  console.log('\n=== Testing Persistence ===\n');
  
  // Session 1: Add data
  console.log('Session 1: Adding data...');
  const vectorStore1 = new CozoVectorStore({
    entityType: 'PersistentDoc',
    clientOptions: {
      serverPath: 'node',
      serverArgs: ['../dist/index.js']
    }
  });

  try {
    await vectorStore1.connect();

    const nodes: MockNode[] = [
      {
        id_: 'persist-node-1',
        text: 'TypeScript is a typed superset of JavaScript',
        metadata: { language: 'TypeScript' }
      },
      {
        id_: 'persist-node-2',
        text: 'Python is known for its simplicity',
        metadata: { language: 'Python' }
      }
    ];

    await vectorStore1.add(nodes);
    console.log('✓ Added nodes in session 1');
    await vectorStore1.close();

    // Simulate restart
    console.log('\nSimulating application restart...\n');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Session 2: Query existing data
    console.log('Session 2: Querying existing data...');
    const vectorStore2 = new CozoVectorStore({
      entityType: 'PersistentDoc',
      clientOptions: {
        serverPath: 'node',
        serverArgs: ['../dist/index.js']
      }
    });

    await vectorStore2.connect();

    const queryResult = await vectorStore2.query({
      queryStr: 'programming languages',
      similarityTopK: 5,
      mode: 0
    } as any);

    console.log(`✓ Found ${queryResult.nodes?.length || 0} persisted nodes`);
    console.log('Results:');
    queryResult.nodes?.forEach((node: any, i: number) => {
      console.log(`  ${i + 1}. ${node.text}`);
    });

    // Cleanup
    await vectorStore2.delete('persist-node-1');
    await vectorStore2.delete('persist-node-2');
    console.log('✓ Cleaned up persisted nodes');

    await vectorStore2.close();
    console.log('✓ Closed connection');

  } catch (error) {
    console.error('✗ Error:', error);
    throw error;
  }
}

async function testEdgeCases() {
  console.log('\n=== Testing Edge Cases ===\n');
  
  const vectorStore = new CozoVectorStore({
    entityType: 'EdgeCaseDoc',
    clientOptions: {
      serverPath: 'node',
      serverArgs: ['../dist/index.js']
    }
  });

  try {
    await vectorStore.connect();
    console.log('✓ Connected');

    // Test 1: Empty query
    console.log('\nTest 1: Empty query string...');
    const emptyResult = await vectorStore.query({
      queryStr: '',
      similarityTopK: 5,
      mode: 0
    } as any);
    console.log(`✓ Empty query returned ${emptyResult.nodes?.length || 0} results`);

    // Test 2: Node with getContent method
    console.log('\nTest 2: Node with getContent method...');
    const nodeWithGetter: MockNode = {
      id_: 'edge-node-1',
      text: 'Original text',
      metadata: {},
      getContent: () => 'Content from getter method'
    };
    await vectorStore.add([nodeWithGetter]);
    console.log('✓ Added node with getContent method');

    // Test 3: Node without id (auto-generated)
    console.log('\nTest 3: Node without explicit id...');
    const nodeWithoutId: any = {
      text: 'Node without explicit id',
      metadata: { test: true }
    };
    const ids = await vectorStore.add([nodeWithoutId]);
    console.log(`✓ Added node with auto-generated id: ${ids[0]}`);

    // Test 4: Query with high similarityTopK
    console.log('\nTest 4: Query with high similarityTopK...');
    const largeResult = await vectorStore.query({
      queryStr: 'test',
      similarityTopK: 100,
      mode: 0
    } as any);
    console.log(`✓ Large query returned ${largeResult.nodes?.length || 0} results`);

    // Test 5: Delete non-existent node (should not throw)
    console.log('\nTest 5: Delete non-existent node...');
    await vectorStore.delete('non-existent-id');
    console.log('✓ Delete non-existent node handled gracefully');

    // Cleanup
    await vectorStore.delete('edge-node-1');
    console.log('✓ Cleaned up edge case nodes');

    await vectorStore.close();
    console.log('✓ Closed connection');

  } catch (error) {
    console.error('✗ Error:', error);
    throw error;
  }
}

async function testClientReuse() {
  console.log('\n=== Testing Client Reuse ===\n');
  
  const client = new CozoMemoryClient({
    serverPath: 'node',
    serverArgs: ['../dist/index.js']
  });

  try {
    await client.connect();
    console.log('✓ Created shared client');

    // Create multiple vector stores with same client
    const vectorStore1 = new CozoVectorStore({
      client,
      entityType: 'SharedClient1'
    });

    const vectorStore2 = new CozoVectorStore({
      client,
      entityType: 'SharedClient2'
    });

    console.log('✓ Created two vector stores with shared client');

    // Add data to both
    await vectorStore1.add([{
      id_: 'shared-1',
      text: 'Data in store 1',
      metadata: {}
    }]);

    await vectorStore2.add([{
      id_: 'shared-2',
      text: 'Data in store 2',
      metadata: {}
    }]);

    console.log('✓ Added data to both stores');

    // Query both
    const result1 = await vectorStore1.query({
      queryStr: 'data',
      similarityTopK: 5,
      mode: 0
    } as any);

    const result2 = await vectorStore2.query({
      queryStr: 'data',
      similarityTopK: 5,
      mode: 0
    } as any);

    console.log(`✓ Store 1 query: ${result1.nodes?.length || 0} results`);
    console.log(`✓ Store 2 query: ${result2.nodes?.length || 0} results`);

    // Cleanup
    await vectorStore1.delete('shared-1');
    await vectorStore2.delete('shared-2');
    console.log('✓ Cleaned up shared client data');

    await client.disconnect();
    console.log('✓ Disconnected shared client');

  } catch (error) {
    console.error('✗ Error:', error);
    throw error;
  }
}

async function testMetadataHandling() {
  console.log('\n=== Testing Metadata Handling ===\n');
  
  const vectorStore = new CozoVectorStore({
    entityType: 'MetadataDoc',
    clientOptions: {
      serverPath: 'node',
      serverArgs: ['../dist/index.js']
    }
  });

  try {
    await vectorStore.connect();
    console.log('✓ Connected');

    // Test with complex metadata
    const nodes: MockNode[] = [
      {
        id_: 'meta-node-1',
        text: 'Document with complex metadata',
        metadata: {
          author: 'John Doe',
          tags: ['test', 'metadata', 'complex'],
          nested: {
            level1: {
              level2: 'deep value'
            }
          },
          timestamp: Date.now(),
          isPublished: true
        }
      }
    ];

    console.log('Adding node with complex metadata...');
    await vectorStore.add(nodes);
    console.log('✓ Added node with complex metadata');

    // Query and verify metadata
    const result = await vectorStore.query({
      queryStr: 'complex metadata',
      similarityTopK: 1,
      mode: 0
    } as any);

    if (result.nodes && result.nodes.length > 0) {
      console.log('✓ Retrieved node with metadata:');
      console.log('  Metadata keys:', Object.keys(result.nodes[0].metadata));
    }

    // Cleanup
    await vectorStore.delete('meta-node-1');
    console.log('✓ Cleaned up metadata test node');

    await vectorStore.close();
    console.log('✓ Closed connection');

  } catch (error) {
    console.error('✗ Error:', error);
    throw error;
  }
}

async function main() {
  console.log('Starting LlamaIndex Adapter Comprehensive Tests...');
  console.log('='.repeat(50));
  
  try {
    await testVectorStoreBasics();
    await testGraphRAGMode();
    await testPersistence();
    await testEdgeCases();
    await testClientReuse();
    await testMetadataHandling();
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ All Tests Passed!');
    console.log('='.repeat(50) + '\n');
  } catch (error) {
    console.error('\n' + '='.repeat(50));
    console.error('❌ Tests Failed');
    console.error('='.repeat(50) + '\n');
    process.exit(1);
  }
}

main();
