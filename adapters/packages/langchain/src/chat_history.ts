import { BaseChatMessageHistory } from '@langchain/core/chat_history';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
  FunctionMessage,
  ToolMessage
} from '@langchain/core/messages';
import { CozoMemoryClient, type Entity, type Observation } from '@cozo-memory/adapters-core';

export interface CozoMemoryChatHistoryOptions {
  /**
   * Session ID for this chat history
   * If not provided, a new session will be created
   */
  sessionId?: string;
  
  /**
   * Session name (used when creating a new session)
   */
  sessionName?: string;
  
  /**
   * Entity ID to store messages under
   * If not provided, a new entity will be created for the session
   */
  entityId?: string;
  
  /**
   * Entity name (used when creating a new entity)
   */
  entityName?: string;
  
  /**
   * Cozo Memory client instance
   * If not provided, a new client will be created
   */
  client?: CozoMemoryClient;
  
  /**
   * Options for creating a new client (if client not provided)
   */
  clientOptions?: {
    serverPath?: string;
    serverArgs?: string[];
    env?: Record<string, string>;
  };
}

/**
 * LangChain chat history implementation using Cozo Memory
 * 
 * Stores chat messages as observations in Cozo Memory, enabling:
 * - Persistent chat history across sessions
 * - Semantic search over conversation history
 * - Graph-based reasoning over conversations
 * - Time-travel queries to see conversation at any point
 * 
 * @example
 * ```typescript
 * import { CozoMemoryChatHistory } from '@cozo-memory/langchain';
 * import { ChatOpenAI } from '@langchain/openai';
 * import { ConversationChain } from 'langchain/chains';
 * 
 * const chatHistory = new CozoMemoryChatHistory({
 *   sessionName: 'user-123-chat'
 * });
 * 
 * const chain = new ConversationChain({
 *   llm: new ChatOpenAI(),
 *   memory: new BufferMemory({
 *     chatHistory
 *   })
 * });
 * 
 * await chain.call({ input: 'Hello!' });
 * ```
 */
export class CozoMemoryChatHistory extends BaseChatMessageHistory {
  lc_namespace = ['cozo-memory', 'chat_history'];
  
  private client: CozoMemoryClient;
  private sessionId?: string;
  private entityId?: string;
  private initialized: boolean = false;
  private options: CozoMemoryChatHistoryOptions;

  constructor(options: CozoMemoryChatHistoryOptions = {}) {
    super();
    this.options = options;
    this.sessionId = options.sessionId;
    this.entityId = options.entityId;
    
    // Create or use provided client
    this.client = options.client || new CozoMemoryClient(options.clientOptions);
  }

  /**
   * Initialize the chat history (create session/entity if needed)
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.client.connect();

    // Create session if not provided
    if (!this.sessionId) {
      const session = await this.client.startSession(
        this.options.sessionName || 'langchain-chat',
        { source: 'langchain' }
      );
      this.sessionId = session.id;
    }

    // Create entity if not provided
    if (!this.entityId) {
      const entity = await this.client.createEntity(
        this.options.entityName || `chat-${this.sessionId}`,
        'ChatHistory',
        {
          session_id: this.sessionId,
          source: 'langchain'
        }
      );
      this.entityId = entity.id;
    }

    this.initialized = true;
  }

  /**
   * Convert BaseMessage to observation text
   */
  private messageToText(message: BaseMessage): string {
    const role = message._getType();
    const content = typeof message.content === 'string' 
      ? message.content 
      : JSON.stringify(message.content);
    
    return `[${role}] ${content}`;
  }

  /**
   * Convert observation to BaseMessage
   */
  private textToMessage(text: string, metadata: Record<string, any>): BaseMessage {
    const roleMatch = text.match(/^\[(\w+)\]\s*/);
    const role = roleMatch ? roleMatch[1] : 'human';
    const content = roleMatch ? text.slice(roleMatch[0].length) : text;

    switch (role) {
      case 'human':
        return new HumanMessage({ content, additional_kwargs: metadata });
      case 'ai':
        return new AIMessage({ content, additional_kwargs: metadata });
      case 'system':
        return new SystemMessage({ content, additional_kwargs: metadata });
      case 'function':
        return new FunctionMessage({ 
          content, 
          name: metadata.function_name || 'unknown',
          additional_kwargs: metadata 
        });
      case 'tool':
        return new ToolMessage({ 
          content, 
          tool_call_id: metadata.tool_call_id || 'unknown',
          additional_kwargs: metadata 
        });
      default:
        return new HumanMessage({ content, additional_kwargs: metadata });
    }
  }

  /**
   * Get all messages from the chat history
   */
  async getMessages(): Promise<BaseMessage[]> {
    await this.initialize();

    // Get entity details which includes all observations
    const entity = await this.client.getEntity(this.entityId!);
    
    if (!entity.observations || entity.observations.length === 0) {
      return [];
    }

    // Convert observations to messages and sort by creation time
    const messages = entity.observations
      .sort((a: any, b: any) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeA - timeB;
      })
      .map((obs: any) => this.textToMessage(obs.text, obs.metadata || {}));

    return messages;
  }

  /**
   * Add messages to the chat history
   */
  async addMessages(messages: BaseMessage[]): Promise<void> {
    await this.initialize();

    for (const message of messages) {
      const text = this.messageToText(message);
      const metadata = {
        role: message._getType(),
        ...message.additional_kwargs
      };

      await this.client.addObservation(
        this.entityId!,
        text,
        metadata,
        this.sessionId
      );
    }
  }

  /**
   * Add a single message to the chat history
   */
  async addMessage(message: BaseMessage): Promise<void> {
    await this.addMessages([message]);
  }

  /**
   * Add a user message to the chat history
   */
  async addUserMessage(message: string): Promise<void> {
    await this.addMessage(new HumanMessage({ content: message }));
  }

  /**
   * Add an AI message to the chat history
   */
  async addAIChatMessage(message: string): Promise<void> {
    await this.addMessage(new AIMessage({ content: message }));
  }

  /**
   * Clear all messages from the chat history
   */
  async clear(): Promise<void> {
    await this.initialize();

    // Delete the entity (which deletes all observations)
    if (this.entityId) {
      await this.client.deleteEntity(this.entityId);
      
      // Recreate the entity
      const entity = await this.client.createEntity(
        this.options.entityName || `chat-${this.sessionId}`,
        'ChatHistory',
        {
          session_id: this.sessionId,
          source: 'langchain'
        }
      );
      this.entityId = entity.id;
    }
  }

  /**
   * Close the connection to Cozo Memory
   */
  async close(): Promise<void> {
    if (this.sessionId) {
      await this.client.stopSession(this.sessionId);
    }
    await this.client.disconnect();
  }
}
