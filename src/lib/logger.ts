// TQ ChatBot — Safe Logger
// In production, redacts PII and suppresses debug detail.
// In development, preserves full operational context for debugging.

const IS_DEV = import.meta.env.DEV;

const PII_FIELDS = new Set([
  "email",
  "phone",
  "name",
  "contact_info",
  "contactInfo",
  "content",
  "message",
  "api_key",
  "apiKey",
  "apikey",
  "authorization",
  "token",
  "secret",
  "password",
  "bookingData",
]);

const REDACTED = "[REDACTED]";

function redactValue(key: string, value: unknown): unknown {
  if (PII_FIELDS.has(key)) return REDACTED;
  if (typeof value === "string") {
    // Email pattern redaction
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return REDACTED;
    // Phone pattern redaction
    if (/^\+?[\d\s\-()]{7,}$/.test(value.trim())) return REDACTED;
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const redacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      redacted[k] = redactValue(k, v);
    }
    return redacted;
  }
  return value;
}

function safeArgs(args: unknown[]): unknown[] {
  if (IS_DEV) return args;
  return args.map((arg) => {
    if (typeof arg === "string") return arg;
    if (typeof arg === "object" && arg !== null) {
      return redactValue("", arg);
    }
    return arg;
  });
}

export const logger = {
  info(...args: unknown[]) {
    if (IS_DEV) console.log(...args);
  },
  warn(...args: unknown[]) {
    console.warn(...safeArgs(args));
  },
  error(...args: unknown[]) {
    console.error(...safeArgs(args));
  },
  debug(...args: unknown[]) {
    if (IS_DEV) console.log("[DEBUG]", ...args);
  },
};
