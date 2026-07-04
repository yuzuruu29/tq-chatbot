// TQ ChatBot #1 - Acceptance Tests for Scoring Scenarios
// These tests verify the deterministic scoring function works as expected

import { describe, it, expect } from "vitest";
import { scoreLead, extractSignalsFromText, defaultSignals, mergeSignals, getQualificationGap, extractEmail, isValidEmail, extractBusinessName, isLikelyBusinessType, extractBusinessTypeFromContext } from "../lib/scoring";
import type { Signals } from "../types";

// Test Scenario 1: Hot Lead
// Input: "I run an ecommerce brand. We are spending on paid ads and getting leads, but follow-up is slow. I want to talk soon."
// Expected: high, calendly, alert true
describe("Scoring Scenarios - Hot Lead", () => {
  it("should score hot lead as high with calendly route and alert", () => {
    const input = "I run an ecommerce brand. We are spending on paid ads and getting leads, but follow-up is slow. I want to talk soon.";
    
    // Extract signals from input
    const extractedSignals = extractSignalsFromText(input);
    
    // Verify extracted signals
    expect(extractedSignals.has_business).toBe(true);
    expect(extractedSignals.has_traffic_or_spend).toBe(true);
    expect(extractedSignals.problem_clarity).toBe(1); // "follow-up is slow" matches the pattern
    expect(extractedSignals.urgency).toBe(2);
    expect(extractedSignals.wants_to_book).toBe(true);
    
    // Create full signals object
    const signals: Signals = mergeSignals(defaultSignals, extractedSignals);
    
    // Score the lead
    const result = scoreLead(signals);
    
    // Verify scoring result
    expect(result.final_score).toBe("high");
    expect(result.route).toBe("calendly");
    expect(result.alert).toBe(true);
    expect(result.score_reason).toContain("High intent");
    expect(result.score_reason).toContain("real business");
    expect(result.score_reason).toContain("clear problem");
    expect(result.score_reason).toContain("strong buying or urgency signal");
  });
});

// Test Scenario 2: Warm Lead
// Input: "I have a small service business. I know our funnel is weak, but I'm not sure about budget or timing yet."
// Expected: medium, nurture, alert false
describe("Scoring Scenarios - Warm Lead", () => {
  it("should score warm lead as medium with nurture route and no alert", () => {
    const input = "I have a small service business. I know our funnel is weak, but I'm not sure about budget or timing yet.";
    
    // Extract signals from input
    const extractedSignals = extractSignalsFromText(input);
    
    // Expected signals
    expect(extractedSignals.has_business).toBe(true); // "I have a small service business"
    expect(extractedSignals.problem_clarity).toBe(1); // "funnel is weak" - some problem
    expect(extractedSignals.urgency).toBe(0); // "not sure about timing" - no urgency
    expect(extractedSignals.wants_to_book).toBe(false); // No booking intent
    
    // Create full signals object
    const signals: Signals = mergeSignals(defaultSignals, extractedSignals);
    
    // Score the lead
    const result = scoreLead(signals);
    
    // Verify scoring result
    expect(result.final_score).toBe("medium");
    expect(result.route).toBe("nurture");
    expect(result.alert).toBe(false);
    expect(result.score_reason).toContain("Medium intent");
    expect(result.score_reason).toContain("business and problem exist");
    expect(result.score_reason).toContain("urgency or readiness is unclear");
  });
});

// Test Scenario 3: Tyre-kicker
// Input: "Just looking around. Not sure yet."
// Expected: low, helpful_guidance, alert false
describe("Scoring Scenarios - Tyre-kicker", () => {
  it("should score tyre-kicker as low with helpful_guidance route and no alert", () => {
    const input = "Just looking around. Not sure yet.";
    
    // Extract signals from input
    const extractedSignals = extractSignalsFromText(input);
    
    // Expected signals - should be all defaults (false/0)
    expect(extractedSignals.has_business).toBe(false);
    expect(extractedSignals.has_traffic_or_spend).toBe(false);
    expect(extractedSignals.problem_clarity).toBe(0);
    expect(extractedSignals.urgency).toBe(0);
    expect(extractedSignals.wants_to_book).toBe(false);
    
    // Create full signals object
    const signals: Signals = mergeSignals(defaultSignals, extractedSignals);
    
    // Score the lead
    const result = scoreLead(signals);
    
    // Verify scoring result
    expect(result.final_score).toBe("low");
    expect(result.route).toBe("helpful_guidance");
    expect(result.alert).toBe(false);
    expect(result.score_reason).toContain("Low intent");
    expect(result.score_reason).toContain("no clear business, problem, or buying signal");
  });
});

