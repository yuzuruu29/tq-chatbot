// TQ ChatBot #1 - Tenant Configuration Seam
//
// This file is the central seam between the generic funnel engine and the
// current tenant (TechQuarters / System Entry One). Every business-specific
// value that would change for the next niche/client lives here, not scattered
// through components or services.
//
// For a future tenant, create a new TenantConfig object and pass it into the
// chat widget and dashboard. The engine itself remains unchanged.

import type { Route } from "../types";

export type Niche = "tech-quarters" | "generic";

export type RouteRule = {
  route: Route;
  label: string;
  description: string;
  requiresContact: boolean;
  alert: boolean;
};

export type ScoringWeights = {
  fit: number;
  urgency: number;
  pain: number;
  readiness: number;
  quality: number;
};

export type QualificationQuestion = {
  id: string;
  purpose: "business" | "pain" | "urgency" | "readiness" | "contact";
  text: string;
};

export type DashboardLabels = {
  pageTitle: string;
  totalLeads: string;
  qualifiedLabel: string;
  qualifiedSublabel: string;
  nurtureLabel: string;
  nurtureSublabel: string;
  lowPriorityLabel: string;
  lowPrioritySublabel: string;
  scoreDistribution: string;
  recentConversations: string;
  scoringInsights: string;
  calendlyFunnel: string;
};

export type TenantConfig = {
  id: string;
  name: string;
  niche: Niche;
  calendlyUrl: string;
  nurtureEmailTemplate: string;
  botName: string;
  botTitle: string;
  botSubtitle: string;
  welcomeMessage: string;
  fallbackMessage: string;
  qualificationQuestions: QualificationQuestion[];
  scoringWeights: ScoringWeights;
  scoreThresholds: {
    high: number;
    medium: number;
  };
  routeRules: Record<Route, RouteRule>;
  dashboardLabels: DashboardLabels;
};

const defaultRouteRules: Record<Route, RouteRule> = {
  calendly: {
    route: "calendly",
    label: "Book a Call",
    description: "Schedule a consultation with our team",
    requiresContact: true,
    alert: true
  },
  soft_booking: {
    route: "soft_booking",
    label: "Book a Call",
    description: "Schedule a call to discuss your needs",
    requiresContact: true,
    alert: false
  },
  nurture: {
    route: "nurture",
    label: "Get Updates",
    description: "Receive helpful resources and follow-ups",
    requiresContact: true,
    alert: false
  },
  helpful_guidance: {
    route: "helpful_guidance",
    label: "Learn More",
    description: "Access our knowledge base and guides",
    requiresContact: false,
    alert: false
  }
};

const defaultDashboardLabels: DashboardLabels = {
  pageTitle: "Funnel Dashboard",
  totalLeads: "Total Leads",
  qualifiedLabel: "Qualified",
  qualifiedSublabel: "Routed to Calendly",
  nurtureLabel: "Nurture",
  nurtureSublabel: "In follow-up sequence",
  lowPriorityLabel: "Low Priority",
  lowPrioritySublabel: "Received guidance",
  scoreDistribution: "Score Distribution",
  recentConversations: "Recent Conversations",
  scoringInsights: "Scoring Insights",
  calendlyFunnel: "Calendly Funnel"
};

// TechQuarters tenant one configuration.
// This is the live build of "System Entry One" and the bridge to future
// niche-specific engines.
export const techQuartersConfig: TenantConfig = {
  id: "default",
  name: "TechQuarters",
  niche: "tech-quarters",
  calendlyUrl: "https://calendly.com/tq-chatbot",
  nurtureEmailTemplate:
    "Hello {name}, thank you for your interest in TechQuarters. We'll follow up with you soon.",
  botName: "TQ Bot",
  botTitle: "TQ Funnel Assistant",
  botSubtitle: "Qualifies and routes leads",
  welcomeMessage:
    "Hey, I can help work out whether this is the right system for you. I'll ask a few quick questions, then point you to the best next step.",
  fallbackMessage:
    "Thanks for sharing. What else can you tell me about your situation?",
  qualificationQuestions: [
    {
      id: "business",
      purpose: "business",
      text: "What kind of business are you running, and what are you trying to improve?"
    },
    {
      id: "pain",
      purpose: "pain",
      text: "What is the specific challenge? For example, is it lead quality, follow-up speed, or conversion rates?"
    },
    {
      id: "urgency",
      purpose: "urgency",
      text: "How urgent is this? Are you looking to make a change in the next few weeks, or is this more of a future exploration?"
    },
    {
      id: "readiness",
      purpose: "readiness",
      text: "What does your current process look like for handling interested visitors? Are you doing it manually or with some tooling?"
    },
    {
      id: "contact",
      purpose: "contact",
      text: "What's the best email for us to send your next step to?"
    }
  ],
  scoringWeights: {
    fit: 25,
    urgency: 20,
    pain: 25,
    readiness: 15,
    quality: 15
  },
  scoreThresholds: {
    high: 70,
    medium: 40
  },
  routeRules: defaultRouteRules,
  dashboardLabels: defaultDashboardLabels
};

// Minimal generic tenant used when no config is provided. Keeps the engine
// runnable outside the TechQuarters brand without forking code.
export const genericConfig: TenantConfig = {
  id: "generic",
  name: "Generic Tenant",
  niche: "generic",
  calendlyUrl: "",
  nurtureEmailTemplate: "Thank you for your interest. We'll follow up soon.",
  botName: "Assistant",
  botTitle: "Funnel Assistant",
  botSubtitle: "Qualifies and routes leads",
  welcomeMessage:
    "Hi. I'll ask a few quick questions to understand what you're looking for, then point you to the right next step.",
  fallbackMessage: "Tell me more about your situation.",
  qualificationQuestions: techQuartersConfig.qualificationQuestions,
  scoringWeights: techQuartersConfig.scoringWeights,
  scoreThresholds: techQuartersConfig.scoreThresholds,
  routeRules: defaultRouteRules,
  dashboardLabels: defaultDashboardLabels
};

export function getTenantConfig(id?: string): TenantConfig {
  if (id === "default" || id === "tech-quarters") {
    return techQuartersConfig;
  }
  return genericConfig;
}
