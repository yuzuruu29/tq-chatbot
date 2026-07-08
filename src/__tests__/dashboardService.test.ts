import { describe, it, expect } from "vitest";
import { computeFunnelFromEvents, dashboardService } from "../services/dashboardService";
import { leadService } from "../services/leadService";
import { scoreLead, defaultSignals } from "../lib/scoring";
import type { VisitorContext } from "../types";

const TENANT_ID = "00000000-0000-0000-0000-000000000000";

describe("computeFunnelFromEvents", () => {
  it("builds ordered steps with drop percentages", () => {
    const steps = computeFunnelFromEvents([
      { event_type: "chat_started", count: 100 },
      { event_type: "calendly_shown", count: 40 },
      { event_type: "calendly_clicked", count: 25 },
      { event_type: "calendly_booked", count: 10 },
    ]);
    expect(steps.map((s) => s.name)).toEqual(["Landed", "Calendly Shown", "Clicked", "Booked"]);
    expect(steps[1].drop).toBe("-60%"); // 100 -> 40
    expect(steps[2].drop).toBe("-38%"); // 40 -> 25
    expect(steps[3].drop).toBe("-60%"); // 25 -> 10
  });

  it("drops zero-value steps and skips their drops", () => {
    const steps = computeFunnelFromEvents([
      { event_type: "chat_started", count: 50 },
      { event_type: "calendly_booked", count: 0 },
    ]);
    expect(steps).toEqual([{ name: "Landed", value: 50 }]);
  });
});

describe("DashboardService.getDashboardData", () => {
  it("returns the in-memory fallback (hasRealData=false) when Supabase is not configured", async () => {
    const data = await dashboardService.getDashboardData(TENANT_ID);
    expect(data.hasRealData).toBe(false);
    expect(Array.isArray(data.leads)).toBe(true);
    expect(data.calendly).toEqual({ shown: 0, clicked: 0, booked: 0 });
  });

  it("surfaces leads created during the session in the fallback path", async () => {
    const ctx: VisitorContext = {
      visitor_id: "vh-dash-test",
      session_id: "ses-dash-test",
      tenant_id: TENANT_ID,
    };
    const expected = scoreLead(defaultSignals).final_score;
    const lead = await leadService.createLead(ctx, "I run a business and want to book", {
      name: "Test User",
      email: "test@example.com",
    });

    const data = await dashboardService.getDashboardData(TENANT_ID);
    expect(data.leads.some((l) => l.id === lead.id)).toBe(true);
    expect(data.scoreSplit[expected]).toBeGreaterThanOrEqual(1);
  });
});
