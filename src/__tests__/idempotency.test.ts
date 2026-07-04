// TQ ChatBot #1 - Tests for idempotency, suppression, and rate limiting

import { describe, it, expect, beforeEach } from "vitest";
import {
  makeIdempotencyKey,
  idempotencyTracker,
  shouldSuppressAlert,
  isSpamSubmission,
  resetSuppression
} from "../lib/idempotency";
import { chatRateLimiter } from "../lib/rateLimit";

describe("Idempotency Key Generation", () => {
  it("should produce the same key for identical inputs", () => {
    const key1 = makeIdempotencyKey("sess-1", "hello world", "user");
    const key2 = makeIdempotencyKey("sess-1", "hello world", "user");
    expect(key1).toBe(key2);
  });

  it("should produce different keys for different sessions", () => {
    const key1 = makeIdempotencyKey("sess-1", "hello", "user");
    const key2 = makeIdempotencyKey("sess-2", "hello", "user");
    expect(key1).not.toBe(key2);
  });

  it("should produce different keys for different roles", () => {
    const key1 = makeIdempotencyKey("sess-1", "hello", "user");
    const key2 = makeIdempotencyKey("sess-1", "hello", "assistant");
    expect(key1).not.toBe(key2);
  });

  it("should normalise whitespace and case", () => {
    const key1 = makeIdempotencyKey("sess-1", "  Hello World  ", "user");
    const key2 = makeIdempotencyKey("sess-1", "hello world", "user");
    expect(key1).toBe(key2);
  });
});

describe("Idempotency Tracker", () => {
  beforeEach(() => {
    idempotencyTracker.reset();
  });

  it("should track seen keys", () => {
    expect(idempotencyTracker.has("key-1")).toBe(false);
    idempotencyTracker.add("key-1");
    expect(idempotencyTracker.has("key-1")).toBe(true);
  });

  it("should not report unseen keys as seen", () => {
    idempotencyTracker.add("key-1");
    expect(idempotencyTracker.has("key-2")).toBe(false);
  });
});

describe("Alert Suppression", () => {
  beforeEach(() => {
    resetSuppression();
  });

  it("should suppress low-score alerts", () => {
    expect(shouldSuppressAlert("lead-1", "low")).toBe(true);
  });

  it("should not suppress high-score alerts on first call", () => {
    expect(shouldSuppressAlert("lead-1", "high")).toBe(false);
  });

  it("should suppress duplicate high-score alerts within cooldown", () => {
    shouldSuppressAlert("lead-1", "high");
    expect(shouldSuppressAlert("lead-1", "high")).toBe(true);
  });

  it("should not suppress alerts for different leads", () => {
    shouldSuppressAlert("lead-1", "high");
    expect(shouldSuppressAlert("lead-2", "high")).toBe(false);
  });
});

describe("Spam Submission Detection", () => {
  it("should flag empty or very short input", () => {
    expect(isSpamSubmission("")).toBe(true);
    expect(isSpamSubmission("a")).toBe(true);
    expect(isSpamSubmission("  ")).toBe(true);
  });

  it("should flag input with no alphanumeric characters", () => {
    expect(isSpamSubmission("???")).toBe(true);
    expect(isSpamSubmission("!!!")).toBe(true);
  });

  it("should flag repeated same character", () => {
    expect(isSpamSubmission("aaaaaa")).toBe(true);
  });

  it("should accept normal text", () => {
    expect(isSpamSubmission("I run a business")).toBe(false);
    expect(isSpamSubmission("hello")).toBe(false);
    expect(isSpamSubmission("yes")).toBe(false);
  });
});

describe("Rate Limiter", () => {
  beforeEach(() => {
    chatRateLimiter.reset();
  });

  it("should allow requests within the limit", () => {
    const result = chatRateLimiter.check();
    expect(result.allowed).toBe(true);
  });

  it("should block requests exceeding the limit", () => {
    for (let i = 0; i < 30; i++) {
      chatRateLimiter.check();
    }
    const result = chatRateLimiter.check();
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });
});