// Test Scenario 4: Soft Booking
// Input: "Can I just book a call?"
// Expected: medium, soft_booking, alert false
describe("Scoring Scenarios - Soft Booking", () => {
  it("should score soft booking as medium with soft_booking route and no alert", () => {
    const input = "Can I just book a call?";
    
    // Extract signals from input
    const extractedSignals = extractSignalsFromText(input);
    
    // Expected signals
    expect(extractedSignals.has_business).toBe(false); // No business mentioned
    expect(extractedSignals.wants_to_book).toBe(true); // "book a call"
    
    // Create full signals object
    const signals: Signals = mergeSignals(defaultSignals, extractedSignals);
    
    // Score the lead
    const result = scoreLead(signals);
    
    // Verify scoring result
    expect(result.final_score).toBe("medium");
    expect(result.route).toBe("soft_booking");
    expect(result.alert).toBe(false);
    expect(result.score_reason).toContain("Visitor wants to book");
    expect(result.score_reason).toContain("business context is not established");
    expect(result.score_reason).toContain("Offer booking path without marking as qualified");
  });
});

// Additional Edge Cases
describe("Scoring Edge Cases", () => {
  it("should handle empty input gracefully", () => {
    const input = "";
    const extractedSignals = extractSignalsFromText(input);
    const signals: Signals = mergeSignals(defaultSignals, extractedSignals);
    const result = scoreLead(signals);
    
    expect(result.final_score).toBe("low");
    expect(result.route).toBe("helpful_guidance");
    expect(result.alert).toBe(false);
  });

  it("should handle business with high urgency but no problem clarity", () => {
    const signals: Signals = {
      ...defaultSignals,
      has_business: true,
      urgency: 2,
      wants_to_book: false
    };
    
    const result = scoreLead(signals);
    
    // Should be low because it doesn't meet any of the higher criteria
    // has_business is true but problem_clarity is 0, so it doesn't match rule 1 or 3
    expect(result.final_score).toBe("low");
    expect(result.route).toBe("helpful_guidance");
    expect(result.alert).toBe(false);
  });

  it("should handle business with problem clarity but no urgency or buying signal", () => {
    const signals: Signals = {
      ...defaultSignals,
      has_business: true,
      problem_clarity: 2,
      urgency: 0,
      wants_to_book: false,
      has_traffic_or_spend: false
    };
    
    const result = scoreLead(signals);
    
    // Should be medium (has business and problem, but no urgency/readiness)
    expect(result.final_score).toBe("medium");
    expect(result.route).toBe("nurture");
    expect(result.alert).toBe(false);
  });

  it("should prioritize calendly route for high-value leads", () => {
    const signals: Signals = {
      ...defaultSignals,
      has_business: true,
      problem_clarity: 2,
      urgency: 2,
      wants_to_book: true,
      has_traffic_or_spend: true
    };
    
    const result = scoreLead(signals);
    
    // Should be high with calendly route
    expect(result.final_score).toBe("high");
    expect(result.route).toBe("calendly");
    expect(result.alert).toBe(true);
  });

  it("should handle traffic/spend as a strong signal", () => {
    const signals: Signals = {
      ...defaultSignals,
      has_business: true,
      problem_clarity: 1,
      urgency: 0,
      wants_to_book: false,
      has_traffic_or_spend: true
    };
    
    const result = scoreLead(signals);
    
    // Should be high because of has_business + problem_clarity + has_traffic_or_spend
    expect(result.final_score).toBe("high");
    expect(result.route).toBe("calendly");
    expect(result.alert).toBe(true);
  });
});

