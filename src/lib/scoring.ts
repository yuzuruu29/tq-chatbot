// TQ ChatBot #1 - Deterministic Lead Scoring Module
// Core principle: Final lead scoring must be deterministic, explainable, and auditable

import type { Signals, ScoringResult, Route } from "../types";

/**
 * Deterministic lead scoring function
 * This is the single source of truth for lead qualification
 * All scoring logic must be contained here for auditability
 */
export function scoreLead(signals: Signals): ScoringResult {
  // Rule 1: High intent - has business, clear problem, and strong buying/urgency signal
  if (
    signals.has_business &&
    signals.problem_clarity >= 1 &&
    (signals.wants_to_book || signals.urgency >= 2 || signals.has_traffic_or_spend)
  ) {
    return {
      final_score: "high",
      route: "calendly",
      alert: true,
      score_reason:
        "High intent because the visitor has a real business, a clear problem, and a strong buying or urgency signal."
    };
  }

  // Rule 2: Soft booking - wants to book but business context not established
  if (signals.wants_to_book && !signals.has_business) {
    return {
      final_score: "medium",
      route: "soft_booking",
      alert: false,
      score_reason:
        "Visitor wants to book, but business context is not established. Offer booking path without marking as qualified."
    };
  }

  // Rule 3: Medium intent - has business and problem, but unclear urgency/readiness
  if (signals.has_business && signals.problem_clarity >= 1) {
    return {
      final_score: "medium",
      route: "nurture",
      alert: false,
      score_reason:
        "Medium intent because a business and problem exist, but urgency or readiness is unclear."
    };
  }

  // Rule 4: Low intent - default case
  return {
    final_score: "low",
    route: "helpful_guidance",
    alert: false,
    score_reason:
      "Low intent because there is no clear business, problem, or buying signal yet."
  };
}

/**
 * Extract signals from user input using deterministic pattern matching
 * This is a fallback when LLM extraction is not available
 */
export function extractSignalsFromText(input: string): Partial<Signals> {
  const normalized = input.toLowerCase();
  const signals: Partial<Signals> = {};

  // Business detection
  signals.has_business = 
    /(?:run|own|have|operate|manage|founded)\s+(?:a|an|the|my)?\s*(?:business|company|startup|brand|agency|ecommerce|store|shop)/i.test(normalized) ||
    /(?:business|company|startup|brand|agency|ecommerce|store|shop)\s+(?:owner|founder|ceo|director)/i.test(normalized) ||
    /(?:i have a|i run a|i own a)\s*(?:small )?(?:business|company|service business|startup|brand|agency|ecommerce|store|shop)/i.test(normalized);

  // Traffic or spend detection
  signals.has_traffic_or_spend = 
    /(?:spending|spend|investing|running)\s+(?:on|in)?\s*(?:ads|advertising|marketing|paid|ppc|facebook ads|google ads|traffic)/i.test(normalized) ||
    /(?:getting|receiving|have|having)\s+(?:traffic|visitors|leads|customers)/i.test(normalized) ||
    /(?:budget|spend|spending)\s+(?:\$|dollars|usd|monthly|annual)/i.test(normalized) ||
    /(?:we are spending|we're spending|spending on)/i.test(normalized);

  // Problem clarity detection
  if (/\b(problem|issue|challenge|struggle|pain|difficulty|trouble)\b/i.test(normalized)) {
    signals.problem_clarity = 2;
  } else if (/\b(weak|poor|bad|not working|broken|inefficient)\s+(?:funnel|conversion|sales|process)/i.test(normalized) ||
             /(?:funnel is weak|follow-up is slow)/i.test(normalized)) {
    signals.problem_clarity = 1;
  } else {
    signals.problem_clarity = 0;
  }

  // Urgency detection
  if (/\b(urgent|asap|immediately|right now|today|tomorrow|this week|soon|quickly)\b/i.test(normalized) ||
      /(?:i want to talk soon)/i.test(normalized)) {
    signals.urgency = 2;
  } else if (/\b(eventually|planning|considering)\b/i.test(normalized)) {
    signals.urgency = 1;
  } else {
    signals.urgency = 0;
  }

  // Booking intent detection
  signals.wants_to_book = 
    /(?:book|schedule|reserve|set up|arrange)\s+(?:a|an|the)?\s*(?:call|meeting|demo|consultation|chat)/i.test(normalized) ||
    /(?:talk|speak|connect|meet)\s+(?:soon|now|today|tomorrow)/i.test(normalized) ||
    /calendly/i.test(normalized);

  // Manual sales signal detection
  signals.manual_sales_signal = 
    /(?:sales|revenue|profit|growth|scale|expand)/i.test(normalized) &&
    /(?:team|process|funnel|pipeline)/i.test(normalized);

  // Budget signal detection
  signals.budget_signal = 
    /(?:budget|money|funds|investment|roi|return on investment)/i.test(normalized);

  return signals;
}

/**
 * Merge extracted signals with existing signals
 * Extracted signals update existing ones when provided
 */
export function mergeSignals(
  existing: Signals,
  extracted: Partial<Signals>
): Signals {
  return {
    has_business: extracted.has_business !== undefined ? extracted.has_business : existing.has_business,
    has_traffic_or_spend: extracted.has_traffic_or_spend !== undefined ? extracted.has_traffic_or_spend : existing.has_traffic_or_spend,
    problem_clarity: extracted.problem_clarity !== undefined ? extracted.problem_clarity : existing.problem_clarity,
    urgency: extracted.urgency !== undefined ? extracted.urgency : existing.urgency,
    wants_to_book: extracted.wants_to_book !== undefined ? extracted.wants_to_book : existing.wants_to_book,
    manual_sales_signal: extracted.manual_sales_signal !== undefined ? extracted.manual_sales_signal : existing.manual_sales_signal,
    budget_signal: extracted.budget_signal !== undefined ? extracted.budget_signal : existing.budget_signal,
    contact_captured: extracted.contact_captured !== undefined ? extracted.contact_captured : existing.contact_captured,
    model_proposed_score: existing.model_proposed_score
  };
}

/**
 * Default signals for a new conversation
 */
export const defaultSignals: Signals = {
  has_business: false,
  has_traffic_or_spend: false,
  problem_clarity: 0,
  urgency: 0,
  wants_to_book: false,
  manual_sales_signal: false,
  budget_signal: false,
  contact_captured: false
};

/**
 * Get route configuration based on scoring result
 */
export function getRouteConfig(route: Route) {
  const configs = {
    calendly: {
      action: "show_calendly",
      label: "Book a Call",
      description: "Schedule a consultation with our team",
      requires_contact: true
    },
    soft_booking: {
      action: "show_booking_option",
      label: "Book a Call",
      description: "Schedule a call to discuss your needs",
      requires_contact: true
    },
    nurture: {
      action: "capture_email",
      label: "Get Updates",
      description: "Receive helpful resources and follow-ups",
      requires_contact: true
    },
    helpful_guidance: {
      action: "show_resources",
      label: "Learn More",
      description: "Access our knowledge base and guides",
      requires_contact: false
    }
  };
  return configs[route];
}
