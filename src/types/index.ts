// TQ ChatBot #1 - Core Types

export type LeadScore = "low" | "medium" | "high";
export type Route = "calendly" | "soft_booking" | "nurture" | "helpful_guidance";

export type Signals = {
  has_business: boolean;
  has_traffic_or_spend: boolean;
  problem_clarity: 0 | 1 | 2;
  urgency: 0 | 1 | 2;
  wants_to_book: boolean;
  manual_sales_signal: boolean;
  budget_signal: boolean;
  contact_captured: boolean;
  model_proposed_score?: LeadScore;
};

export type ScoringResult = {
  final_score: LeadScore;
  route: Route;
  alert: boolean;
  score_reason: string;
};

export type ChatMessage = {
  id: string;
  session_id: string;
  content: string;
  role: "user" | "assistant" | "system";
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type ChatSession = {
  id: string;
  visitor_id: string;
  tenant_id: string;
  status: "active" | "completed" | "abandoned";
  created_at: string;
  updated_at: string;
  lead_id?: string;
  current_step?: string;
};

export type Lead = {
  id: string;
  tenant_id: string;
  session_id: string;
  visitor_id: string;
  score: LeadScore;
  route: Route;
  signals: Signals;
  contact_info: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
  };
  scoring_result: ScoringResult;
  status: "new" | "contacted" | "booked" | "converted" | "rejected";
  created_at: string;
  updated_at: string;
};

export type FunnelEvent = {
  id: string;
  tenant_id: string;
  session_id: string;
  lead_id?: string;
  event_type: 
    | "chat_started"
    | "message_sent"
    | "lead_captured"
    | "lead_scored"
    | "calendly_shown"
    | "calendly_clicked"
    | "calendly_booked"
    | "nurture_shown"
    | "booking_option_shown";
  data: Record<string, unknown>;
  timestamp: string;
};

export type LeadScoringSignal = {
  id: string;
  lead_id: string;
  signal_type: keyof Signals;
  value: boolean | number;
  confidence: number;
  source: "manual" | "llm" | "deterministic";
  timestamp: string;
};

export type FollowupJob = {
  id: string;
  lead_id: string;
  tenant_id: string;
  job_type: "email" | "sms" | "calendly_reminder" | "nurture_sequence";
  status: "pending" | "completed" | "failed";
  scheduled_at: string;
  completed_at?: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type Tenant = {
  id: string;
  name: string;
  calendly_url?: string;
  nurture_email_template?: string;
  created_at: string;
  updated_at: string;
};

export type DashboardMetrics = {
  leads_today: number;
  leads_week: number;
  leads_month: number;
  score_split: Record<LeadScore, number>;
  calendly_shown: number;
  calendly_clicked: number;
  calendly_booked: number;
  funnel_steps: Record<string, number>;
  recent_conversations: ChatSession[];
};

export type VisitorContext = {
  visitor_id: string;
  session_id: string;
  tenant_id: string;
};
