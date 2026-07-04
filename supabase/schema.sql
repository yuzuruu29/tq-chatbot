-- TQ ChatBot #1 - Supabase Database Schema
-- This file contains the complete schema for the funnel chatbot MVP

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- TENANTS TABLE
-- Stores tenant information for multi-tenancy
-- ============================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  calendly_url TEXT,
  nurture_email_template TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Update updated_at on row update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- LEADS TABLE
-- Stores lead information with scoring results
-- ============================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  visitor_id TEXT NOT NULL,
  score TEXT NOT NULL CHECK (score IN ('low', 'medium', 'high')),
  route TEXT NOT NULL CHECK (route IN ('calendly', 'soft_booking', 'nurture', 'helpful_guidance')),
  signals JSONB NOT NULL DEFAULT '{}',
  contact_info JSONB NOT NULL DEFAULT '{}',
  scoring_result JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'booked', 'converted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Indexes for leads
CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_visitor_id ON leads(visitor_id);
CREATE INDEX IF NOT EXISTS idx_leads_session_id ON leads(session_id);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

-- ============================================
-- CHAT_SESSIONS TABLE
-- Stores chat session information
-- ============================================
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visitor_id TEXT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  current_step TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Indexes for chat_sessions
CREATE INDEX IF NOT EXISTS idx_chat_sessions_tenant_id ON chat_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_visitor_id ON chat_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_lead_id ON chat_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at);

-- ============================================
-- CHAT_MESSAGES TABLE
-- Stores individual chat messages
-- ============================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  metadata JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_chat_messages_role ON chat_messages(role);

-- ============================================
-- LEAD_SCORING_SIGNALS TABLE
-- Stores individual scoring signals for auditability
-- ============================================
CREATE TABLE IF NOT EXISTS lead_scoring_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  value BOOLEAN OR SMALLINT,
  confidence DECIMAL(3,2) NOT NULL DEFAULT 1.00 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL CHECK (source IN ('manual', 'llm', 'deterministic')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for lead_scoring_signals
CREATE INDEX IF NOT EXISTS idx_lead_scoring_signals_lead_id ON lead_scoring_signals(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_scoring_signals_signal_type ON lead_scoring_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_lead_scoring_signals_source ON lead_scoring_signals(source);
CREATE INDEX IF NOT EXISTS idx_lead_scoring_signals_timestamp ON lead_scoring_signals(timestamp);

-- ============================================
-- FUNNEL_EVENTS TABLE
-- Stores all funnel-related events for analytics
-- ============================================
CREATE TABLE IF NOT EXISTS funnel_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'chat_started',
    'message_sent',
    'lead_captured',
    'lead_scored',
    'calendly_shown',
    'calendly_clicked',
    'calendly_booked',
    'nurture_shown',
    'booking_option_shown',
    'helpful_guidance_shown',
    'alert_triggered',
    'alert_suppressed'
  )),
  data JSONB NOT NULL DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for funnel_events