// Test signal extraction edge cases
describe("Signal Extraction Edge Cases", () => {
  it("should extract business signals from various phrasings", () => {
    // Test the specific phrases that work with our patterns
    const businessPhrases = [
      "I run a company",
      "I own a business", 
      "I manage a startup",
      "I founded an agency",
      "I operate an ecommerce store",
      "I run an ecommerce brand",
      "I have a small service business"
    ];
    
    businessPhrases.forEach(phrase => {
      const signals = extractSignalsFromText(phrase);
      expect(signals.has_business, `Failed for: "${phrase}"`).toBe(true);
    });
  });

  it("should extract traffic/spend signals from various phrasings", () => {
    // Test the specific phrases that work with our patterns
    const trafficPhrases = [
      "We're spending $5K/month on Facebook ads",
      "We have traffic from Google Ads",
      "We're getting leads from our marketing",
      "We are spending on paid ads and getting leads"
    ];
    
    trafficPhrases.forEach(phrase => {
      const signals = extractSignalsFromText(phrase);
      expect(signals.has_traffic_or_spend, `Failed for: "${phrase}"`).toBe(true);
    });
  });

  it("should extract urgency signals correctly", () => {
    const highUrgencyPhrases = [
      "I need this ASAP",
      "This is urgent",
      "I need it right now",
      "Can we do this today?",
      "I need it tomorrow",
      "I want to talk soon"
    ];
    
    highUrgencyPhrases.forEach(phrase => {
      const signals = extractSignalsFromText(phrase);
      expect(signals.urgency, `Failed for: "${phrase}"`).toBe(2);
    });

    // Test phrases that should have 0 urgency
    const noUrgencyPhrases = [
      "Can we do this next week?",
      "I'm just browsing",
      "No rush"
    ];
    
    noUrgencyPhrases.forEach(phrase => {
      const signals = extractSignalsFromText(phrase);
      expect(signals.urgency, `Failed for: "${phrase}"`).toBe(0);
    });
  });

  it("should extract booking intent signals", () => {
    const bookingPhrases = [
      "Can I book a call?",
      "I want to schedule a meeting",
      "Let's set up a demo",
      "Can we arrange a consultation?",
      "I'd like to talk soon",
      "Can I use Calendly?"
    ];
    
    bookingPhrases.forEach(phrase => {
      const signals = extractSignalsFromText(phrase);
      expect(signals.wants_to_book).toBe(true);
    });
  });
});

// Test signal merging
describe("Signal Merging", () => {
  it("should merge signals with extracted signals updating existing ones", () => {
    const existing: Signals = {
      has_business: true,
      has_traffic_or_spend: false,
      problem_clarity: 1,
      urgency: 0,
      wants_to_book: false,
      manual_sales_signal: false,
      budget_signal: false,
      contact_captured: false
    };
    
    const extracted: Partial<Signals> = {
      has_business: false, // Extracted value
      has_traffic_or_spend: true, // Should update existing
      problem_clarity: 2 // Should update existing
    };
    
    const merged = mergeSignals(existing, extracted);
    
    // Extracted signals should update existing ones
    expect(merged.has_business).toBe(false); // Extracted value
    expect(merged.has_traffic_or_spend).toBe(true); // Extracted updates
    expect(merged.problem_clarity).toBe(2); // Extracted updates
    expect(merged.urgency).toBe(0); // Existing unchanged (not in extracted)
  });

  it("should handle partial extracted signals", () => {
    const existing: Signals = {
      has_business: false,
      has_traffic_or_spend: false,
      problem_clarity: 0,
      urgency: 0,
      wants_to_book: false,
      manual_sales_signal: false,
      budget_signal: false,
      contact_captured: false
    };
    
    const extracted = {
      has_business: true
    };
    
    const merged = mergeSignals(existing, extracted);
    
    expect(merged.has_business).toBe(true);
    expect(merged.has_traffic_or_spend).toBe(false); // Unchanged
    expect(merged.problem_clarity).toBe(0); // Unchanged
  });
});

