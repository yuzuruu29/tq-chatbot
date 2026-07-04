// TQ ChatBot #1 - Message Persistence Service
// Abstraction layer for chat message storage

import { v4 as uuidv4 } from "uuid";
import type { ChatMessage, ChatSession, VisitorContext } from "../types";
import { supabaseService } from "../lib/supabase";

// In-memory storage for development when Supabase is not configured
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

// Supabase-based storage implementation
class SupabaseStorage {
  async createSession(context: VisitorContext): Promise<ChatSession> {
    const client = supabaseService.getClient();
    const session: Omit<ChatSession, "id" | "created_at" | "updated_at"> = {
      visitor_id: context.visitor_id,
      tenant_id: context.tenant_id,
      status: "active",
      lead_id: undefined,
      current_step: undefined
    };

    const { data, error } = await client
      .from("chat_sessions")
      .insert(session)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }

    return data as ChatSession;
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    const client = supabaseService.getClient();
    const { data, error } = await client
      .from("chat_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (error || !data) {
      return null;
    }
    return data as ChatSession;
  }

  async updateSession(session: ChatSession): Promise<ChatSession> {
    const client = supabaseService.getClient();
    const { data, error } = await client
      .from("chat_sessions")
      .update({
        status: session.status,
        lead_id: session.lead_id,
        current_step: session.current_step,
        updated_at: new Date().toISOString()
      })
      .eq("id", session.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update session: ${error.message}`);
    }
    return data as ChatSession;
  }

  async createMessage(message: Omit<ChatMessage, "id" | "timestamp">): Promise<ChatMessage> {
    const client = supabaseService.getClient();
    const chatMessage: Omit<ChatMessage, "id" | "timestamp"> = {
      ...message
    };

    const { data, error } = await client
      .from("chat_messages")
      .insert(chatMessage)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create message: ${error.message}`);
    }
    return data as ChatMessage;
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const client = supabaseService.getClient();
    const { data, error } = await client
      .from("chat_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("timestamp", { ascending: true });

    if (error) {
      throw new Error(`Failed to get messages: ${error.message}`);
    }
    return data as ChatMessage[];
  }

  async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    return this.getMessages(sessionId);
  }
}

// Message Service - main abstraction
export class MessageService {
  private storage: InMemoryStorage | SupabaseStorage;
  private static instance: MessageService;

  private constructor() {
    // Use Supabase if initialized, otherwise fall back to in-memory
    this.storage = supabaseService.isInitialized() ? new SupabaseStorage() : new InMemoryStorage();
  }

  public static getInstance(): MessageService {
    if (!MessageService.instance) {
      MessageService.instance = new MessageService();
    }
    return MessageService.instance;
  }

  public async createSession(context: VisitorContext): Promise<ChatSession> {
    return this.storage.createSession(context);
  }

  public async getSession(sessionId: string): Promise<ChatSession | null> {
    return this.storage.getSession(sessionId);
  }

  public async updateSession(session: ChatSession): Promise<ChatSession> {
    return this.storage.updateSession(session);
  }

  public async createMessage(message: Omit<ChatMessage, "id" | "timestamp">): Promise<ChatMessage> {
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
    this.storage = supabaseService.isInitialized() ? new SupabaseStorage() : new InMemoryStorage();
  }
}

// Export singleton instance
export const messageService = MessageService.getInstance();