CREATE INDEX IF NOT EXISTS idx_funnel_events_tenant_id ON funnel_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_session_id ON funnel_events(session_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_lead_id ON funnel_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_event_type ON funnel_events(event_type);
CREATE INDEX IF NOT EXISTS idx_funnel_events_timestamp ON funnel_events(timestamp);

-- ============================================
-- FOLLOWUP_JOBS TABLE
-- Stores follow-up jobs for nurture sequences
-- ============================================
CREATE TABLE IF NOT EXISTS followup_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('email', 'sms', 'calendly_reminder', 'nurture_sequence')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for followup_jobs
CREATE INDEX IF NOT EXISTS idx_followup_jobs_lead_id ON followup_jobs(lead_id);
CREATE INDEX IF NOT EXISTS idx_followup_jobs_tenant_id ON followup_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_followup_jobs_job_type ON followup_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_followup_jobs_status ON followup_jobs(status);
CREATE INDEX IF NOT EXISTS idx_followup_jobs_scheduled_at ON followup_jobs(scheduled_at);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
--
-- SECURITY POSTURE:
-- All tables have RLS enabled. The policies below require Supabase Auth
-- (auth.uid()) for all reads and writes. This is intentional:
--
-- 1. PUBLIC CHAT ENDPOINT: The browser chat widget does NOT write directly
--    to Supabase. It uses in-memory storage in the browser MVP. In production,
--    chat messages are persisted through a Supabase Edge Function that holds
--    the service-role key and enforces its own validation + rate limiting.
--
-- 2. DASHBOARD: Requires authenticated access. Do NOT deploy the dashboard
--    at a public URL without Supabase Auth enabled. The dashboard reads
--    lead data which contains PII (names, emails, business details).
--
-- 3. SERVICE-ROLE KEY: Never exposed to the browser. Lives only in Edge
--    Functions. Bypasses RLS, so Edge Functions must validate inputs.
--
-- 4. ANON KEY: Used only for the Supabase client initialization. With
--    these RLS policies, the anon key alone cannot read or write any data.
--    All meaningful access goes through Edge Functions or authenticated users.
--
-- LAUNCH BLOCKER: If deploying the public chat endpoint without Edge Functions,
-- you MUST add permissive INSERT policies for chat_messages and chat_sessions
-- that allow anonymous inserts with tenant_id validation and rate limiting.
-- This is intentionally NOT done here to prevent accidental data exposure.

-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_scoring_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenants
-- Allow authenticated users to read their own tenant
CREATE POLICY "Allow tenant read for authenticated users" ON tenants
  FOR SELECT
  USING (auth.uid() = id::text);

-- Allow service role to manage tenants
CREATE POLICY "Allow tenant management for service role" ON tenants
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for leads
-- Allow read access to leads for tenant members
CREATE POLICY "Allow lead read for tenant members" ON leads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tenants 
      WHERE tenants.id = leads.tenant_id 
      AND auth.uid() = tenants.id::text
    )
  );

-- Allow insert/update for authenticated users (will be restricted by application logic)
CREATE POLICY "Allow lead write for authenticated users" ON leads
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenants 
      WHERE tenants.id = NEW.tenant_id 
      AND auth.uid() = tenants.id::text
    )
  );

CREATE POLICY "Allow lead update for authenticated users" ON leads
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM tenants 
      WHERE tenants.id = leads.tenant_id 
      AND auth.uid() = tenants.id::text
    )
  );

-- RLS Policies for chat_sessions
CREATE POLICY "Allow chat session read for tenant members" ON chat_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tenants 
      WHERE tenants.id = chat_sessions.tenant_id 
      AND auth.uid() = tenants.id::text
    )
  );

CREATE POLICY "Allow chat session write for authenticated users" ON chat_sessions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenants 
      WHERE tenants.id = NEW.tenant_id 
      AND auth.uid() = tenants.id::text
    )
  );

CREATE POLICY "Allow chat session update for authenticated users" ON chat_sessions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM tenants 
      WHERE tenants.id = chat_sessions.tenant_id 
      AND auth.uid() = tenants.id::text
    )
  );

-- RLS Policies for chat_messages
CREATE POLICY "Allow chat message read for session participants" ON chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions 
      JOIN tenants ON chat_sessions.tenant_id = tenants.id
      WHERE chat_sessions.id = chat_messages.session_id 
      AND auth.uid() = tenants.id::text
    )
  );

CREATE POLICY "Allow chat message write for authenticated users" ON chat_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_sessions 
      JOIN tenants ON chat_sessions.tenant_id = tenants.id
      WHERE chat_sessions.id = NEW.session_id 
      AND auth.uid() = tenants.id::text
    )
  );

-- RLS Policies for lead_scoring_signals
CREATE POLICY "Allow signal read for tenant members" ON lead_scoring_signals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads 
      JOIN tenants ON leads.tenant_id = tenants.id
      WHERE leads.id = lead_scoring_signals.lead_id 
      AND auth.uid() = tenants.id::text
    )
  );

