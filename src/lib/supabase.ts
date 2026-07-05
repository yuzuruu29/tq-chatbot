// TQ ChatBot #1 - Supabase Client Configuration
// Uses ONLY the anon key (safe for browser).
// Service-role key is NEVER exposed to the client — it lives in Edge Functions.

import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

// Client-safe environment variables (VITE_ prefix = browser-exposed)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://your-project-ref.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "your-anon-key";

// Create Supabase client with anon key only.
// RLS policies protect data; service-role writes happen in Edge Functions.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type definitions for our database tables
// These should match the schema defined in supabase/schema.sql
export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          calendly_url: string | null;
          nurture_email_template: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<{
          id: string;
          name: string;
          calendly_url: string | null;
          nurture_email_template: string | null;
          created_at: string;
          updated_at: string;
        }, "id" | "created_at" | "updated_at">;
        Update: Partial<{
          id: string;
          name: string;
          calendly_url: string | null;
          nurture_email_template: string | null;
          created_at: string;
          updated_at: string;
        }>;
      };
      leads: {
        Row: {
          id: string;
          tenant_id: string;
          session_id: string;
          visitor_id: string;
          score: "low" | "medium" | "high";
          route: "calendly" | "soft_booking" | "nurture" | "helpful_guidance";
          signals: Record<string, unknown>;
          contact_info: Record<string, unknown>;
          scoring_result: Record<string, unknown>;
          status: "new" | "contacted" | "booked" | "converted" | "rejected";
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<{
          id: string;
          tenant_id: string;
          session_id: string;
          visitor_id: string;
          score: "low" | "medium" | "high";
          route: "calendly" | "soft_booking" | "nurture" | "helpful_guidance";
          signals: Record<string, unknown>;
          contact_info: Record<string, unknown>;
          scoring_result: Record<string, unknown>;
          status: "new" | "contacted" | "booked" | "converted" | "rejected";
          created_at: string;
          updated_at: string;
        }, "id" | "created_at" | "updated_at">;
        Update: Partial<{
          id: string;
          tenant_id: string;
          session_id: string;
          visitor_id: string;
          score: "low" | "medium" | "high";
          route: "calendly" | "soft_booking" | "nurture" | "helpful_guidance";
          signals: Record<string, unknown>;
          contact_info: Record<string, unknown>;
          scoring_result: Record<string, unknown>;
          status: "new" | "contacted" | "booked" | "converted" | "rejected";
          created_at: string;
          updated_at: string;
        }>;
      };
      chat_sessions: {
        Row: {
          id: string;
          visitor_id: string;
          tenant_id: string;
          status: "active" | "completed" | "abandoned";
          created_at: string;
          updated_at: string;
          lead_id: string | null;
          current_step: string | null;
        };
        Insert: Omit<{
          id: string;
          visitor_id: string;
          tenant_id: string;
          status: "active" | "completed" | "abandoned";
          created_at: string;
          updated_at: string;
          lead_id: string | null;
          current_step: string | null;
        }, "id" | "created_at" | "updated_at">;
        Update: Partial<{
          id: string;
          visitor_id: string;
          tenant_id: string;
          status: "active" | "completed" | "abandoned";
          created_at: string;
          updated_at: string;
          lead_id: string | null;
          current_step: string | null;
        }>;
      };
      chat_messages: {
        Row: {
          id: string;
          session_id: string;
          content: string;
          role: "user" | "assistant" | "system";
          timestamp: string;
          metadata: Record<string, unknown> | null;
        };
        Insert: Omit<{
          id: string;
          session_id: string;
          content: string;
          role: "user" | "assistant" | "system";
          timestamp: string;
          metadata: Record<string, unknown> | null;
        }, "id" | "timestamp">;
        Update: Partial<{
          id: string;
          session_id: string;
          content: string;
          role: "user" | "assistant" | "system";
          timestamp: string;
          metadata: Record<string, unknown> | null;
        }>;
      };
      lead_scoring_signals: {
        Row: {
          id: string;
          lead_id: string;
          signal_type: string;
          value: boolean | number;
          confidence: number;
          source: "manual" | "llm" | "deterministic";
          timestamp: string;
        };
        Insert: Omit<{
          id: string;
          lead_id: string;
          signal_type: string;
          value: boolean | number;
          confidence: number;
          source: "manual" | "llm" | "deterministic";
          timestamp: string;
        }, "id" | "timestamp">;
        Update: Partial<{
          id: string;
          lead_id: string;
          signal_type: string;
          value: boolean | number;
          confidence: number;
          source: "manual" | "llm" | "deterministic";
          timestamp: string;
        }>;
      };
      funnel_events: {
        Row: {
          id: string;
          tenant_id: string;
          session_id: string;
          lead_id: string | null;
          event_type: string;
          data: Record<string, unknown>;
          timestamp: string;
        };
        Insert: Omit<{
          id: string;
          tenant_id: string;
          session_id: string;
          lead_id: string | null;
          event_type: string;
          data: Record<string, unknown>;
          timestamp: string;
        }, "id" | "timestamp">;
        Update: Partial<{
          id: string;
          tenant_id: string;
          session_id: string;
          lead_id: string | null;
          event_type: string;
          data: Record<string, unknown>;
          timestamp: string;
        }>;
      };
      followup_jobs: {
        Row: {
          id: string;
          lead_id: string;
          tenant_id: string;
          job_type: "email" | "sms" | "calendly_reminder" | "nurture_sequence";
          status: "pending" | "completed" | "failed";
          scheduled_at: string;
          completed_at: string | null;
          payload: Record<string, unknown>;
          created_at: string;
        };
        Insert: Omit<{
          id: string;
          lead_id: string;
          tenant_id: string;
          job_type: "email" | "sms" | "calendly_reminder" | "nurture_sequence";
          status: "pending" | "completed" | "failed";
          scheduled_at: string;
          completed_at: string | null;
          payload: Record<string, unknown>;
          created_at: string;
        }, "id" | "created_at">;
        Update: Partial<{
          id: string;
          lead_id: string;
          tenant_id: string;
          job_type: "email" | "sms" | "calendly_reminder" | "nurture_sequence";
          status: "pending" | "completed" | "failed";
          scheduled_at: string;
          completed_at: string | null;
          payload: Record<string, unknown>;
          created_at: string;
        }>;
      };
    };
  };
};

// Safe stub implementations for when Supabase is not configured
export class SupabaseService {
  private static instance: SupabaseService;
  private initialized = false;

  private constructor() {}

  public static getInstance(): SupabaseService {
    if (!SupabaseService.instance) {
      SupabaseService.instance = new SupabaseService();
    }
    return SupabaseService.instance;
  }

  public async initialize(): Promise<boolean> {
    // Check if Supabase is properly configured
    if (!supabaseUrl || !supabaseAnonKey) {
      logger.warn("Supabase not configured. Using in-memory storage for development.");
      this.initialized = false;
      return false;
    }

    try {
      // Test connection
      const { error } = await supabase.from("tenants").select("*").limit(1);
      if (error) {
        logger.warn("Supabase connection error", { code: error.code, hint: error.hint });
        this.initialized = false;
        return false;
      }
      this.initialized = true;
      return true;
    } catch (err) {
      logger.warn("Supabase initialization error", err);
      this.initialized = false;
      return false;
    }
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public getClient() {
    return supabase;
  }
}

// Export singleton instance
export const supabaseService = SupabaseService.getInstance();
