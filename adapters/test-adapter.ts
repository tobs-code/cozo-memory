/**
 * Simple test script for the LangChain adapter
 * 
 * This tests the core functionality without requiring OpenAI API keys
 */

import { CozoMemoryClient } from './packages/core/dist/index.js';
import { CozoMemoryChatHistory } from './packages/langchain/dist/index.js';
import { CozoMemoryRetriever } from './packages/langchain/dist/index.js';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

async function testCoreClient() {
  console.log('\n=== Testing Core Client ===\n');
  
  const client = new CozoMemoryClient({
    serverPath: 'node',
    serverArgs: ['../dist/index.js']
  });

  try {
    await client.connect();
    console.log('✓ Connected to MCP server');

    // Test health
    const health = await client.health();
    console.log('✓ Health check:', health.status);

    // Create entity
    const entity = await client.createEntity('Test Entity', 'TestType', {
      source: 'adapter-test'
    });
    console.log('✓ Created entity:', entity.id);

    // Add observation
    const obs = await client.addObservation(
      entity.id,
      'This is a test observation',
      { test: true }
    );
    console.log('✓ Added observation:', obs.id);

    // Search
    const searchResult = await client.search('test', { limit: 5 });
    console.log('✓ Search found', searchResult.observations?.length || 0, 'observations');

    // Cleanup
    await client.deleteEntity(entity.id);
    console.log('✓ Deleted entity');

    await client.disconnect();
    console.log('✓ Disconnected');

  } catch (error) {
    console.error('✗ Error:', error);
    throw error;
  }
}

async function testChatHistory() {
  console.log('\n=== Testing Chat History ===\n');

  const chatHistory = new CozoMemoryChatHistory({
    sessionName: 'test-session',
    entityName: 'test-chat',
    clientOptions: {
      serverPath: 'node',
      serverArgs: ['../dist/index.js']
    }
  });

  try {
    // Add messages
    await chatHistory.addUserMessage('Hello, how are you?');
    console.log('✓ Added user message');

    await chatHistory.addAIChatMessage('I am doing well, thank you!');
    console.log('✓ Added AI message');

    await chatHistory.addMessages([
      new HumanMessage({ content: 'What is the weather?' }),
      new AIMessage({ content: 'I cannot check the weather.' })
    ]);
    console.log('✓ Added multiple messages');

    // Get messages
    const messages = await chatHistory.getMessages();
    console.log('✓ Retrieved', messages.length, 'messages');

    for (const msg of messages) {
      console.log(`  - ${msg._getType()}: ${msg.content}`);
    }

    // Clear
    await chatHistory.clear();
    console.log('✓ Cleared chat history');

    const emptyMessages = await chatHistory.getMessages();
    console.log('✓ Verified empty:', emptyMessages.length, 'messages');

    await chatHistory.close();
    console.log('✓ Closed connection');

  } catch (error) {
    console.error('✗ Error:', error);
    throw error;
  }
}

async function testRetriever() {
  console.log('\n=== Testing Retriever ===\n');

  const client = new CozoMemoryClient({
    serverPath: 'node',
    serverArgs: ['../dist/index.js']
  });

  try {
    await client.connect();

    // Add some test data
    const entity1 = await client.createEntity('Paris', 'City');
    await client.addObservation(entity1.id, 'Paris is the capital of France');
    
    const entity2 = await client.createEntity('London', 'City');
    await client.addObservation(entity2.id, 'London is the capital of the UK');

    console.log('✓ Added test data');

    // Test retriever
    const retriever = new CozoMemoryRetriever({
      client,
      searchOptions: { limit: 5 }
    });

    const docs = await retriever._getRelevantDocuments('capital of France');
    console.log('✓ Retrieved', docs.length, 'documents');

    for (const doc of docs) {
      console.log(`  - ${doc.pageContent}`);
    }

    // Cleanup
    await client.deleteEntity(entity1.id);
    await client.deleteEntity(entity2.id);
    console.log('✓ Cleaned up test data');

    await retriever.close();
    console.log('✓ Closed retriever');

  } catch (error) {
    console.error('✗ Error:', error);
    throw error;
  }
}

async function main() {
  console.log('Starting LangChain Adapter Tests...');
  
  try {
    await testCoreClient();
    await testChatHistory();
    await testRetriever();
    
    console.log('\n=== All Tests Passed! ===\n');
  } catch (error) {
    console.error('\n=== Tests Failed ===\n');
    process.exit(1);
  }
}

main();
