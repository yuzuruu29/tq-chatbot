// TQ ChatBot #1 - Edge Function: chat-api
//
// Handles all public write operations for the chat widget:
// - Message persistence (chat_messages)
// - Lead creation and updates (leads)
// - Funnel event recording (funnel_events)
// - Session creation and updates (chat_sessions)
// - Optional Groq-assisted signal extraction and response drafting
//
// SECURITY: Holds SUPABASE_SERVICE_ROLE_KEY server-side.
// The browser never sees this key. All writes go through this function,
// which validates inputs, enforces rate limits, and checks idempotency
// before persisting to Supabase.
//
// GROQ: When GROQ_API_KEY is set, the function can use Groq for structured
// signal extraction and assistant response drafting.  Groq is optional —
// the function falls back to deterministic extraction when Groq is
// unavailable, times out, or returns invalid JSON.  Groq NEVER decides
// final score or route — deterministic scoring remains the source of truth.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  groqExtractSignals,
  groqDraftResponse,
  isGroqConfigured,
  type GroqExtractedSignals,
} from "./groq.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatPayload {
  action: "create_session" | "create_message" | "create_lead" | "record_event" | "process_message";
  session_id?: string;
  visitor_id?: string;
  tenant_id: string;
  // Message fields
  content?: string;
  role?: "user" | "assistant" | "system";
  // Lead fields
  lead_id?: string;
  score?: string;
  route?: string;
  signals?: Record<string, unknown>;
  contact_info?: Record<string, unknown>;
  scoring_result?: Record<string, unknown>;
  // Event fields
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

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  visitorId: string,
  ip: string
): Promise<{ allowed: boolean; remaining: number }> {
  const windowMinutes = 1;
  const maxRequests = 30;

  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_identifier: visitorId || ip,
    p_window_minutes: windowMinutes,
    p_max_requests: maxRequests,
  });

  if (error) {
    console.error("Rate limit check failed:", error.message);
    // Fail open — allow the request if rate limiting is broken
    return { allowed: true, remaining: maxRequests };
  }

  return { allowed: data === true, remaining: maxRequests };
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body: ChatPayload = await req.json();
    const clientIp = getClientIp(req);

    // Payload size guard: reject oversized requests to bound memory usage.
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 10_000) {
      return new Response(
        JSON.stringify({ error: "Payload too large" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Content length guard for message bodies: cap at 5000 chars.
    if (body.content && body.content.length > 5000) {
      return new Response(
        JSON.stringify({ error: "Message content too long (max 5000 characters)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit check
    const rateLimit = await checkRateLimit(supabase, body.visitor_id || "", clientIp);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded. Please wait before sending more messages.",
          retry_after_seconds: 60,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate required fields
    if (!body.tenant_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate tenant_id exists in the database to prevent tenant spoofing.
    // A malicious client could craft arbitrary tenant_id values; this check
    // ensures writes are scoped to an actual tenant.
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("id", body.tenant_id)
      .limit(1)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: "Invalid tenant_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: Record<string, unknown> = {};

    switch (body.action) {
      case "create_session": {
        if (!body.visitor_id) {
          return new Response(
            JSON.stringify({ error: "visitor_id is required for create_session" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data, error } = await supabase
          .from("chat_sessions")
          .insert({
            visitor_id: body.visitor_id,
            tenant_id: body.tenant_id,
            status: "active",
          })
          .select()
          .single();

        if (error) throw new Error(`Failed to create session: ${error.message}`);
        result = { session: data };
        break;
      }

      case "create_message": {
        if (!body.session_id || !body.content || !body.role) {
          return new Response(
            JSON.stringify({ error: "session_id, content, and role are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Idempotency: check for recent duplicate message in the same session
        const { data: existing } = await supabase
          .from("chat_messages")
          .select("id")
          .eq("session_id", body.session_id)
          .eq("role", body.role)
          .ilike("content", body.content.trim().slice(0, 200))
          .gte("timestamp", new Date(Date.now() - 5000).toISOString())
          .limit(1);

        if (existing && existing.length > 0) {
          // Duplicate detected — return existing record
          result = { message: existing[0], duplicate: true };
          break;
        }

        const { data, error } = await supabase
          .from("chat_messages")
          .insert({
            session_id: body.session_id,
            content: body.content.trim(),
            role: body.role,
          })
          .select()
          .single();

        if (error) throw new Error(`Failed to create message: ${error.message}`);
        result = { message: data, duplicate: false };
        break;
      }

      case "create_lead": {
        if (!body.session_id || !body.visitor_id || !body.score || !body.route) {
          return new Response(
            JSON.stringify({ error: "session_id, visitor_id, score, and route are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Upsert: use session_id + visitor_id to prevent duplicate leads
        const { data: existingLead } = await supabase
          .from("leads")
          .select("*")
          .eq("session_id", body.session_id)
          .eq("visitor_id", body.visitor_id)
          .limit(1)
          .single();

        if (existingLead) {
          // Update existing lead with new signals/score
          const { data, error } = await supabase
            .from("leads")
            .update({
              score: body.score,
              route: body.route,
              signals: body.signals || {},
              contact_info: body.contact_info || {},
              scoring_result: body.scoring_result || {},
              status: existingLead.status === "new" ? "new" : existingLead.status,
            })
            .eq("id", existingLead.id)
            .select()
            .single();

          if (error) throw new Error(`Failed to update lead: ${error.message}`);
          result = { lead: data, updated: true };
        } else {
          const { data, error } = await supabase
            .from("leads")
            .insert({
              tenant_id: body.tenant_id,
              session_id: body.session_id,
              visitor_id: body.visitor_id,
              score: body.score,
              route: body.route,
              signals: body.signals || {},
              contact_info: body.contact_info || {},
              scoring_result: body.scoring_result || {},
              status: "new",
            })
            .select()
            .single();

          if (error) throw new Error(`Failed to create lead: ${error.message}`);

          // Update session with lead_id
          await supabase
            .from("chat_sessions")
            .update({ lead_id: data.id, status: "completed" })
            .eq("id", body.session_id);

          result = { lead: data, updated: false };
        }
        break;
      }

      case "record_event": {
        if (!body.event_type) {
          return new Response(
            JSON.stringify({ error: "event_type is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data, error } = await supabase
          .from("funnel_events")
          .insert({
            tenant_id: body.tenant_id,
            session_id: body.session_id || "unknown",
            lead_id: body.lead_id || null,
            event_type: body.event_type,
            data: body.data || {},
          })
          .select()
          .single();

        if (error) throw new Error(`Failed to record event: ${error.message}`);
        result = { event: data };
        break;
      }

      case "process_message": {
        // Optional Groq-assisted signal extraction and response drafting.
        // This action does NOT persist anything — it only calls Groq and
        // returns the results.  The browser uses these to augment its
        // deterministic extraction.
        if (!body.content) {
          return new Response(
            JSON.stringify({ error: "content is required for process_message" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const groqAvailable = isGroqConfigured();
        let extractedSignals: GroqExtractedSignals | null = null;
        let draftedResponse: string | null = null;

        if (groqAvailable) {
          // Attempt Groq signal extraction
          extractedSignals = await groqExtractSignals(
            body.content,
            body.conversation_history || [],
            body.current_signals || {},
            body.last_question_purpose ?? null,
            body.tenant_config || {}
          ).catch(() => null);

          // Attempt Groq response drafting if we have a deterministic decision
          if (body.deterministic_decision) {
            draftedResponse = await groqDraftResponse(
              body.deterministic_decision,
              body.conversation_history || []
            ).catch(() => null);
          }
        }

        result = {
          groq_available: groqAvailable,
          extracted_signals: extractedSignals,
          drafted_response: draftedResponse,
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${body.action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, ...result, rate_limit_remaining: rateLimit.remaining }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("chat-api error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
