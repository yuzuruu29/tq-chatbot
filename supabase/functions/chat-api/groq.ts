// TQ ChatBot #1 - Groq Provider (server-side only)
//
// Provides structured signal extraction and optional response drafting
// via the Groq API.  This module runs ONLY inside Supabase Edge Functions
// (Deno runtime).  The GROQ_API_KEY is read from Deno.env — it is NEVER
// exposed to the browser.
//
// If GROQ_API_KEY is not set, or if Groq fails / times out / returns
// invalid JSON, all callers fall back to deterministic extraction and
// response generation.  Deterministic scoring remains the source of truth.

export interface GroqExtractedSignals {
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

export interface GroqDraftResponse {
  response_text: string;
}

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const EXTRACTION_SCHEMA_DESC = `Return strict JSON only.  Unknown fields must be null.  Do not invent values.

Schema:
{
  "has_business": boolean | null,
  "business_type_text": string | null,
  "business_name": string | null,
  "problem_clarity": 0 | 1 | 2 | null,
  "problem_text": string | null,
  "urgency": 0 | 1 | 2 | null,
  "wants_to_book": boolean | null,
  "has_traffic_or_spend": boolean | null,
  "manual_sales_signal": boolean | null,
  "budget_signal": boolean | null,
  "contact_captured": boolean | null,
  "email": string | null,
  "refusal_detected": boolean,
  "confidence": number
}`;

const EXTRACTION_SYSTEM_PROMPT = `You are extracting structured lead qualification signals from a short chat message.  Use the conversation context.  Return strict JSON only.  Unknown fields must be null.  Do not invent values.

Rules:
- Return null for unknown fields.
- Never invent email, business name, or business type.
- Preserve exact user-provided business type when possible.
- If user refuses, set refusal_detected true and leave missing fields null.
- If the user gives a short pain/growth answer (e.g. "Getting leads, customers"), set problem_clarity to 1 or 2 and problem_text to the user's words.
- Do not score the lead.
- Do not route the lead.
- Do not fabricate missing contact info.

${EXTRACTION_SCHEMA_DESC}`;

const DRAFT_SYSTEM_PROMPT = `You are a concise, direct sales closer drafting a chat response.  You receive a deterministic decision about what to say next.  You may ONLY phrase the response naturally — you must NOT change the route, score, or next action.

Tone:
- direct
- concise
- closer-style
- no emojis
- no generic AI marketing copy
- no fake claims
- no over-questioning

Return only the response text as a plain string, no JSON wrapping.`;

/**
 * Get Groq API configuration from environment.
 * Returns null if not configured — callers should fall back to deterministic.
 */
function getGroqConfig(): { apiKey: string; model: string; baseUrl: string } | null {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return null;
  const model = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";
  return { apiKey, model, baseUrl: "https://api.groq.com/openai/v1" };
}

/**
 * Call the Groq chat completions API with a timeout.
 * Returns the assistant message content, or null on failure.
 */
async function callGroq(
  messages: GroqMessage[],
  timeoutMs: number = 7000
): Promise<string | null> {
  const config = getGroqConfig();
  if (!config) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.1,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`Groq API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      console.warn("Groq request timed out");
    } else {
      console.warn("Groq request failed");
    }
    return null;
  }
}

/**
 * Use Groq to extract structured signals from a chat message.
 * Returns null if Groq is unavailable, times out, or returns invalid JSON.
 * Callers MUST fall back to deterministic extraction when this returns null.
 */
export async function groqExtractSignals(
  latestMessage: string,
  conversationHistory: GroqMessage[],
  currentSignals: Record<string, unknown>,
  lastQuestionPurpose: string | null,
  tenantConfig: Record<string, unknown>
): Promise<GroqExtractedSignals | null> {
  const contextBlock = [
    `Tenant config: ${JSON.stringify(tenantConfig)}`,
    `Last question purpose: ${lastQuestionPurpose ?? "unknown"}`,
    `Current accumulated signals: ${JSON.stringify(currentSignals)}`,
    `Latest user message: "${latestMessage}"`,
  ].join("\n");

  const messages: GroqMessage[] = [
    { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
    ...conversationHistory.slice(-8),
    { role: "user", content: contextBlock },
  ];

  const raw = await callGroq(messages, 7000);
  if (!raw) return null;

  try {
    // Groq may wrap JSON in markdown code fences — strip them.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as GroqExtractedSignals;

    // Validate the shape: refusal_detected must be boolean, confidence must be number
    if (typeof parsed.refusal_detected !== "boolean") {
      parsed.refusal_detected = false;
    }
    if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 1) {
      parsed.confidence = 0.5;
    }

    return parsed;
  } catch {
    console.warn("Groq returned invalid JSON (first 50 chars):", raw.slice(0, 50).replace(/[^\x20-\x7E]/g, ""));
    return null;
  }
}

/**
 * Use Groq to draft a natural assistant response.
 * The deterministic decision (next_gap, final_score, route, known context)
 * is passed so Groq may ONLY phrase — not decide.
 *
 * Returns null if Groq is unavailable or fails.  Callers use
 * generateCloserResponse() as fallback.
 */
export async function groqDraftResponse(
  deterministicDecision: {
    next_gap: string | null;
    final_score: string;
    route: string;
    business_type_text?: string;
    problem_text?: string;
    next_action: string;
  },
  conversationHistory: GroqMessage[]
): Promise<string | null> {
  const decisionBlock = [
    `Deterministic decision (do NOT change):`,
    `  next_gap: ${deterministicDecision.next_gap}`,
    `  final_score: ${deterministicDecision.final_score}`,
    `  route: ${deterministicDecision.route}`,
    `  business_type: ${deterministicDecision.business_type_text ?? "unknown"}`,
    `  problem: ${deterministicDecision.problem_text ?? "unknown"}`,
    `  next_action: ${deterministicDecision.next_action}`,
    ``,
    `Draft the assistant's next message.  Keep it under 2 sentences.`,
  ].join("\n");

  const messages: GroqMessage[] = [
    { role: "system", content: DRAFT_SYSTEM_PROMPT },
    ...conversationHistory.slice(-6),
    { role: "user", content: decisionBlock },
  ];

  const raw = await callGroq(messages, 5000);
  if (!raw) return null;

  // Strip any accidental JSON wrapping or markdown fences
  const cleaned = raw
    .replace(/^```(?:\w+)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^"|"$/g, "")
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Check if Groq is configured (GROQ_API_KEY is set).
 * Useful for the Edge Function to decide whether to attempt Groq calls.
 */
export function isGroqConfigured(): boolean {
  return !!Deno.env.get("GROQ_API_KEY");
}
