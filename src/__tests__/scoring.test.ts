// TQ ChatBot #1 - Acceptance Tests for Scoring Scenarios
// These tests verify the deterministic scoring function works as expected

import { describe, it, expect } from "vitest";
import { scoreLead, extractSignalsFromText, defaultSignals, mergeSignals } from "../lib/scoring";
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
