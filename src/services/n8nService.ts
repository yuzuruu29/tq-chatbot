// TQ ChatBot #1 - n8n Service
// Event contract and safe stub implementation for n8n workflow automation

import type { Lead, FunnelEvent } from "../types";
import { logger } from "../lib/logger";

/**
 * n8n Event Contract
 * Defines the structure of events sent to n8n for workflow automation
 */
export interface N8nEvent {
  // Event metadata
  event_id: string;
  event_type: string;
  timestamp: string;
  
  // Source information
  source: "tq_chatbot";
  version: string;
  
  // Tenant context
  tenant_id: string;
  tenant_name?: string;
  
  // Lead context
  lead_id?: string;
  visitor_id: string;
  session_id: string;
  
  // Event payload
  payload: Record<string, unknown>;
  
  // Routing information
  priority?: "low" | "medium" | "high";
  retry_count?: number;
}

/**
 * n8n Webhook Response
 */
export interface N8nResponse {
  success: boolean;
  workflow_id?: string;
  execution_id?: string;
  message?: string;
  error?: string;
}

/**
 * n8n Workflow Types
 */
export type N8nWorkflowType = 
  | "lead_qualified_high"
  | "lead_qualified_medium"
  | "lead_qualified_low"
  | "calendly_booked"
  | "nurture_sequence"
  | "alert_notification";

/**
 * n8n Workflow Configuration
 */
export interface N8nWorkflowConfig {
  workflowId: string;
  webhookUrl: string;
  enabled: boolean;
  description: string;
}

/**
 * n8n Service
 *
 * SECURITY: The browser never holds n8n API keys or webhook secrets.
 * In production, this service calls a Supabase Edge Function
 * at /api/n8n-dispatch which holds N8N_WEBHOOK_URL and N8N_WEBHOOK_SECRET.
 *
 * The browser MVP logs events to console as a safe stub.
 */
export class N8nService {
  private static instance: N8nService;
  private workflows: Map<N8nWorkflowType, N8nWorkflowConfig> = new Map();
  private events: N8nEvent[] = [];

  private constructor() {
    // Initialize default workflow configurations
    this.initializeDefaultWorkflows();
  }

  public static getInstance(): N8nService {
    if (!N8nService.instance) {
      N8nService.instance = new N8nService();
    }
    return N8nService.instance;
  }

  /**
   * Initialize default workflow configurations
   */
  private initializeDefaultWorkflows(): void {
    const defaultWorkflows: Record<N8nWorkflowType, N8nWorkflowConfig> = {
      lead_qualified_high: {
        workflowId: "lead-high-qualification",
        webhookUrl: "",
        enabled: true,
        description: "Triggered when a high-qualified lead is detected"
      },
      lead_qualified_medium: {
        workflowId: "lead-medium-qualification",
        webhookUrl: "",
        enabled: true,
        description: "Triggered when a medium-qualified lead is detected"
      },
      lead_qualified_low: {
        workflowId: "lead-low-qualification",
        webhookUrl: "",
        enabled: false, // Typically not needed for low leads
        description: "Triggered when a low-qualified lead is detected"
      },
      calendly_booked: {
        workflowId: "calendly-booking-confirmed",
        webhookUrl: "",
        enabled: true,
        description: "Triggered when a Calendly booking is confirmed"
      },
      nurture_sequence: {
        workflowId: "nurture-sequence-start",
        webhookUrl: "",
        enabled: true,
        description: "Triggered to start a nurture sequence"
      },
      alert_notification: {
        workflowId: "alert-notification",
        webhookUrl: "",
        enabled: true,
        description: "Triggered to send alert notifications"
      }
    };

    Object.entries(defaultWorkflows).forEach(([type, config]) => {
      this.workflows.set(type as N8nWorkflowType, config);
    });
  }

  /**
   * Check if n8n is configured.
   * In the browser MVP this always returns false.
   * In production, events are dispatched through an Edge Function.
   */
  public isConfigured(): boolean {
    return false; // Browser MVP — real webhook lives in Edge Function
  }

  /**
   * Configure a specific workflow
   */
  public configureWorkflow(type: N8nWorkflowType, config: Partial<N8nWorkflowConfig>): void {
    const existing = this.workflows.get(type);
    if (existing) {
      this.workflows.set(type, { ...existing, ...config });
    }
  }

