// TQ ChatBot #1 - Idempotency and Suppression Layer
//
// Prevents duplicate writes and suppresses spammy/redundant alerts.
// All logic is deterministic and explainable.

/**
 * Generate a stable idempotency key from session + message content.
 * Retries with the same session + content will produce the same key,
 * allowing the storage layer to reject duplicates.
 */
export function makeIdempotencyKey(sessionId: string, content: string, role: string): string {
  // Simple hash-free approach: concatenate stable parts.
  // In production, this would be a SHA-256 hash stored alongside the record.
  return `${sessionId}:${role}:${content.trim().toLowerCase().slice(0, 200)}`;
}

/**
 * In-memory idempotency tracker.
 * Tracks which keys have been seen to prevent duplicate inserts.
 *
 * In production with Supabase, a UNIQUE constraint on
 * (session_id, content_hash, role) in chat_messages would serve the same
 * purpose at the database level.
 */
class IdempotencyTracker {
  private seen = new Set<string>();
  private readonly maxEntries = 5000;

  has(key: string): boolean {
    return this.seen.has(key);
  }

  add(key: string): void {
    // Evict oldest entries if we hit the cap (simple FIFO via re-insertion).
    if (this.seen.size >= this.maxEntries) {
      const first = this.seen.values().next().value;
      if (first !== undefined) this.seen.delete(first);
    }
    this.seen.add(key);
  }

  reset(): void {
    this.seen.clear();
  }
}

export const idempotencyTracker = new IdempotencyTracker();

// ---- Suppression ----

/**
 * Suppression rules for alerts and notifications.
 *
 * Rule 1: Same lead does not trigger duplicate alerts within a cooldown window.
 * Rule 2: Spam-like submissions (very short, no business signal) are suppressed.
 * Rule 3: Repeated messages in the same session do not re-fire alerts.
 *
 * These rules are enforced client-side for the in-memory MVP.
 * In production, the Edge Function enforces them server-side.
 */

const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const alertTimestamps = new Map<string, number>();

/**
 * Check whether an alert for this lead should be suppressed.
 * Returns true if the alert should be suppressed (NOT sent).
 */
export function shouldSuppressAlert(leadId: string, score: string): boolean {
  // Low-score leads never get alerts
  if (score === "low") return true;

  const now = Date.now();
  const lastAlert = alertTimestamps.get(leadId);

  if (lastAlert !== undefined && now - lastAlert < ALERT_COOLDOWN_MS) {
    return true; // Within cooldown window
  }

  alertTimestamps.set(leadId, now);
  return false;
}

/**
 * Check whether a message looks like spam or empty submission.
 * Returns true if the message should be suppressed.
 */
export function isSpamSubmission(content: string): boolean {
  const trimmed = content.trim();
  // Too short to be meaningful
  if (trimmed.length < 2) return true;
  // Only punctuation or whitespace
  if (!/[a-zA-Z0-9]/.test(trimmed)) return true;
  // Repeated same character
  if (/^(.)\1{4,}$/.test(trimmed)) return true;
  return false;
}

/**
 * Reset suppression state (for testing).
 */
export function resetSuppression(): void {
  alertTimestamps.clear();
}