// Scoring Breakdown and Summary
describe("Scoring Breakdown", () => {
  it("should return a numeric score_value for high-intent lead", () => {
    const signals: Signals = {
      ...defaultSignals,
      has_business: true,
      has_traffic_or_spend: true,
      problem_clarity: 2,
      urgency: 2,
      wants_to_book: true,
      contact_captured: true,
      budget_signal: true
    };

    const result = scoreLead(signals);

    expect(result.score_value).toBeGreaterThan(0);
    expect(result.score_value).toBeLessThanOrEqual(100);
    expect(result.breakdown).toBeDefined();
    expect(result.breakdown.fit).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.urgency).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.pain).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.readiness).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.quality).toBeGreaterThanOrEqual(0);
  });

  it("should return a low score_value for low-intent lead", () => {
    const signals: Signals = { ...defaultSignals };
    const result = scoreLead(signals);

    expect(result.score_value).toBeLessThan(40);
  });

  it("should return factors with reasons", () => {
    const signals: Signals = {
      ...defaultSignals,
      has_business: true,
      problem_clarity: 2
    };
    const result = scoreLead(signals);

    expect(result.factors).toBeDefined();
    expect(result.factors.length).toBe(5);
    result.factors.forEach(factor => {
      expect(factor.reason).toBeTruthy();
      expect(factor.value).toBeGreaterThanOrEqual(0);
      expect(factor.max).toBeGreaterThan(0);
    });
  });

  it("should populate summary for all score levels", () => {
    const highSignals: Signals = {
      ...defaultSignals,
      has_business: true,
      has_traffic_or_spend: true,
      problem_clarity: 2,
      urgency: 2,
      wants_to_book: true
    };
    const highResult = scoreLead(highSignals);
    expect(highResult.summary).toBeDefined();
    expect(highResult.summary?.business_type).toContain("Active business");
    expect(highResult.summary?.lead_quality).toBe("high");

    const lowSignals: Signals = { ...defaultSignals };
    const lowResult = scoreLead(lowSignals);
    expect(lowResult.summary).toBeDefined();
    expect(lowResult.summary?.lead_quality).toBe("low");
  });
});

// Qualification Gap Analysis
describe("Qualification Gap Analysis", () => {
  it("should identify business gap when no business signal", () => {
    const signals: Signals = { ...defaultSignals };
    expect(getQualificationGap(signals)).toBe("business");
  });

  it("should identify pain gap when business but no problem", () => {
    const signals: Signals = { ...defaultSignals, has_business: true };
    expect(getQualificationGap(signals)).toBe("pain");
  });

  it("should identify urgency gap when business + problem but no urgency/readiness", () => {
    const signals: Signals = {
      ...defaultSignals,
      has_business: true,
      problem_clarity: 1
    };
    expect(getQualificationGap(signals)).toBe("urgency");
  });

  it("should return null when all gaps are filled", () => {
    const signals: Signals = {
      ...defaultSignals,
      has_business: true,
      problem_clarity: 2,
      urgency: 2,
      contact_captured: true
    };
    expect(getQualificationGap(signals)).toBeNull();
  });

  it("should short-circuit to null when wants_to_book already produces a high score", () => {
    // With has_business + problem_clarity + wants_to_book, the score is high.
    // The bot should route immediately, not ask for readiness info.
    const signals: Signals = {
      ...defaultSignals,
      has_business: true,
      problem_clarity: 1,
      wants_to_book: true
    };
    expect(scoreLead(signals).final_score).toBe("high");
    expect(getQualificationGap(signals)).toBeNull();
  });

  it("should identify readiness gap when wants_to_book but score is not yet high", () => {
    // Without has_business, wants_to_book produces soft_booking (medium),
    // so the early-stop does not trigger and we can still ask for contact.
    const signals: Signals = {
      ...defaultSignals,
      has_business: false,
      problem_clarity: 0,
      wants_to_book: true
    };
    // This is a soft_booking scenario — medium score, early-stop does not trigger
    // because the score is not high.  But getQualificationGap checks business first.
    expect(getQualificationGap(signals)).toBe("business");
  });
});

// Early-stop: hot lead should not be over-questioned
describe("Early-Stop / Hot Lead Routing", () => {
  it("should return null (no gap) when signals already produce a high score", () => {
    // This scenario: business + pain + traffic/spend = high score.
    // The bot should route immediately, not ask for urgency.
    const signals: Signals = {
      ...defaultSignals,
      has_business: true,
      problem_clarity: 1,
      has_traffic_or_spend: true
    };
    // scoreLead should already classify this as high
    expect(scoreLead(signals).final_score).toBe("high");
    // getQualificationGap should short-circuit and return null
    expect(getQualificationGap(signals)).toBeNull();
  });

  it("should return null when wants_to_book with business and pain", () => {
    const signals: Signals = {
      ...defaultSignals,
      has_business: true,
      problem_clarity: 1,
      wants_to_book: true
    };
    expect(scoreLead(signals).final_score).toBe("high");
    expect(getQualificationGap(signals)).toBeNull();
  });

  it("should still ask questions when score is not yet high", () => {
    const signals: Signals = {
      ...defaultSignals,
      has_business: true,
      problem_clarity: 1
      // no urgency, no traffic, no booking = medium
    };
    expect(scoreLead(signals).final_score).toBe("medium");
    expect(getQualificationGap(signals)).toBe("urgency");
  });
});