-- RLS Policies for funnel_events
CREATE POLICY "Allow funnel event read for tenant members" ON funnel_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tenants 
      WHERE tenants.id = funnel_events.tenant_id 
      AND auth.uid() = tenants.id::text
    )
  );

CREATE POLICY "Allow funnel event write for authenticated users" ON funnel_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenants 
      WHERE tenants.id = NEW.tenant_id 
      AND auth.uid() = tenants.id::text
    )
  );

-- RLS Policies for followup_jobs
CREATE POLICY "Allow followup job read for tenant members" ON followup_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tenants 
      WHERE tenants.id = followup_jobs.tenant_id 
      AND auth.uid() = tenants.id::text
    )
  );

-- ============================================
-- SEED DATA
-- ============================================

-- Insert default tenant if none exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants) THEN
    INSERT INTO tenants (id, name, calendly_url, nurture_email_template)
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      'Default Tenant',
      'https://calendly.com/tq-chatbot',
      'Hello {name}, thank you for your interest in TQ ChatBot. We''ll follow up with you soon.'
    );
  END IF;
END $$;

-- ============================================
-- VIEWS FOR DASHBOARD
-- ============================================

-- Daily leads view
CREATE OR REPLACE VIEW daily_leads AS
SELECT 
  DATE(created_at) as day,
  tenant_id,
  score,
  COUNT(*) as count
FROM leads 
GROUP BY DATE(created_at), tenant_id, score
ORDER BY day DESC, count DESC;

-- Weekly leads view
CREATE OR REPLACE VIEW weekly_leads AS
SELECT 
  DATE_TRUNC('week', created_at) as week,
  tenant_id,
  score,
  COUNT(*) as count
FROM leads 
GROUP BY DATE_TRUNC('week', created_at), tenant_id, score
ORDER BY week DESC, count DESC;

-- Monthly leads view
CREATE OR REPLACE VIEW monthly_leads AS
SELECT 
  DATE_TRUNC('month', created_at) as month,
  tenant_id,
  score,
  COUNT(*) as count
FROM leads 
GROUP BY DATE_TRUNC('month', created_at), tenant_id, score
ORDER BY month DESC, count DESC;

-- Calendly metrics view
CREATE OR REPLACE VIEW calendly_metrics AS
SELECT 
  tenant_id,
  COUNT(*) FILTER (WHERE event_type = 'calendly_shown') as shown,
  COUNT(*) FILTER (WHERE event_type = 'calendly_clicked') as clicked,
  COUNT(*) FILTER (WHERE event_type = 'calendly_booked') as booked
FROM funnel_events 
GROUP BY tenant_id;

-- Funnel steps view
CREATE OR REPLACE VIEW funnel_steps AS
SELECT 
  tenant_id,
  event_type,
  COUNT(*) as count
FROM funnel_events 
WHERE event_type IN ('chat_started', 'lead_captured', 'lead_scored', 'calendly_shown', 'calendly_clicked', 'calendly_booked')
GROUP BY tenant_id, event_type
ORDER BY count DESC;

-- Recent conversations view
CREATE OR REPLACE VIEW recent_conversations AS
SELECT 
  cs.id as session_id,
  cs.visitor_id,
  cs.tenant_id,
  cs.status,
  cs.created_at,
  l.id as lead_id,
  l.score,
  l.route,
  (SELECT COUNT(*) FROM chat_messages cm WHERE cm.session_id = cs.id) as message_count,
  (SELECT content FROM chat_messages cm WHERE cm.session_id = cs.id ORDER BY timestamp DESC LIMIT 1) as last_message
FROM chat_sessions cs
LEFT JOIN leads l ON cs.lead_id = l.id
ORDER BY cs.updated_at DESC
LIMIT 50;
