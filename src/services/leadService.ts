// TQ ChatBot #1 - Lead Service
// Handles lead creation, scoring, and routing.
// Includes suppression logic for duplicate alerts and spam filtering.
//
// Write path: Edge Function (service-role key) → Supabase → in-memory fallback.
// Read path:  In-memory (always fast; Supabase reads are for dashboard only).

import { v4 as uuidv4 } from "uuid";
import type { Lead, Signals, VisitorContext, FunnelEvent } from "../types";
import { scoreLead, defaultSignals, extractSignalsFromText, mergeSignals } from "../lib/scoring";
import { supabaseService } from "../lib/supabase";
import { messageService } from "./messageService";
import { shouldSuppressAlert } from "../lib/idempotency";
import { edgeCreateLead, edgeRecordEvent } from "../lib/edgeClient";
import { logger } from "../lib/logger";

// In-memory lead storage for development
class InMemoryLeadStorage {
  private leads: Map<string, Lead> = new Map();
  private events: FunnelEvent[] = [];

  async createLead(lead: Omit<Lead, "id" | "created_at" | "updated_at">): Promise<Lead> {
    const newLead: Lead = {
      ...lead,
      id: uuidv4(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.leads.set(newLead.id, newLead);
    return newLead;
  }

  async getLead(leadId: string): Promise<Lead | null> {
    return this.leads.get(leadId) || null;
  }

  async updateLead(lead: Lead): Promise<Lead> {
    lead.updated_at = new Date().toISOString();
    this.leads.set(lead.id, lead);
    return lead;
  }

  async recordEvent(event: Omit<FunnelEvent, "id" | "timestamp">): Promise<FunnelEvent> {
    const funnelEvent: FunnelEvent = {
      ...event,
      id: uuidv4(),
      timestamp: new Date().toISOString()
    };
    this.events.push(funnelEvent);
    return funnelEvent;
  }

  async getLeadsByTenant(tenantId: string): Promise<Lead[]> {
    return Array.from(this.leads.values()).filter(lead => lead.tenant_id === tenantId);
  }
}

export class LeadService {
  private storage: InMemoryLeadStorage;
  private static instance: LeadService;
  private edgeAvailable: boolean;

  private constructor() {
    this.storage = new InMemoryLeadStorage();
    this.edgeAvailable = supabaseService.isInitialized();
  }

  public static getInstance(): LeadService {
    if (!LeadService.instance) {
      LeadService.instance = new LeadService();
    }
    return LeadService.instance;
  }

  /**
   * Create a new lead from chat context and user input.
   * Tries Edge Function first (server-side idempotency + persistence),
   * falls back to in-memory.
   */
  public async createLead(
    context: VisitorContext,
    userInput: string,
    contactInfo: Lead["contact_info"] = {}
  ): Promise<Lead> {
    // Extract signals from user input
    const extractedSignals = extractSignalsFromText(userInput);

    // Start with default signals and merge with extracted ones
    let signals: Signals = mergeSignals(defaultSignals, extractedSignals);

    // If contact info is provided, mark as captured
    if (contactInfo.email || contactInfo.name || contactInfo.phone) {
      signals = { ...signals, contact_captured: true };
    }

    // Score the lead
    const scoringResult = scoreLead(signals);

    // Try Edge Function for persistence
    if (this.edgeAvailable) {
      const edgeResult = await edgeCreateLead(
        context.session_id,
        context.visitor_id,
        context.tenant_id,
        scoringResult.final_score,
        scoringResult.route,
        signals as unknown as Record<string, unknown>,
        contactInfo as Record<string, unknown>,
        scoringResult as unknown as Record<string, unknown>
      );

      if (edgeResult) {
        const lead = edgeResult.lead;

        // Record events locally for dashboard
        await this.storage.recordEvent({
          tenant_id: context.tenant_id,
          session_id: context.session_id,
          lead_id: lead.id,
          event_type: "lead_captured",
          data: { score: scoringResult.final_score, route: scoringResult.route }
        });
        await this.storage.recordEvent({
          tenant_id: context.tenant_id,
          session_id: context.session_id,
          lead_id: lead.id,
          event_type: "lead_scored",
          data: { score: scoringResult.final_score, route: scoringResult.route, reason: scoringResult.score_reason }
        });

        // Update local session
        const session = await messageService.getSession(context.session_id);
        if (session) {
          await messageService.updateSession({ ...session, lead_id: lead.id, status: "completed" });
        }

        return lead;
      }
      // Edge Function unavailable — fall through
    }

    // In-memory fallback
    const lead: Omit<Lead, "id" | "created_at" | "updated_at"> = {
      tenant_id: context.tenant_id,
      session_id: context.session_id,
      visitor_id: context.visitor_id,
      score: scoringResult.final_score,
      route: scoringResult.route,
      signals,
      contact_info: contactInfo,
      scoring_result: scoringResult,
      status: "new"
    };

    const newLead = await this.storage.createLead(lead);

    await this.recordEvent({
      tenant_id: context.tenant_id,
      session_id: context.session_id,
      lead_id: newLead.id,
      event_type: "lead_captured",
      data: { score: scoringResult.final_score, route: scoringResult.route }
    });

    await this.recordEvent({
      tenant_id: context.tenant_id,
      session_id: context.session_id,
      lead_id: newLead.id,
      event_type: "lead_scored",
      data: { score: scoringResult.final_score, route: scoringResult.route, reason: scoringResult.score_reason }
    });

    const session = await messageService.getSession(context.session_id);
    if (session) {
      await messageService.updateSession({ ...session, lead_id: newLead.id, status: "completed" });
    }

    return newLead;
  }

  /**
   * Update lead signals and re-score
   */
  public async updateLeadSignals(
    leadId: string,
    newSignals: Partial<Signals>
  ): Promise<Lead> {
    const lead = await this.getLead(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    const updatedSignals = mergeSignals(lead.signals, newSignals);
    const scoringResult = scoreLead(updatedSignals);

    const updatedLead: Lead = {
      ...lead,
      signals: updatedSignals,
      score: scoringResult.final_score,
      route: scoringResult.route,
      scoring_result: scoringResult
    };

    return this.storage.updateLead(updatedLead);
  }

  /**
   * Route lead based on scoring result
   */
  public async routeLead(lead: Lead): Promise<void> {
    const { route, alert } = lead.scoring_result;

    await this.recordEvent({
      tenant_id: lead.tenant_id,
      session_id: lead.session_id,
      lead_id: lead.id,
      event_type: `${route}_shown` as "calendly_shown" | "nurture_shown" | "booking_option_shown",
      data: { route, alert }
    });

    if (alert) {
      await this.handleAlert(lead);
    }

    switch (route) {
      case "calendly":
        await this.handleCalendlyRoute(lead);
        break;
      case "soft_booking":
        await this.handleSoftBookingRoute(lead);
        break;
      case "nurture":
        await this.handleNurtureRoute(lead);
        break;
      case "helpful_guidance":
        await this.handleHelpfulGuidanceRoute(lead);
        break;
    }
  }

  private async handleAlert(lead: Lead): Promise<void> {
    if (shouldSuppressAlert(lead.id, lead.score, lead.status)) {
      await this.recordEvent({
        tenant_id: lead.tenant_id,
        session_id: lead.session_id,
        lead_id: lead.id,
        event_type: "alert_suppressed",
        data: { score: lead.score, reason: "Suppressed by cooldown or low score" }
      });
      return;
    }

    await this.recordEvent({
      tenant_id: lead.tenant_id,
      session_id: lead.session_id,
      lead_id: lead.id,
      event_type: "alert_triggered",
      data: { score: lead.score, reason: lead.scoring_result.score_reason }
    });

    logger.warn("High-value lead detected", {
      leadId: lead.id,
      score: lead.score,
      reason: lead.scoring_result.score_reason,
    });
  }

  private async handleCalendlyRoute(lead: Lead): Promise<void> {
    await this.recordEvent({
      tenant_id: lead.tenant_id,
      session_id: lead.session_id,
      lead_id: lead.id,
      event_type: "calendly_shown",
      data: { lead_id: lead.id }
    });
  }

  private async handleSoftBookingRoute(lead: Lead): Promise<void> {
    await this.recordEvent({
      tenant_id: lead.tenant_id,
      session_id: lead.session_id,
      lead_id: lead.id,
      event_type: "booking_option_shown",
      data: { lead_id: lead.id }
    });
  }

  private async handleNurtureRoute(lead: Lead): Promise<void> {
    if (lead.contact_info.email) {
      await this.recordEvent({
        tenant_id: lead.tenant_id,
        session_id: lead.session_id,
        lead_id: lead.id,
        event_type: "nurture_shown",
        data: { email: lead.contact_info.email }
      });
      logger.info("Nurture sequence started", { leadId: lead.id, hasEmail: !!lead.contact_info.email });
    }
  }

  private async handleHelpfulGuidanceRoute(lead: Lead): Promise<void> {
    await this.recordEvent({
      tenant_id: lead.tenant_id,
      session_id: lead.session_id,
      lead_id: lead.id,
      event_type: "lead_scored",
      data: { lead_id: lead.id }
    });
  }

  public async recordCalendlyClick(leadId: string, sessionId: string, tenantId: string): Promise<void> {
    await this.recordEvent({
      tenant_id: tenantId,
      session_id: sessionId,
      lead_id: leadId,
      event_type: "calendly_clicked",
      data: { lead_id: leadId }
    });
  }

  public async recordCalendlyBooking(
    leadId: string,
    sessionId: string,
    tenantId: string,
    bookingData: Record<string, unknown>
  ): Promise<void> {
    const lead = await this.getLead(leadId);
    if (lead) {
      await this.storage.updateLead({ ...lead, status: "booked" });
    }

    await this.recordEvent({
      tenant_id: tenantId,
      session_id: sessionId,
      lead_id: leadId,
      event_type: "calendly_booked",
      data: { ...bookingData, lead_id: leadId }
    });
  }

  /**
   * Record a cancelled booking and re-open follow-up state.
   * When a booking is cancelled, the lead transitions back to "contacted"
   * so that nurture/follow-up sequences can resume.
   *
   * Suppression rules:
   * - booked → no follow-up alert (handled by shouldSuppressAlert)
   * - cancelled → follow-up may resume (status change re-enables alerts)
   * - duplicate booking event → idempotent (Edge Function upsert)
   */
  public async recordBookingCancellation(
    leadId: string,
    sessionId: string,
    tenantId: string
  ): Promise<void> {
    const lead = await this.getLead(leadId);
    if (lead) {
      await this.storage.updateLead({ ...lead, status: "contacted" });
    }

    await this.recordEvent({
      tenant_id: tenantId,
      session_id: sessionId,
      lead_id: leadId,
      event_type: "booking_cancelled",
      data: { lead_id: leadId, reason: "Booking cancelled — follow-up may resume" }
    });
  }

  public async getLead(leadId: string): Promise<Lead | null> {
    return this.storage.getLead(leadId);
  }

  public async getLeadsByTenant(tenantId: string): Promise<Lead[]> {
    return this.storage.getLeadsByTenant(tenantId);
  }

  /**
   * Compute funnel metrics from in-memory event data.
   * Returns null when there is no real data — callers should fall back to
   * an explicit dev/mock placeholder.
   */
  public getFunnelMetrics(tenantId: string): {
    totalLeads: number;
    scoreSplit: Record<string, number>;
    funnelSteps: Array<{ name: string; value: number; drop?: string }>;
    hasRealData: boolean;
  } | null {
    const leads = Array.from(this.storage["leads"]?.values() ?? [])
      .filter((l: Lead) => l.tenant_id === tenantId);
    const events = (this.storage["events"] as FunnelEvent[] | undefined) ?? [];

    if (leads.length === 0 && events.length === 0) return null;

    const scoreSplit: Record<string, number> = { high: 0, medium: 0, low: 0 };
    for (const lead of leads) {
      scoreSplit[lead.score] = (scoreSplit[lead.score] || 0) + 1;
    }

    const uniqueSessions = new Set<string>();
    const sessionsWithEvent = new Map<string, Set<string>>();
    for (const ev of events) {
      uniqueSessions.add(ev.session_id);
      if (!sessionsWithEvent.has(ev.event_type)) {
        sessionsWithEvent.set(ev.event_type, new Set());
      }
      sessionsWithEvent.get(ev.event_type)!.add(ev.session_id);
    }

    const landed = uniqueSessions.size || leads.length;
    const engaged = sessionsWithEvent.get("message_sent")?.size ?? 0;
    const qualified = sessionsWithEvent.get("lead_scored")?.size ?? 0;
    const calendlyShownCount = sessionsWithEvent.get("calendly_shown")?.size ?? 0;
    const calendlyClicked = sessionsWithEvent.get("calendly_clicked")?.size ?? 0;
    const calendlyBooked = sessionsWithEvent.get("calendly_booked")?.size ?? 0;

    const funnelSteps: Array<{ name: string; value: number; drop?: string }> = [];
    funnelSteps.push({ name: "Landed", value: landed });
    if (engaged > 0) funnelSteps.push({ name: "Engaged", value: engaged, drop: landed > 0 ? `${Math.round(((landed - engaged) / landed) * 100)}% drop` : undefined });
    if (qualified > 0) funnelSteps.push({ name: "Qualified", value: qualified, drop: engaged > 0 ? `${Math.round(((engaged - qualified) / engaged) * 100)}% drop` : undefined });
    if (calendlyShownCount > 0) funnelSteps.push({ name: "Calendly Shown", value: calendlyShownCount });
    if (calendlyClicked > 0) funnelSteps.push({ name: "Clicked", value: calendlyClicked, drop: calendlyShownCount > 0 ? `${Math.round(((calendlyShownCount - calendlyClicked) / calendlyShownCount) * 100)}% drop` : undefined });
    if (calendlyBooked > 0) funnelSteps.push({ name: "Booked", value: calendlyBooked, drop: calendlyClicked > 0 ? `${Math.round(((calendlyClicked - calendlyBooked) / calendlyClicked) * 100)}% drop` : undefined });

    return {
      totalLeads: leads.length,
      scoreSplit,
      funnelSteps: funnelSteps.length > 0 ? funnelSteps : [
        { name: "Landed", value: landed },
      ],
      hasRealData: true,
    };
  }

  /**
   * Record a funnel event.
   * Tries Edge Function first for server-side persistence, falls back to in-memory.
   */
  public async recordEvent(event: Omit<FunnelEvent, "id" | "timestamp">): Promise<FunnelEvent> {
    if (this.edgeAvailable) {
      const edgeEvent = await edgeRecordEvent(
        event.tenant_id,
        event.session_id,
        event.event_type,
        event.data,
        event.lead_id
      );
      if (edgeEvent) {
        // Also store locally
        return this.storage.recordEvent(event);
      }
    }
    return this.storage.recordEvent(event);
  }

  // Reinitialize storage based on Supabase status
  public reinitializeStorage(): void {
    this.edgeAvailable = supabaseService.isInitialized();
  }
}

// Export singleton instance
export const leadService = LeadService.getInstance();