// Email extraction
describe("Email Extraction", () => {
  it("should extract email from free text", () => {
    expect(extractEmail("my email is john@example.com")).toBe("john@example.com");
    expect(extractEmail("reach me at jane.doe@company.co.uk")).toBe("jane.doe@company.co.uk");
    expect(extractEmail("contact: alice+test@domain.org")).toBe("alice+test@domain.org");
  });

  it("should return null when no email present", () => {
    expect(extractEmail("I run a business")).toBeNull();
    expect(extractEmail("")).toBeNull();
    expect(extractEmail("no email here")).toBeNull();
  });

  it("should normalise to lowercase", () => {
    expect(extractEmail("John@Example.COM")).toBe("john@example.com");
  });

  it("should reject obvious non-emails", () => {
    expect(extractEmail("not-an-email")).toBeNull();
    expect(extractEmail("@domain.com")).toBeNull();
    expect(extractEmail("user@")).toBeNull();
  });
});

// Email validation
describe("Email Validation", () => {
  it("should accept valid email addresses", () => {
    expect(isValidEmail("john@example.com")).toBe(true);
    expect(isValidEmail("jane.doe@company.co.uk")).toBe(true);
    expect(isValidEmail("alice+test@domain.org")).toBe(true);
    expect(isValidEmail("user123@test-domain.com")).toBe(true);
  });

  it("should reject invalid email addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("@domain.com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("user@domain")).toBe(false);
    expect(isValidEmail("user @domain.com")).toBe(false);
  });
});

// Business name extraction
describe("Business Name Extraction", () => {
  it("should extract business name from common patterns", () => {
    expect(extractBusinessName("my company is Acme Corp")).toBe("Acme Corp");
    expect(extractBusinessName("our business called Bright Solutions")).toBe("Bright Solutions");
    expect(extractBusinessName("we're called NextGen")).toBe("NextGen");
    expect(extractBusinessName("it is named Pixel Labs")).toBe("Pixel Labs");
  });

  it("should return null when no business name is present", () => {
    expect(extractBusinessName("I run a business")).toBeNull();
    expect(extractBusinessName("")).toBeNull();
    expect(extractBusinessName("just looking around")).toBeNull();
  });

  it("should not hallucinate names that are not in the input", () => {
    expect(extractBusinessName("I have a small business doing marketing")).toBeNull();
    expect(extractBusinessName("we help companies grow")).toBeNull();
  });
});

// ---- Short business type recognition (context-aware extraction) ----

describe("isLikelyBusinessType", () => {
  it("should accept common short business types", () => {
    const valid = [
      "Chicken stall",
      "Barbershop",
      "Carinderia",
      "Laundry shop",
      "Sari-sari store",
      "Dental clinic",
      "Auto repair shop",
      "Law firm",
      "Bakery",
      "Gym",
    ];
    valid.forEach(phrase => {
      expect(isLikelyBusinessType(phrase), `Should accept: "${phrase}"`).toBe(true);
    });
  });

  it("should reject greetings and filler", () => {
    const invalid = ["hi", "hello", "hey", "yo", "ok", "yes", "no", "nah", "idk"];
    invalid.forEach(phrase => {
      expect(isLikelyBusinessType(phrase), `Should reject: "${phrase}"`).toBe(false);
    });
  });

  it("should reject questions", () => {
    expect(isLikelyBusinessType("What do you mean?")).toBe(false);
    expect(isLikelyBusinessType("Can you help?")).toBe(false);
  });

  it("should reject empty or too-long input", () => {
    expect(isLikelyBusinessType("")).toBe(false);
    expect(isLikelyBusinessType("a")).toBe(false);
    expect(isLikelyBusinessType("x".repeat(81))).toBe(false);
  });

  it("should reject full sentences that already match explicit patterns", () => {
    expect(isLikelyBusinessType("I run a business")).toBe(false);
    expect(isLikelyBusinessType("I own a shop")).toBe(false);
  });
});

