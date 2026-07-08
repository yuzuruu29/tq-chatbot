# SYSTEM_STRUCTURE.md — TQ ChatBot #1

## Architecture Overview

```
Client Website
    ↓
Embedded Chat Widget
    ↓
Conversation Engine
    ↓
Claude Extraction (optional)
    ↓
Deterministic Scoring
    ↓
Supabase (persistence)
    ↓
n8n (automation)
    ↓
Calendly / Alerts / Dashboard
```

---

## Layer-by-Layer Explanation

### 1. Client Website

The landing page is a standard React SPA served by Vite. It contains:

- Hero section with value proposition
- Features and benefits sections
- Floating chat widget toggle button
- Dashboard link for analytics

**What it does:** Presents the business to visitors and provides a non-intrusive entry point to the chat widget.

**Reusable across clients:** The layout structure is reusable. The content (headlines, descriptions, features) changes per client.

---

### 2. Embedded Chat Widget

A modal overlay chat interface that:

- Creates or retrieves a `visitor_id` from localStorage
- Starts a new `chat_session` for each visit
- Displays messages in a conversational thread
- Handles contact capture forms
- Embeds Calendly widget when routing to booking

**What it does:** Provides the conversational interface for lead qualification.

**Reusable across clients:** The widget structure is identical. The greeting message, question flow, and branding change per client via tenant configuration.

---

### 3. Conversation Engine

The chat logic that:

- Presents qualification questions in sequence
- Collects user responses
- Tracks the conversation step (greeting → qualification → contact capture → routing)
- Manages session state

**What it does:** Drives the conversation flow and collects signals from user input.

**Reusable across clients:** The conversation engine is generic. The questions, prompts, and flow steps are configured per tenant.

---

### 4. Groq LLM Extraction (Optional)

An LLM-based signal extraction and response drafting layer powered by Groq:

- Receives user message text and conversation history
- Extracts structured signals (has_business, urgency, problem_clarity, etc.)
- Drafts natural-language responses (replaces deterministic wording when available)
- Falls back to deterministic regex extraction when Groq is unconfigured or times out

**What it does:** Improves signal extraction accuracy and response naturalness beyond simple pattern matching. LLM results never override positive deterministic signals.

**Security:** The Groq API key lives in a Supabase Edge Function (`chat-api`), never in the browser.

**Reusable across clients:** The extraction prompt is generic. Client-specific context is passed via tenant configuration.

---

### 5. Deterministic Scoring

The `scoreLead()` function that:

- Takes extracted signals as input
- Applies rule-based scoring (high / medium / low)
- Determines the route (calendly / soft_booking / nurture / helpful_guidance)
- Generates an auditable score reason

**What it does:** Makes the final lead qualification decision. This is the single source of truth for scoring.

**Why deterministic:** The employer requirement specifies that final scoring must be "deterministic, explainable, and auditable." LLM can assist with extraction, but the decision logic is rule-based.

**Reusable across clients:** The core scoring engine is identical for all clients. Scoring thresholds can be adjusted per tenant if needed, but the rule structure is shared.

---

### 6. Supabase (Persistence)

The database layer that stores:

- `tenants` — business configurations
- `leads` — qualified lead records with scores and signals
- `chat_sessions` — conversation sessions
- `chat_messages` — individual messages
- `lead_scoring_signals` — individual signal records for auditability
- `funnel_events` — all funnel-related events for analytics
- `followup_jobs` — scheduled follow-up tasks

**What it does:** Persists all data with Row Level Security for multi-tenant isolation.

**Reusable across clients:** The schema is shared across all tenants. Each client's data is isolated by `tenant_id` and RLS policies.

---

### 7. n8n (Automation)

The workflow automation layer that:

- Receives events from the application (via Edge Function)
- Triggers workflows for high-value lead alerts
- Sends email notifications
- Manages follow-up sequences
- Syncs with external systems (CRM, Slack, etc.)

**What it does:** Automates post-qualification actions.

**Security:** The n8n webhook URL and secret live in a Supabase Edge Function, never in the browser.

**Reusable across clients:** The event contract is generic. Each tenant can have different n8n workflows configured.

**Contract-ready:** The event types and payload shapes are defined. In development, events log to console. Production deployment wires the Edge Function to the n8n webhook URL.

---

### 8. Calendly / Alerts / Dashboard

The output layer that:

- **Calendly:** Embeds scheduling widget for high-value leads
- **Alerts:** Notifies sales team of qualified leads (via n8n)
- **Dashboard:** Shows real-time analytics (leads, scores, conversions, funnel steps)

**What it does:** Routes qualified leads to the right next step and provides visibility into funnel performance.

**Reusable across clients:** The dashboard structure is shared. Calendly URLs, alert channels, and dashboard branding change per tenant.

---

## Client Config Layer

The following are configured per tenant and do not require code changes:

| Config Item | Example | Where Used |
|-------------|---------|------------|
| Brand name | "Acme Corp" | Landing page, chat header |
| Greeting message | "Hi! How can I help?" | Chat widget first message |
| Qualification questions | "What's your biggest challenge?" | Conversation engine |
| Scoring thresholds | problem_clarity >= 1 for medium | scoreLead() |
| Calendly URL | calendly.com/acme/demo | Chat widget booking embed |
| Alert channel | Slack #sales-alerts | n8n workflow |
| Pipeline labels | "Qualified Lead", "Nurture" | Dashboard, events |
| Nurture email template | "Thanks for your interest..." | Followup jobs |

---

## What Is Reusable vs Client-Specific

### Reusable (shared codebase, no changes per client)

- Scoring engine (`scoreLead()`)
- Event contract (funnel event types and structure)
- Dashboard model (metrics, charts, tables)
- Persistence layer (schema, RLS policies, service abstractions)
- Chat widget UI component
- Signal extraction logic (deterministic + LLM prompt)
- n8n event dispatch contract

### Client-Specific (configured via tenant settings)

- Branding (logo, colors, copy)
- Conversation questions and flow
- Calendly URL
- Alert channel configuration
- Scoring thresholds (if customized)
- Nurture email templates
- Dashboard labels and filters
