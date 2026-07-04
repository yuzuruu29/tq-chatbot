// TQ ChatBot #1 - Deterministic Lead Scoring Module
// Core principle: Final lead scoring must be deterministic, explainable, and auditable

import type { Signals, ScoringResult, Route, ScoreBreakdown, ScoreFactor, LeadSummary } from "../types";

/**
 * Build a numeric score breakdown from signals.
 * Each dimension is 0–20, total 0–100.
 * Weights: fit 25, urgency 20, pain 25, readiness 15, quality 15.
 * The breakdown normalises each dimension to its weight.
 */
function buildBreakdown(signals: Signals): ScoreBreakdown {
  // Fit: has_business (0/10) + has_traffic_or_spend (0/10) → scaled to 0–25
  const fitRaw = (signals.has_business ? 10 : 0) + (signals.has_traffic_or_spend ? 10 : 0);
  const fit = Math.round((fitRaw / 20) * 25);

  // Urgency: 0/1/2 → scaled to 0–20
  const urgency = Math.round((signals.urgency / 2) * 20);

  // Pain: problem_clarity 0/1/2 → scaled to 0–25
  const pain = Math.round((signals.problem_clarity / 2) * 25);

  // Readiness: wants_to_book (0/10) + contact_captured (0/5) → scaled to 0–15
  const readinessRaw = (signals.wants_to_book ? 10 : 0) + (signals.contact_captured ? 5 : 0);
  const readiness = Math.round((readinessRaw / 15) * 15);

  // Quality: manual_sales_signal (0/7) + budget_signal (0/8) → scaled to 0–15
  const qualityRaw = (signals.manual_sales_signal ? 7 : 0) + (signals.budget_signal ? 8 : 0);
  const quality = Math.round((qualityRaw / 15) * 15);

  return { fit, urgency, pain, readiness, quality };
}

/**
 * Build explainable score factors from the breakdown.
 */
function buildFactors(signals: Signals, breakdown: ScoreBreakdown): ScoreFactor[] {
  const factors: ScoreFactor[] = [];

  factors.push({
    dimension: "fit",
    value: breakdown.fit,
    max: 25,
    reason: signals.has_business
      ? `Has business${signals.has_traffic_or_spend ? " with active traffic/spend" : ""}`
      : "No business context established"
  });

  factors.push({
    dimension: "urgency",
    value: breakdown.urgency,
    max: 20,
    reason: signals.urgency >= 2
      ? "High urgency — time-sensitive need"
      : signals.urgency === 1
        ? "Some urgency indicated"
        : "No urgency signal"
  });

  factors.push({
    dimension: "pain",
    value: breakdown.pain,
    max: 25,
    reason: signals.problem_clarity >= 2
      ? "Clear, specific problem stated"
      : signals.problem_clarity === 1
        ? "Some indication of a problem"
        : "No problem articulated yet"
  });

  factors.push({
    dimension: "readiness",
    value: breakdown.readiness,
    max: 15,
    reason: signals.wants_to_book
      ? `Wants to book${signals.contact_captured ? ", contact captured" : ""}`
      : "No booking intent shown"
  });

  factors.push({
    dimension: "quality",
    value: breakdown.quality,
    max: 15,
    reason: signals.budget_signal
      ? "Budget signal present"
      : signals.manual_sales_signal
        ? "Sales/growth language detected"
        : "No budget or sales signal"
  });

  return factors;
}

/**
 * Generate a lead summary from signals and scoring result.
 * Captures: business_type, pain_point, urgency, requested_service,
 * lead_quality, next_action.
 */
function buildSummary(signals: Signals, score: ScoringResult): LeadSummary {
  const businessType = signals.has_business
    ? signals.has_traffic_or_spend
      ? "Active business with traffic/spend"
      : "Business owner"
    : "No business context";

  const painPoint = signals.problem_clarity >= 2
    ? "Clear problem identified"
    : signals.problem_clarity === 1
      ? "Partial problem indication"
      : "No specific pain articulated";

  const urgencyLabel = signals.urgency >= 2
    ? "High — needs solution soon"
    : signals.urgency === 1
      ? "Moderate — exploring options"
      : "Low — no time pressure";

  const requestedService = signals.wants_to_book
    ? "Wants a call/demo"
    : score.route === "nurture"
      ? "Nurture sequence"
      : score.route === "helpful_guidance"
        ? "Information/guidance"
        : "Not specified";

  return {
    business_type: businessType,
    pain_point: painPoint,
    urgency: urgencyLabel,
    requested_service: requestedService,
    lead_quality: score.final_score,
    next_action: getRouteConfig(score.route).description
  };
}

/**
 * Deterministic lead scoring function.
 * This is the single source of truth for lead qualification.
 * All scoring logic must be contained here for auditability.
 *
 * Returns a full ScoringResult including numeric breakdown and summary.
 */