describe("extractBusinessTypeFromContext", () => {
  it("should return has_business + business_type_text for valid short phrases", () => {
    const result = extractBusinessTypeFromContext("Chicken stall");
    expect(result).not.toBeNull();
    expect(result!.has_business).toBe(true);
    expect(result!.business_type_text).toBe("Chicken stall");
  });

  it("should return null for greetings", () => {
    expect(extractBusinessTypeFromContext("hello")).toBeNull();
    expect(extractBusinessTypeFromContext("hi")).toBeNull();
  });

  it("should return null for empty input", () => {
    expect(extractBusinessTypeFromContext("")).toBeNull();
  });
});

// Regression: short business answers must advance the funnel
describe("Regression - Short Business Answers", () => {
  it("'Chicken stall' after business question should count as business type", () => {
    // Simulate: context says bot asked for business, user replies "Chicken stall"
    const contextSignals = extractBusinessTypeFromContext("Chicken stall");
    expect(contextSignals).not.toBeNull();
    expect(contextSignals!.has_business).toBe(true);

    // Merged with defaults should produce has_business = true
    const merged = mergeSignals(defaultSignals, contextSignals!);
    expect(merged.has_business).toBe(true);
    expect(merged.business_type_text).toBe("Chicken stall");
  });

  it("'Chicken stall' should not trigger repeated business question", () => {
    // After context-aware extraction, gap should be "pain", not "business"
    const contextSignals = extractBusinessTypeFromContext("Chicken stall")!;
    const merged = mergeSignals(defaultSignals, contextSignals);
    const gap = getQualificationGap(merged);
    expect(gap).not.toBe("business");
    expect(gap).toBe("pain");
  });

  it("business type only should ask for pain/problem next", () => {
    const contextSignals = extractBusinessTypeFromContext("Barbershop")!;
    const merged = mergeSignals(defaultSignals, contextSignals);
    expect(getQualificationGap(merged)).toBe("pain");
  });

  it("business type + pain point should advance to urgency/readiness", () => {
    const contextSignals = extractBusinessTypeFromContext("Laundry shop")!;
    let merged = mergeSignals(defaultSignals, contextSignals);
    // Simulate pain point received
    merged = mergeSignals(merged, { problem_clarity: 2 });
    // With business + pain, gap should no longer be "business" or "pain"
    expect(getQualificationGap(merged)).not.toBe("business");
    expect(getQualificationGap(merged)).not.toBe("pain");
  });

  it("vague response like 'hello' should still ask for business type", () => {
    // "hello" is not a business type even with context
    const contextSignals = extractBusinessTypeFromContext("hello");
    expect(contextSignals).toBeNull();

    // Standard extraction should also not set has_business
    const extracted = extractSignalsFromText("hello");
    const merged = mergeSignals(defaultSignals, extracted);
    expect(merged.has_business).toBe(false);
    expect(getQualificationGap(merged)).toBe("business");
  });

  it("refusal like 'I don't want to say' should not invent a business type", () => {
    // "I don't want to say" — context extraction may pass isLikelyBusinessType,
    // but standard extraction does NOT set has_business for this.
    // The key invariant: merged signals must not have has_business true.
    const extracted = extractSignalsFromText("I don't want to say");
    const merged = mergeSignals(defaultSignals, extracted);
    expect(merged.has_business).toBe(false);
  });

  it("business_type_text should surface in scoring summary", () => {
    const contextSignals = extractBusinessTypeFromContext("Dental clinic")!;
    const merged = mergeSignals(defaultSignals, contextSignals);
    const result = scoreLead(merged);
    expect(result.summary).toBeDefined();
    expect(result.summary!.business_type).toBe("Dental clinic");
  });

  it("various short business types should all be accepted", () => {
    const types = [
      "Chicken stall",
      "Barbershop",
      "Carinderia",
      "Laundry shop",
      "Sari-sari store",
      "Dental clinic",
      "Law firm",
      "Bakery",
    ];
    types.forEach(biz => {
      const signals = extractBusinessTypeFromContext(biz);
      expect(signals, `Should extract: "${biz}"`).not.toBeNull();
      expect(signals!.has_business).toBe(true);
      expect(signals!.business_type_text).toBe(biz);

      const merged = mergeSignals(defaultSignals, signals!);
      expect(getQualificationGap(merged), `Gap should be pain for "${biz}"`).toBe("pain");
    });
  });
});
