// TQ ChatBot #1 - Message Persistence Service
// Abstraction layer for chat message storage.
//
// Write path: Edge Function (service-role key) → Supabase → in-memory fallback.
// Read path:  In-memory (always fast; Supabase reads are for dashboard only).

import { v4 as uuidv4 } from "uuid";
import type { ChatMessage, ChatSession, VisitorContext } from "../types";
import { supabaseService } from "../lib/supabase";
import { edgeCreateSession, edgeCreateMessage } from "../lib/edgeClient";

// In-memory storage for development when Edge Function is not available
class InMemoryStorage {
  private sessions: Map<string, ChatSession> = new Map();
  private messages: Map<string, ChatMessage[]> = new Map();

  async createSession(context: VisitorContext): Promise<ChatSession> {
    const session: ChatSession = {
      id: uuidv4(),
      visitor_id: context.visitor_id,
      tenant_id: context.tenant_id,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  async updateSession(session: ChatSession): Promise<ChatSession> {
    session.updated_at = new Date().toISOString();
    this.sessions.set(session.id, session);
    return session;
  }

  async createMessage(message: Omit<ChatMessage, "id" | "timestamp">): Promise<ChatMessage> {
    const chatMessage: ChatMessage = {
      ...message,
      id: uuidv4(),
      timestamp: new Date().toISOString()
    };

    if (!this.messages.has(message.session_id)) {
      this.messages.set(message.session_id, []);
    }
    this.messages.get(message.session_id)?.push(chatMessage);
    return chatMessage;
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    return this.messages.get(sessionId) || [];
  }

  async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    return this.getMessages(sessionId);
  }
}

// Message Service - main abstraction
export class MessageService {
  private storage: InMemoryStorage;
  private static instance: MessageService;
  private edgeAvailable: boolean;

  private constructor() {
    this.storage = new InMemoryStorage();
    // Edge Function availability is checked lazily on first write.
    // In dev mode (no Supabase configured), we never attempt Edge calls.
    this.edgeAvailable = supabaseService.isInitialized();
  }

  public static getInstance(): MessageService {
    if (!MessageService.instance) {
      MessageService.instance = new MessageService();
    }
    return MessageService.instance;
  }

  /**
   * Create a session.
   * Tries Edge Function first (persists to Supabase), falls back to in-memory.
   */
  public async createSession(context: VisitorContext): Promise<ChatSession> {
    if (this.edgeAvailable) {
      const edgeSession = await edgeCreateSession(context.visitor_id, context.tenant_id);
      if (edgeSession) {
        // Also store locally for fast reads
        this.storage.createSession(context);
        return edgeSession;
      }
      // Edge Function unavailable — fall through to in-memory
      this.edgeAvailable = false;
    }
    return this.storage.createSession(context);
  }

  public async getSession(sessionId: string): Promise<ChatSession | null> {
    return this.storage.getSession(sessionId);
  }

  public async updateSession(session: ChatSession): Promise<ChatSession> {
    return this.storage.updateSession(session);
  }

  /**
   * Create a message.
   * Tries Edge Function first (with server-side idempotency + rate limiting),
   * falls back to in-memory.
   */
  public async createMessage(message: Omit<ChatMessage, "id" | "timestamp">): Promise<ChatMessage> {
    if (this.edgeAvailable) {
      // We need tenant_id for the Edge Function. Look it up from the session.
      const session = await this.storage.getSession(message.session_id);
      const tenantId = session?.tenant_id || "00000000-0000-0000-0000-000000000000";

      const edgeResult = await edgeCreateMessage(
        message.session_id,
        message.content,
        message.role,
        tenantId
      );

      if (edgeResult) {
        if (edgeResult.duplicate) {
          // Server detected duplicate — return existing message without re-persisting locally
          return edgeResult.message;
        }
        // Also store locally for fast reads
        this.storage.createMessage(message);
        return edgeResult.message;
      }
      // Edge Function unavailable — fall through to in-memory
    }
    return this.storage.createMessage(message);
  }

  public async getMessages(sessionId: string): Promise<ChatMessage[]> {
    return this.storage.getMessages(sessionId);
  }

  public async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    return this.storage.getSessionMessages(sessionId);
  }

  // Reinitialize storage based on Supabase status
  public reinitializeStorage(): void {
    this.edgeAvailable = supabaseService.isInitialized();
  }
}

// Export singleton instance
export const messageService = MessageService.getInstance();
