// TQ ChatBot #1 - Lead Service
// Handles lead creation, scoring, and routing

import { v4 as uuidv4 } from "uuid";
import type { Lead, Signals, VisitorContext, FunnelEvent } from "../types";
import { scoreLead, defaultSignals, extractSignalsFromText, mergeSignals } from "../lib/scoring";
import { supabaseService } from "../lib/supabase";
import { messageService } from "./messageService";

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

// Supabase lead storage implementation
class SupabaseLeadStorage {
  async createLead(lead: Omit<Lead, "id" | "created_at" | "updated_at">): Promise<Lead> {
    const client = supabaseService.getClient();
    const { data, error } = await client
      .from("leads")
      .insert(lead)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create lead: ${error.message}`);
    }
    return data as Lead;
  }

  async getLead(leadId: string): Promise<Lead | null> {
    const client = supabaseService.getClient();
    const { data, error } = await client
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (error || !data) {
      return null;
    }
    return data as Lead;
  }

  async updateLead(lead: Lead): Promise<Lead> {
    const client = supabaseService.getClient();
    const { data, error } = await client
      .from("leads")
      .update({
        score: lead.score,
        route: lead.route,
        signals: lead.signals,
        contact_info: lead.contact_info,
        scoring_result: lead.scoring_result,
        status: lead.status,
        updated_at: new Date().toISOString()
      })
      .eq("id", lead.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update lead: ${error.message}`);
    }
    return data as Lead;
  }

  async recordEvent(event: Omit<FunnelEvent, "id" | "timestamp">): Promise<FunnelEvent> {
    const client = supabaseService.getClient();
    const { data, error } = await client
      .from("funnel_events")
      .insert(event)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to record event: ${error.message}`);
    }
    return data as FunnelEvent;
  }

  async getLeadsByTenant(tenantId: string): Promise<Lead[]> {
    const client = supabaseService.getClient();
    const { data, error } = await client
      .from("leads")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to get leads: ${error.message}`);
    }
    return data as Lead[];
  }
}

export class LeadService {
  private storage: InMemoryLeadStorage | SupabaseLeadStorage;
  private static instance: LeadService;

  private constructor() {
    this.storage = supabaseService.isInitialized() ? new SupabaseLeadStorage() : new InMemoryLeadStorage();
  }

  public static getInstance(): LeadService {
    if (!LeadService.instance) {
      LeadService.instance = new LeadService();
    }
    return LeadService.instance;
  }