  /**
   * Send event to n8n.
   *
   * Production flow:
   *   1. POST to Supabase Edge Function /api/n8n-dispatch
   *   2. Edge Function validates N8N_WEBHOOK_SECRET and forwards to n8n
   *   3. Returns success/failure
   *
   * Browser MVP flow:
   *   Logs event to console as a safe stub.
   */
  public async sendEvent(event: N8nEvent): Promise<N8nResponse> {
    // Store event for tracking
    this.events.push(event);

    // Production: POST to Edge Function /api/n8n-dispatch
    // const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/n8n-dispatch`, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
    //   body: JSON.stringify(event)
    // });

    // Browser MVP: log event type only (no payload)
    logger.debug("n8n event logged (stub)", { eventType: event.event_type, tenantId: event.tenant_id });
    return {
      success: false,
      message: "n8n not configured — browser MVP uses safe stub",
      error: "Edge Function not deployed"
    };
  }

  /**
   * Send lead qualified event
   */
  public async sendLeadQualifiedEvent(lead: Lead): Promise<N8nResponse> {
    const event: N8nEvent = {
      event_id: `lead_${lead.id}_${Date.now()}`,
      event_type: `lead_qualified_${lead.score}` as N8nWorkflowType,
      timestamp: new Date().toISOString(),
      source: "tq_chatbot",
      version: "1.0",
      tenant_id: lead.tenant_id,
      lead_id: lead.id,
      visitor_id: lead.visitor_id,
      session_id: lead.session_id,
      payload: {
        lead: {
          id: lead.id,
          score: lead.score,
          route: lead.route,
          signals: lead.signals,
          contact_info: lead.contact_info,
          scoring_result: lead.scoring_result
        }
      },
      priority: lead.score === "high" ? "high" : lead.score === "medium" ? "medium" : "low"
    };

    return this.sendEvent(event);
  }

  /**
   * Send Calendly booked event
   */
  public async sendCalendlyBookedEvent(
    lead: Lead,
    bookingData: Record<string, unknown>
  ): Promise<N8nResponse> {
    const event: N8nEvent = {
      event_id: `calendly_${lead.id}_${Date.now()}`,
      event_type: "calendly_booked",
      timestamp: new Date().toISOString(),
      source: "tq_chatbot",
      version: "1.0",
      tenant_id: lead.tenant_id,
      lead_id: lead.id,
      visitor_id: lead.visitor_id,
      session_id: lead.session_id,
      payload: {
        lead: {
          id: lead.id,
          score: lead.score,
          contact_info: lead.contact_info
        },
        booking: bookingData
      },
      priority: "high"
    };

    return this.sendEvent(event);
  }

  /**
   * Send funnel event to n8n
   */
  public async sendFunnelEvent(event: FunnelEvent): Promise<N8nResponse> {
    const n8nEvent: N8nEvent = {
      event_id: `funnel_${event.id}_${Date.now()}`,
      event_type: event.event_type as N8nWorkflowType,
      timestamp: event.timestamp,
      source: "tq_chatbot",
      version: "1.0",
      tenant_id: event.tenant_id,
      lead_id: event.lead_id || undefined,
      visitor_id: "unknown", // Would be extracted from session
      session_id: event.session_id,
      payload: event.data
    };

    return this.sendEvent(n8nEvent);
  }

  /**
   * Send alert notification
   */
  public async sendAlert(lead: Lead, message: string): Promise<N8nResponse> {
    const event: N8nEvent = {
      event_id: `alert_${lead.id}_${Date.now()}`,
      event_type: "alert_notification",
      timestamp: new Date().toISOString(),
      source: "tq_chatbot",
      version: "1.0",
      tenant_id: lead.tenant_id,
      lead_id: lead.id,
      visitor_id: lead.visitor_id,
      session_id: lead.session_id,
      payload: {
        lead: {
          id: lead.id,
          score: lead.score,
          route: lead.route,
          contact_info: lead.contact_info,
          scoring_result: lead.scoring_result
        },
        message,
        alert_type: "high_value_lead"
      },
      priority: "high"
    };

    return this.sendEvent(event);
  }

  /**
   * Get event history
   */
  public getEventHistory(limit = 50): N8nEvent[] {
    return this.events.slice(-limit).reverse();
  }

  /**
   * Get workflow configurations
   */
  public getWorkflowConfigs(): Record<N8nWorkflowType, N8nWorkflowConfig> {
    const result: Record<N8nWorkflowType, N8nWorkflowConfig> = {} as Record<N8nWorkflowType, N8nWorkflowConfig>;
    this.workflows.forEach((config, type) => {
      result[type] = config;
    });
    return result;
  }

  /**
   * Reset events (for testing)
   */
  public resetEvents(): void {
    this.events = [];
  }
}

// Export singleton instance
export const n8nService = N8nService.getInstance();
