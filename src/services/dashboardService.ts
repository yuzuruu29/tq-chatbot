// TQ ChatBot — Dashboard Service
// Aggregates funnel/lead/booking data for the operational dashboard.
//
// Read path:
//   - When Supabase is configured (supabaseService.isInitialized()), reads the
//     `leads` table and the `calendly_metrics` / `funnel_steps` views directly.
//   - Otherwise (local dev / unconfigured), falls back to the in-memory
//     singletons so the dashboard remains fully functional offline.

import type { Lead, LeadScore } from "../types";
import { supabaseService } from "../lib/supabase";
import { leadService } from "./leadService";
import { calendlyService } from "./calendlyService";
import { logger } from "../lib/logger";

export type FunnelStep = { name: string; value: number; drop?: string };

export type DashboardData = {
  /** All leads for the tenant (used for the table, score split and time-range counts). */
  leads: Lead[];
  scoreSplit: Record<LeadScore, number>;
  calendly: { shown: number; clicked: number; booked: number };
  funnelSteps: FunnelStep[];
  /** True only when the data came from a real Supabase read. */
  hasRealData: boolean;
};

/** Ordered funnel stages mapped from the `funnel_steps` view's event types. */
const FUNNEL_ORDER: Array<{ key: string; name: string }> = [
  { key: "chat_started", name: "Landed" },
  { key: "lead_captured", name: "Captured" },
  { key: "lead_scored", name: "Qualified" },
  { key: "calendly_shown", name: "Calendly Shown" },
  { key: "calendly_clicked", name: "Clicked" },
  { key: "calendly_booked", name: "Booked" },
];

function emptySplit(): Record<LeadScore, number> {
  return { low: 0, medium: 0, high: 0 };
}

/**
 * Build an ordered funnel (with drop percentages) from raw `funnel_steps` rows.
 * Exported for unit testing.
 */
export function computeFunnelFromEvents(
  events: Array<{ event_type: string; count: number }>
): FunnelStep[] {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.event_type, Number(e.count) || 0);

  const steps: FunnelStep[] = [];
  let prevValue: number | null = null;

  for (const { key, name } of FUNNEL_ORDER) {
    const value = counts.get(key) ?? 0;
    if (value <= 0) continue;
    const step: FunnelStep = { name, value };
    if (prevValue !== null && prevValue > 0) {
      step.drop = `-${Math.round(((prevValue - value) / prevValue) * 100)}%`;
    }
    steps.push(step);
    prevValue = value;
  }

  return steps;
}

export class DashboardService {
  private static instance: DashboardService;

  private constructor() {}

  public static getInstance(): DashboardService {
    if (!DashboardService.instance) {
      DashboardService.instance = new DashboardService();
    }
    return DashboardService.instance;
  }

  public async getDashboardData(tenantId: string): Promise<DashboardData> {
    if (supabaseService.isInitialized()) {
      try {
        return await this.getFromSupabase(tenantId);
      } catch (err) {
        logger.error("Dashboard Supabase read failed; falling back to in-memory", err);
      }
    }
    return this.getFromMemory(tenantId);
  }

  private async getFromSupabase(tenantId: string): Promise<DashboardData> {
    const client = supabaseService.getClient();

    const { data: leads, error: leadsError } = await client
      .from("leads")
      .select("*")
      .eq("tenant_id", tenantId);
    if (leadsError) throw leadsError;
    const typedLeads = (leads ?? []) as unknown as Lead[];

    const { data: cal, error: calError } = await client
      .from("calendly_metrics")
      .select("shown, clicked, booked")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (calError) throw calError;

    const { data: steps, error: stepsError } = await client
      .from("funnel_steps")
      .select("event_type, count")
      .eq("tenant_id", tenantId);
    if (stepsError) throw stepsError;

    const scoreSplit = emptySplit();
    for (const lead of typedLeads) {
      scoreSplit[lead.score] = (scoreSplit[lead.score] ?? 0) + 1;
    }

    return {
      leads: typedLeads,
      scoreSplit,
      calendly: {
        shown: Number(cal?.shown ?? 0),
        clicked: Number(cal?.clicked ?? 0),
        booked: Number(cal?.booked ?? 0),
      },
      funnelSteps: computeFunnelFromEvents((steps ?? []) as Array<{ event_type: string; count: number }>),
      hasRealData: true,
    };
  }

  private async getFromMemory(tenantId: string): Promise<DashboardData> {
    const leads = await leadService.getLeadsByTenant(tenantId);

    const scoreSplit = emptySplit();
    for (const lead of leads) {
      scoreSplit[lead.score] = (scoreSplit[lead.score] ?? 0) + 1;
    }

    const cal = calendlyService.getMetrics();
    const funnel = leadService.getFunnelMetrics(tenantId);

    return {
      leads,
      scoreSplit,
      calendly: { shown: cal.shown, clicked: cal.clicked, booked: cal.booked },
      funnelSteps: funnel ? funnel.funnelSteps : [],
      hasRealData: false,
    };
  }
}

export const dashboardService = DashboardService.getInstance();
