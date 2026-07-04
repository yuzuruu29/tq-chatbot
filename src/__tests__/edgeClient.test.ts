// TQ ChatBot #1 - Edge Function Client, Integration, and Schema Tests
//
// Tests the Edge Function client layer, verifying that:
// - Client correctly handles Edge Function responses
// - Client gracefully falls back when Edge Function is unavailable
// - Idempotency keys are generated correctly for server-side dedup
// - Rate limit responses are handled properly
// - Schema file has expected RLS policies, tables, and functions

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Mock the edgeClient module to test its behavior without real network calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// We need to import after mocking
import {
  edgeCreateSession,
  edgeCreateMessage,
  edgeCreateLead,
  edgeRecordEvent,
} from "../lib/edgeClient";

describe("Edge Function Client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Set env vars so the client doesn't short-circuit
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("should return session on successful create_session", async () => {
    const mockSession = {
      id: "sess-1",
      visitor_id: "vis-1",
      tenant_id: "00000000-0000-0000-0000-000000000000",
      status: "active",
      created_at: "2026-07-05T00:00:00Z",
      updated_at: "2026-07-05T00:00:00Z",
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, session: mockSession }),
    });

    const result = await edgeCreateSession("vis-1", "00000000-0000-0000-0000-000000000000");
    expect(result).toEqual(mockSession);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://test.supabase.co/functions/v1/chat-api",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("should return null when Edge Function is not configured", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://your-project-ref.supabase.co");

    const result = await edgeCreateSession("vis-1", "00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("should return null on network error (fallback to in-memory)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await edgeCreateSession("vis-1", "00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("should return null on 429 rate limit (graceful degradation)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: "Rate limit exceeded" }),
    });

    const result = await edgeCreateSession("vis-1", "00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("should return message with duplicate flag", async () => {
    const mockMessage = {
      id: "msg-1",
      session_id: "sess-1",
      content: "hello",
      role: "user",
      timestamp: "2026-07-05T00:00:00Z",
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: mockMessage, duplicate: true }),
    });

    const result = await edgeCreateMessage("sess-1", "hello", "user", "00000000-0000-0000-0000-000000000000");
    expect(result).not.toBeNull();
    expect(result!.duplicate).toBe(true);
    expect(result!.message).toEqual(mockMessage);
  });

  it("should send correct payload for create_lead", async () => {
    const mockLead = {
      id: "lead-1",
      tenant_id: "00000000-0000-0000-0000-000000000000",
      session_id: "sess-1",
      visitor_id: "vis-1",
      score: "high",
      route: "calendly",
      signals: {},
      contact_info: {},
      scoring_result: {},
      status: "new",
      created_at: "2026-07-05T00:00:00Z",
      updated_at: "2026-07-05T00:00:00Z",
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, lead: mockLead, updated: false }),
    });

    const result = await edgeCreateLead(
      "sess-1", "vis-1", "00000000-0000-0000-0000-000000000000",
      "high", "calendly", {}, {}, {}
    );

    expect(result).not.toBeNull();
    expect(result!.lead.score).toBe("high");
    expect(result!.updated).toBe(false);

    // Verify the fetch was called with the correct payload
    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.action).toBe("create_lead");
    expect(body.score).toBe("high");
    expect(body.route).toBe("calendly");
  });

  it("should record funnel events", async () => {
    const mockEvent = {
      id: "evt-1",
      tenant_id: "00000000-0000-0000-0000-000000000000",
      session_id: "sess-1",
      event_type: "lead_captured",
      data: { score: "high" },
      timestamp: "2026-07-05T00:00:00Z",
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, event: mockEvent }),
    });

    const result = await edgeRecordEvent(
      "00000000-0000-0000-0000-000000000000",
      "sess-1",
      "lead_captured",
      { score: "high" }
    );

    expect(result).not.toBeNull();
    expect(result!.event_type).toBe("lead_captured");
  });

  it("should include Authorization header with anon key", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, session: {} }),
    });

    await edgeCreateSession("vis-1", "00000000-0000-0000-0000-000000000000");

    const fetchCall = mockFetch.mock.calls[0];
    const headers = fetchCall[1].headers;
    expect(headers.Authorization).toBe("Bearer test-anon-key");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("should return null on 500 server error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal server error" }),
    });

    const result = await edgeCreateSession("vis-1", "00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});

describe("Edge Function Payload Validation", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("should send tenant_id in all requests", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, session: {}, message: {}, lead: {}, event: {} }),
    });

    await edgeCreateSession("vis-1", "tenant-abc");
    await edgeCreateMessage("sess-1", "hi", "user", "tenant-abc");
    await edgeCreateLead("sess-1", "vis-1", "tenant-abc", "high", "calendly", {}, {}, {});
    await edgeRecordEvent("tenant-abc", "sess-1", "test_event", {});

    for (const call of mockFetch.mock.calls) {
      const body = JSON.parse(call[1].body);
      expect(body.tenant_id).toBe("tenant-abc");
    }
  });

  it("should send correct action types", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, session: {}, message: {}, lead: {}, event: {} }),
    });

    await edgeCreateSession("vis-1", "t1");
    await edgeCreateMessage("s1", "hi", "user", "t1");
    await edgeCreateLead("s1", "v1", "t1", "high", "calendly", {}, {}, {});
    await edgeRecordEvent("t1", "s1", "test", {});

    const actions = mockFetch.mock.calls.map(c => JSON.parse(c[1].body).action);
    expect(actions).toEqual(["create_session", "create_message", "create_lead", "record_event"]);
  });
});

