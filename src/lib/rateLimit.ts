// TQ ChatBot #1 - Rate Limiting
//
// Client-side rate limiter for the public chat endpoint.
//
// SECURITY POSTURE:
// In the browser MVP, rate limiting is enforced client-side only. This is a
// UX guard, not a security boundary — a determined attacker can bypass it.
//
// Production hardening requires:
// 1. Supabase Edge Function /api/chat that enforces per-IP and per-session
//    rate limits before forwarding to the LLM or writing to the database.
// 2. Supabase Database Function (RPC) that enforces per-visitor write quotas.
// 3. CDN/WAF layer (Cloudflare, AWS WAF) with bot detection and IP reputation.
//
// The client-side limiter here prevents accidental rapid-fire from normal
// users (double-click, keyboard repeat) and keeps API cost exposure bounded
// during development.

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

class ClientRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private timestamps: number[] = [];

  constructor(windowMs: number = 60_000, maxRequests: number = 30) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Check whether a request is allowed under the current rate limit.
   * Call this BEFORE processing a user message.
   */
  check(): RateLimitResult {
    const now = Date.now();
    // Prune timestamps outside the window
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0];
      const retryAfterMs = this.windowMs - (now - oldest);
      return { allowed: false, retryAfterMs };
    }

    this.timestamps.push(now);
    return { allowed: true };
  }

  /**
   * Reset the limiter (for testing).
   */
  reset(): void {
    this.timestamps = [];
  }
}

// Default: 30 messages per 60 seconds per browser tab.
export const chatRateLimiter = new ClientRateLimiter(60_000, 30);
