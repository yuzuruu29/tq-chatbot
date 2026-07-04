// TQ ChatBot #1 - Claude Extraction Service
// Safe stub implementation for LLM-based signal extraction

import type { Signals, LeadScore } from "../types";
import { extractSignalsFromText } from "../lib/scoring";

/**
 * Claude extraction prompt for structured signal extraction
 * This is a safe stub that can be extended with real Claude API calls
 */
export const CLAUDE_EXTRACTION_PROMPT = `
You are a lead qualification assistant. Extract structured signals from the user's message.

INSTRUCTIONS:
- Analyze the user's message for lead qualification signals
- Return ONLY a valid JSON object with the following structure:
{
  "has_business": boolean,
  "has_traffic_or_spend": boolean,
  "problem_clarity": 0 | 1 | 2,
  "urgency": 0 | 1 | 2,
  "wants_to_book": boolean,
  "manual_sales_signal": boolean,
  "budget_signal": boolean,
  "contact_captured": boolean,
  "model_proposed_score": "low" | "medium" | "high",
  "confidence": number,
  "explanation": string
}

DEFINITIONS:
- has_business: User mentions they have/own/run a business, company, or brand
- has_traffic_or_spend: User mentions spending on ads, marketing, or getting traffic/leads
- problem_clarity: 0=none, 1=some indication of problem, 2=clear problem stated
- urgency: 0=none, 1=some urgency, 2=high urgency (ASAP, today, tomorrow, etc.)
- wants_to_book: User explicitly wants to book a call, meeting, or demo
- manual_sales_signal: Mentions sales, revenue, growth, scaling, etc.
- budget_signal: Mentions budget, money, investment, ROI, etc.
- contact_captured: User has provided contact information
- model_proposed_score: LLM's proposed score (low, medium, high)
- confidence: 0-1 confidence in the extraction
- explanation: Brief explanation of the extraction

EXAMPLES:
User: "I run an ecommerce brand. We are spending on paid ads and getting leads, but follow-up is slow. I want to talk soon."
Output: {"has_business": true, "has_traffic_or_spend": true, "problem_clarity": 2, "urgency": 2, "wants_to_book": true, "manual_sales_signal": false, "budget_signal": false, "contact_captured": false, "model_proposed_score": "high", "confidence": 0.95, "explanation": "User has business, traffic/spend, clear problem, and urgency"}

User: "Just looking around. Not sure yet."
Output: {"has_business": false, "has_traffic_or_spend": false, "problem_clarity": 0, "urgency": 0, "wants_to_book": false, "manual_sales_signal": false, "budget_signal": false, "contact_captured": false, "model_proposed_score": "low", "confidence": 0.95, "explanation": "No clear signals detected"}

REMEMBER: Always return valid JSON. Never include markdown formatting or code blocks.
`;

/**
 * Type for Claude extraction response
 */
export interface ClaudeExtractionResult {
  has_business: boolean;
  has_traffic_or_spend: boolean;
  problem_clarity: 0 | 1 | 2;
  urgency: 0 | 1 | 2;
  wants_to_book: boolean;
  manual_sales_signal: boolean;
  budget_signal: boolean;
  contact_captured: boolean;
  model_proposed_score: LeadScore;
  confidence: number;
  explanation: string;
}

/**
 * Claude Extraction Service
 *
 * SECURITY: The browser never holds the Claude API key.
 * In production, this service calls a Supabase Edge Function
 * at /api/extract-signals which holds CLAUDE_API_KEY server-side.
 *
 * The browser MVP uses deterministic regex extraction as a safe fallback.
 */
export class ClaudeService {
  private static instance: ClaudeService;

  private constructor() {}

  public static getInstance(): ClaudeService {
    if (!ClaudeService.instance) {
      ClaudeService.instance = new ClaudeService();
    }
    return ClaudeService.instance;
  }

  /**
   * Check if server-side Claude extraction is available.
   * In the browser MVP this always returns false.
   * In production, this would ping the Edge Function health endpoint.
   */
  public isConfigured(): boolean {
    return false; // Browser MVP — real key lives in Edge Function
  }

  /**
   * Extract signals from user message.
   *
   * Production flow:
   *   1. POST to Supabase Edge Function /api/extract-signals
   *   2. Edge Function calls Claude with CLAUDE_API_KEY (server-only)
   *   3. Returns structured JSON signals
   *
   * Browser MVP flow:
   *   Uses deterministic regex extraction (no API key needed).
   */
  public async extractSignals(userMessage: string): Promise<Partial<Signals>> {
    // Production: call Edge Function
    // const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-signals`, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
    //   body: JSON.stringify({ message: userMessage })
    // });
    // if (response.ok) return response.json();

    // Browser MVP fallback: deterministic extraction
    return this.deterministicExtraction(userMessage);
  }

  /**
   * Deterministic extraction fallback.
   * Delegates to the canonical extractSignalsFromText in scoring.ts
   * to avoid duplicate, divergent regex patterns.
   */
  private deterministicExtraction(userMessage: string): Partial<Signals> {
    return extractSignalsFromText(userMessage);
  }

}

// Export singleton instance
export const claudeService = ClaudeService.getInstance();