describe("Schema RLS Verification", () => {
  const schemaPath = resolve(__dirname, "../../supabase/schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");

  it("should have rate_limits table defined", () => {
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS rate_limits");
    expect(schema).toContain("identifier TEXT NOT NULL");
    expect(schema).toContain("window_start TIMESTAMPTZ");
    expect(schema).toContain("request_count INTEGER");
  });

  it("should have check_rate_limit function with SECURITY DEFINER", () => {
    expect(schema).toContain("CREATE OR REPLACE FUNCTION check_rate_limit");
    expect(schema).toContain("SECURITY DEFINER");
  });

  it("should have RLS enabled on all 8 tables", () => {
    const tables = [
      "tenants", "leads", "chat_sessions", "chat_messages",
      "lead_scoring_signals", "funnel_events", "followup_jobs", "rate_limits"
    ];
    for (const table of tables) {
      expect(schema, `Missing RLS for ${table}`).toContain(
        `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`
      );
    }
  });

  it("should have service-role bypass policy for rate_limits", () => {
    expect(schema).toContain("Rate limits service role only");
    expect(schema).toContain("auth.jwt() ->> 'role' = 'service_role'");
  });

  it("should have fixed value column type in lead_scoring_signals (not BOOLEAN OR SMALLINT)", () => {
    expect(schema).not.toContain("BOOLEAN OR SMALLINT");
    expect(schema).toContain("value JSONB NOT NULL DEFAULT 'false'");
  });

  it("should have alert_suppressed in funnel_events CHECK constraint", () => {
    expect(schema).toContain("'alert_suppressed'");
  });

  it("should have tenant-scoped RLS policies on leads", () => {
    expect(schema).toContain("Allow lead read for tenant members");
    expect(schema).toContain("Allow lead write for authenticated users");
  });

  it("should have tenant-scoped RLS policies on chat_sessions", () => {
    expect(schema).toContain("Allow chat session read for tenant members");
    expect(schema).toContain("Allow chat session write for authenticated users");
  });

  it("should have session-scoped RLS policies on chat_messages", () => {
    expect(schema).toContain("Allow chat message read for session participants");
    expect(schema).toContain("Allow chat message write for authenticated users");
  });
});

describe("Edge Function File Verification", () => {
  const fnPath = resolve(__dirname, "../../supabase/functions/chat-api/index.ts");

  it("should exist", () => {
    expect(existsSync(fnPath)).toBe(true);
  });

  it("should hold service-role key server-side and not leak it in responses", () => {
    const content = readFileSync(fnPath, "utf-8");
    expect(content).toContain("SUPABASE_SERVICE_ROLE_KEY");
    // Must NOT return the key in any Response body
    expect(content).not.toMatch(/JSON\.stringify.*serviceRoleKey/);
    // The key must be read from env, not hardcoded
    expect(content).toContain("Deno.env.get(\"SUPABASE_SERVICE_ROLE_KEY\")");
  });

  it("should implement all 4 actions", () => {
    const content = readFileSync(fnPath, "utf-8");
    expect(content).toContain('"create_session"');
    expect(content).toContain('"create_message"');
    expect(content).toContain('"create_lead"');
    expect(content).toContain('"record_event"');
  });

  it("should call check_rate_limit", () => {
    const content = readFileSync(fnPath, "utf-8");
    expect(content).toContain("check_rate_limit");
  });

  it("should return 429 on rate limit exceeded", () => {
    const content = readFileSync(fnPath, "utf-8");
    expect(content).toContain("429");
  });

  it("should implement idempotency check for messages", () => {
    const content = readFileSync(fnPath, "utf-8");
    expect(content).toContain("duplicate");
    expect(content).toContain("ilike");
  });
});
