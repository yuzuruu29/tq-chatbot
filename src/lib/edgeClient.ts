// TQ ChatBot #1 - Edge Function Client
//
// Browser-side wrapper for the chat-api Edge Function.
// All writes to Supabase go through this client, which calls the Edge Function
// instead of writing directly. The Edge Function holds the service-role key
// and enforces rate limits, idempotency, and validation.
//
// Falls back gracefully when the Edge Function is not deployed (dev mode).

import type { ChatMessage, ChatSession, Lead, FunnelEvent } from "../types";

// Read env vars lazily so tests can stub them with vi.stubEnv().
function getSupabaseUrl(): string {
  return import.meta.env.VITE_SUPABASE_URL || "";
}

function getAnonKey(): string {
  return import.meta.env.VITE_SUPABASE_ANON_KEY || "";
}

interface EdgePayload {
  action: "create_session" | "create_message" | "create_lead" | "record_event" | "process_message";
  session_id?: string;
  visitor_id?: string;
  tenant_id: string;
  content?: string;
  role?: "user" | "assistant" | "system";
  lead_id?: string;
  score?: string;
  route?: string;
  signals?: Record<string, unknown>;
  contact_info?: Record<string, unknown>;
  scoring_result?: Record<string, unknown>;
  event_type?: string;
  data?: Record<string, unknown>;
  // process_message fields
  conversation_history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  current_signals?: Record<string, unknown>;
  last_question_purpose?: string | null;
  tenant_config?: Record<string, unknown>;
  deterministic_decision?: {
    next_gap: string | null;
    final_score: string;
    route: string;
    business_type_text?: string;
    problem_text?: string;
    next_action: string;
  };
}

interface GroqExtractedSignals {
  has_business: boolean | null;
  business_type_text: string | null;
  business_name: string | null;
  problem_clarity: 0 | 1 | 2 | null;
  problem_text: string | null;
  urgency: 0 | 1 | 2 | null;
  wants_to_book: boolean | null;
  has_traffic_or_spend: boolean | null;
  manual_sales_signal: boolean | null;
  budget_signal: boolean | null;
  contact_captured: boolean | null;
  email: string | null;
  refusal_detected: boolean;
  confidence: number;
}

interface ProcessMessageResponse {
  groq_available: boolean;
  extracted_signals: GroqExtractedSignals | null;
  drafted_response: string | null;
}

interface EdgeResponse {
  success: boolean;
  error?: string;
  duplicate?: boolean;
  updated?: boolean;
  rate_limit_remaining?: number;
  session?: ChatSession;
  message?: ChatMessage;
  lead?: Lead;
  event?: FunnelEvent;
  // process_message response fields
  groq_available?: boolean;
  extracted_signals?: GroqExtractedSignals | null;
  drafted_response?: string | null;
}

/**
 * Call the chat-api Edge Function.
 * Returns null if the function is not deployed (dev mode fallback).
 *
 * A 10-second timeout prevents the UI from hanging indefinitely when the
 * Edge Function is slow or unreachable.
 */
async function callChatApi(payload: EdgePayload): Promise<EdgeResponse | null> {
  const url = getSupabaseUrl();
  if (!url || url.includes("your-project-ref")) {
    // Supabase not configured — signal fallback to in-memory
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${url}/functions/v1/chat-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAnonKey()}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      console.warn(`chat-api ${response.status}:`, errorBody.error || response.statusText);
      return null;
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    // Network error, timeout, or function not deployed — signal fallback
    if (err instanceof DOMException && err.name === "AbortError") {
      console.warn("chat-api request timed out after 10s");
    } else {
      console.warn("chat-api unavailable, falling back to in-memory:", err);
    }
    return null;
  }
}

/**
 * Persist a chat session via Edge Function.
 * Returns the session from Supabase, or null for in-memory fallback.
 */
export async function edgeCreateSession(
  visitorId: string,
  tenantId: string
): Promise<ChatSession | null> {
  const result = await callChatApi({
    action: "create_session",
    visitor_id: visitorId,
    tenant_id: tenantId,
  });
  return result?.session || null;
}

/**
 * Persist a chat message via Edge Function.
 * Returns { message, duplicate } or null for in-memory fallback.
 */
export async function edgeCreateMessage(
  sessionId: string,
  content: string,
  role: "user" | "assistant" | "system",
  tenantId: string
): Promise<{ message: ChatMessage; duplicate: boolean } | null> {
  const result = await callChatApi({
    action: "create_message",
    session_id: sessionId,
    content,
    role,
    tenant_id: tenantId,
  });
  if (!result?.message) return null;
  return { message: result.message, duplicate: result.duplicate || false };
}

/**
 * Persist a lead via Edge Function.
 * Returns { lead, updated } or null for in-memory fallback.
 */
export async function edgeCreateLead(
  sessionId: string,
  visitorId: string,
  tenantId: string,
  score: string,
  route: string,
  signals: Record<string, unknown>,
  contactInfo: Record<string, unknown>,
  scoringResult: Record<string, unknown>
): Promise<{ lead: Lead; updated: boolean } | null> {
  const result = await callChatApi({
    action: "create_lead",
    session_id: sessionId,
    visitor_id: visitorId,
    tenant_id: tenantId,
    score,
    route,
    signals,
    contact_info: contactInfo,
    scoring_result: scoringResult,
  });
  if (!result?.lead) return null;
  return { lead: result.lead, updated: result.updated || false };
}

/**
 * Persist a funnel event via Edge Function.
 * Returns the event or null for in-memory fallback.
 */
export async function edgeRecordEvent(
  tenantId: string,
  sessionId: string,
  eventType: string,
  data: Record<string, unknown>,
  leadId?: string
): Promise<FunnelEvent | null> {
  const result = await callChatApi({
    action: "record_event",
    tenant_id: tenantId,
    session_id: sessionId,
    event_type: eventType,
    data,
    lead_id: leadId,
  });
  return result?.event || null;
}

/**
 * Request Groq-assisted signal extraction and response drafting from the Edge Function.
 * Returns { groq_available, extracted_signals, drafted_response } or null for fallback.
 *
 * This is an optional enhancement — the browser always runs deterministic
 * extraction first, then merges Groq suggestions when available.
 * Groq NEVER decides final score or route.
 */
export async function edgeProcessMessage(
  tenantId: string,
  content: string,
  conversationHistory: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  currentSignals: Record<string, unknown>,
  lastQuestionPurpose: string | null,
  tenantConfig: Record<string, unknown>,
  deterministicDecision: {
    next_gap: string | null;
    final_score: string;
    route: string;
    business_type_text?: string;
    problem_text?: string;
    next_action: string;
  }
): Promise<ProcessMessageResponse | null> {
  const result = await callChatApi({
    action: "process_message",
    tenant_id: tenantId,
    content,
    conversation_history: conversationHistory,
    current_signals: currentSignals,
    last_question_purpose: lastQuestionPurpose,
    tenant_config: tenantConfig,
    deterministic_decision: deterministicDecision,
  });
  if (!result) return null;
  return {
    groq_available: result.groq_available ?? false,
    extracted_signals: result.extracted_signals ?? null,
    drafted_response: result.drafted_response ?? null,
  };
}

/**
 * Check if the Edge Function is available.
 * Useful for UI indicators or graceful degradation.
 */
export async function isEdgeAvailable(): Promise<boolean> {
  const url = getSupabaseUrl();
  if (!url || url.includes("your-project-ref")) return false;
  try {
    const response = await fetch(`${url}/functions/v1/chat-api`, {
      method: "OPTIONS",
      headers: { Authorization: `Bearer ${getAnonKey()}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}