  /**
   * Create a new lead from chat context and user input
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

    // Create lead object
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

    // Create the lead
    const newLead = await this.storage.createLead(lead);

    // Record lead creation event
    await this.recordEvent({
      tenant_id: context.tenant_id,
      session_id: context.session_id,
      lead_id: newLead.id,
      event_type: "lead_captured",
      data: {
        score: scoringResult.final_score,
        route: scoringResult.route
      }
    });

    // Record scoring event
    await this.recordEvent({
      tenant_id: context.tenant_id,
      session_id: context.session_id,
      lead_id: newLead.id,
      event_type: "lead_scored",
      data: {
        score: scoringResult.final_score,
        route: scoringResult.route,
        reason: scoringResult.score_reason
      }
    });

    // Update session with lead ID
    const session = await messageService.getSession(context.session_id);
    if (session) {
      await messageService.updateSession({
        ...session,
        lead_id: newLead.id,
        status: "completed"
      });
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

    // Merge new signals with existing ones
    const updatedSignals = mergeSignals(lead.signals, newSignals);
    
    // Re-score the lead
    const scoringResult = scoreLead(updatedSignals);

    // Update lead
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

    // Record routing event
    await this.recordEvent({
      tenant_id: lead.tenant_id,
      session_id: lead.session_id,
      lead_id: lead.id,
      event_type: `${route}_shown` as "calendly_shown" | "nurture_shown" | "booking_option_shown",
      data: { route, alert }
    });

    // Handle alert for high-value leads
    if (alert) {
      await this.handleAlert(lead);
    }

    // Route-specific actions
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
    // Record alert event
    await this.recordEvent({
      tenant_id: lead.tenant_id,
      session_id: lead.session_id,
      lead_id: lead.id,
      event_type: "lead_scored", // Using existing event type
      data: {
        score: lead.score,
        reason: lead.scoring_result.score_reason
      }
    });

    // In production, this would trigger n8n workflow or webhook
    console.log(`ALERT: High-value lead detected!`, {
      leadId: lead.id,
      score: lead.score,
      reason: lead.scoring_result.score_reason,
      contact: lead.contact_info
    });
  }

  private async handleCalendlyRoute(lead: Lead): Promise<void> {
    // Show Calendly widget
    await this.recordEvent({
      tenant_id: lead.tenant_id,
      session_id: lead.session_id,
      lead_id: lead.id,
      event_type: "calendly_shown",
      data: { lead_id: lead.id }
    });
  }

  private async handleSoftBookingRoute(lead: Lead): Promise<void> {
    // Show booking option without alert
    await this.recordEvent({
      tenant_id: lead.tenant_id,
      session_id: lead.session_id,
      lead_id: lead.id,
      event_type: "booking_option_shown",
      data: { lead_id: lead.id }
    });
  }

  private async handleNurtureRoute(lead: Lead): Promise<void> {
    // Capture email for nurture sequence
    if (lead.contact_info.email) {
      await this.recordEvent({
        tenant_id: lead.tenant_id,
        session_id: lead.session_id,
        lead_id: lead.id,
        event_type: "nurture_shown",
        data: { email: lead.contact_info.email }
      });

      // In production, this would create a followup job
      console.log(`Nurture sequence started for: ${lead.contact_info.email}`);
    }
  }

  private async handleHelpfulGuidanceRoute(lead: Lead): Promise<void> {
    // No specific action, just provide helpful content
    await this.recordEvent({
      tenant_id: lead.tenant_id,
      session_id: lead.session_id,
      lead_id: lead.id,
      event_type: "lead_scored", // Using existing event type
      data: { lead_id: lead.id }
    });
  }

  /**
   * Record Calendly click event
   */
  public async recordCalendlyClick(leadId: string, sessionId: string, tenantId: string): Promise<void> {
    await this.recordEvent({
      tenant_id: tenantId,
      session_id: sessionId,
      lead_id: leadId,
      event_type: "calendly_clicked",
      data: { lead_id: leadId }
    });
  }

  /**
   * Record Calendly booking event
   */
  public async recordCalendlyBooking(
    leadId: string,
    sessionId: string,
    tenantId: string,
    bookingData: Record<string, unknown>
  ): Promise<void> {
    // Update lead status
    const lead = await this.getLead(leadId);
    if (lead) {
      await this.storage.updateLead({
        ...lead,
        status: "booked"
      });
    }

    // Record booking event
    await this.recordEvent({
      tenant_id: tenantId,
      session_id: sessionId,
      lead_id: leadId,
      event_type: "calendly_booked",
      data: { ...bookingData, lead_id: leadId }
    });
  }

  /**
   * Get lead by ID
   */
  public async getLead(leadId: string): Promise<Lead | null> {
    return this.storage.getLead(leadId);
  }

  /**
   * Get all leads for a tenant
   */
  public async getLeadsByTenant(tenantId: string): Promise<Lead[]> {
    return this.storage.getLeadsByTenant(tenantId);
  }

  /**
   * Record a funnel event
   */
  public async recordEvent(event: Omit<FunnelEvent, "id" | "timestamp">): Promise<FunnelEvent> {
    return this.storage.recordEvent(event);
  }

  // Reinitialize storage based on Supabase status
  public reinitializeStorage(): void {
    this.storage = supabaseService.isInitialized() ? new SupabaseLeadStorage() : new InMemoryLeadStorage();
  }
}

// Export singleton instance
export const leadService = LeadService.getInstance();
