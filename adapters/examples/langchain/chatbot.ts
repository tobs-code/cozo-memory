/**
 * Simple chatbot example using Cozo Memory for persistent chat history
 * 
 * This example demonstrates:
 * - Creating a chat history with Cozo Memory
 * - Using it with LangChain's ConversationChain
 * - Persistent memory across conversations
 */

import { CozoMemoryChatHistory } from '@cozo-memory/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';

async function main() {
  console.log('🤖 Chatbot with Cozo Memory\n');

  // Create chat history with Cozo Memory
  const chatHistory = new CozoMemoryChatHistory({
    sessionName: 'demo-chatbot',
    clientOptions: {
      // Optional: customize server path
      // serverPath: '/path/to/cozo-memory'
    }
  });

  // Create conversation chain
  const chain = new ConversationChain({
    llm: new ChatOpenAI({
      modelName: 'gpt-3.5-turbo',
      temperature: 0.7
    }),
    memory: new BufferMemory({
      chatHistory,
      returnMessages: true
    })
  });

  // First conversation
  console.log('User: My name is Alice and I love programming in TypeScript');
  const response1 = await chain.call({
    input: 'My name is Alice and I love programming in TypeScript'
  });
  console.log(`AI: ${response1.response}\n`);

  // Second conversation - AI should remember
  console.log('User: What is my name?');
  const response2 = await chain.call({
    input: 'What is my name?'
  });
  console.log(`AI: ${response2.response}\n`);

  // Third conversation - AI should remember preferences
  console.log('User: What programming language do I like?');
  const response3 = await chain.call({
    input: 'What programming language do I like?'
  });
  console.log(`AI: ${response3.response}\n`);

  // Get all messages from history
  const messages = await chatHistory.getMessages();
  console.log(`\n📝 Total messages in history: ${messages.length}`);

  // Close connection
  await chatHistory.close();
  console.log('\n✅ Done!');
}

main().catch(console.error);