export function scoreLead(signals: Signals): ScoringResult {
  const breakdown = buildBreakdown(signals);
  const score_value = breakdown.fit + breakdown.urgency + breakdown.pain + breakdown.readiness + breakdown.quality;
  const factors = buildFactors(signals, breakdown);

  // Rule 1: High intent - has business, clear problem, and strong buying/urgency signal
  if (
    signals.has_business &&
    signals.problem_clarity >= 1 &&
    (signals.wants_to_book || signals.urgency >= 2 || signals.has_traffic_or_spend)
  ) {
    const result: ScoringResult = {
      final_score: "high",
      route: "calendly",
      alert: true,
      score_reason:
        "High intent because the visitor has a real business, a clear problem, and a strong buying or urgency signal.",
      score_value,
      breakdown,
      factors
    };
    result.summary = buildSummary(signals, result);
    return result;
  }

  // Rule 2: Soft booking - wants to book but business context not established
  if (signals.wants_to_book && !signals.has_business) {
    const result: ScoringResult = {
      final_score: "medium",
      route: "soft_booking",
      alert: false,
      score_reason:
        "Visitor wants to book, but business context is not established. Offer booking path without marking as qualified.",
      score_value,
      breakdown,
      factors
    };
    result.summary = buildSummary(signals, result);
    return result;
  }

  // Rule 3: Medium intent - has business and problem, but unclear urgency/readiness
  if (signals.has_business && signals.problem_clarity >= 1) {
    const result: ScoringResult = {
      final_score: "medium",
      route: "nurture",
      alert: false,
      score_reason:
        "Medium intent because a business and problem exist, but urgency or readiness is unclear.",
      score_value,
      breakdown,
      factors
    };
    result.summary = buildSummary(signals, result);
    return result;
  }

  // Rule 4: Low intent - default case
  const result: ScoringResult = {
    final_score: "low",
    route: "helpful_guidance",
    alert: false,
    score_reason:
      "Low intent because there is no clear business, problem, or buying signal yet.",
    score_value,
    breakdown,
    factors
  };
  result.summary = buildSummary(signals, result);
  return result;
}

/**
 * Extract signals from user input using deterministic pattern matching.
 * This is a fallback when LLM extraction is not available.
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
 * Merge extracted signals with existing signals.
 * Extracted signals update existing ones when provided.
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
 * Default signals for a new conversation.
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
 * Get route configuration based on scoring result.
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

/**
 * Determine what qualification gap remains in the signals.
 * Returns the next purpose the closer should pursue, or null if
 * enough signals exist for a confident score.
 *
 * Early-stop: if the signals already produce a high score, we return null
 * immediately rather than asking for more information.  This is the
 * product judgement that distinguishes a closer from a questionnaire —
 * a closer stops qualifying once it can route.
 */
export function getQualificationGap(signals: Signals): "business" | "pain" | "urgency" | "readiness" | null {
  // Early-stop: if the signals already qualify as high, do not ask more.
  const provisional = scoreLead(signals);
  if (provisional.final_score === "high") return null;

  if (!signals.has_business) return "business";
  if (signals.problem_clarity < 1) return "pain";
  if (signals.urgency < 1 && !signals.wants_to_book && !signals.has_traffic_or_spend) return "urgency";
  if (!signals.contact_captured && signals.wants_to_book) return "readiness";
  return null;
}

// ---- Structured extraction helpers ----

// RFC 5322 simplified email pattern.  Rejects obvious garbage while
// accepting real-world addresses.  Does not validate DNS or MX records.
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/**
 * Extract the first email address found in free-text input.
 * Returns the normalised email string, or null if none found.
 *
 * This is deterministic — no LLM call.  It is used for signal extraction
 * from chat messages (e.g. "my email is john@example.com").
 */
export function extractEmail(input: string): string | null {
  const match = input.match(EMAIL_REGEX);
  return match ? match[0].toLowerCase().trim() : null;
}

/**
 * Validate that a string looks like a real email address.
 * Returns true for valid shape, false otherwise.
 *
 * This is a shape check only — it does not verify deliverability.
 */
export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  // Must have exactly one @, local part before, domain with at least one dot.
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (local.length === 0 || local.length > 64) return false;
  if (!domain.includes(".")) return false;
  const domainParts = domain.split(".");
  if (domainParts.some(p => p.length === 0)) return false;
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2) return false;
  return EMAIL_REGEX.test(email);
}

/**
 * Extract the first business name mentioned in free-text input.
 * Returns the name string, or null if no clear business name is found.
 *
 * This is a heuristic — it looks for patterns like "my company X",
 * "we are called Y", "the business is Z".  It does NOT hallucinate
 * names that are not present in the input.
 */
export function extractBusinessName(input: string): string | null {
  const normalized = input.trim();
  // "my company is X" / "our company called X" / "the business is X"
  const patterns = [
    /(?:my|our|the)\s+(?:company|business|startup|agency|brand|firm)\s+(?:is|called|named)\s+(?:called\s+|named\s+)?["']?([^"',.!?]+)["']?/i,
    /(?:we(?:'re| are)?|it(?:'s| is))\s+(?:called|named)\s+["']?([^"',.!?]+)["']?/i,
    /(?:company|business|startup|agency|brand|firm)\s+(?:called|named)\s+["']?([^"',.!?]+)["']?/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Sanity: at least 2 chars, not just common words.
      if (name.length >= 2 && !/^(the|a|an|my|our)$/i.test(name)) {
        return name;
      }
    }
  }
  return null;
}
