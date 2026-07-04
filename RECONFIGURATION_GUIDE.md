# RECONFIGURATION_GUIDE.md — TQ ChatBot #1

## How to Reuse This Engine for Another Business

The TQ ChatBot engine is designed as a multi-tenant platform. To onboard a new client, you do **not** fork the codebase. Instead, you create a new tenant record and configure it.

---

## Step 1: Create a New Tenant

Insert a new row into the `tenants` table:

```sql
INSERT INTO tenants (id, name, calendly_url, nurture_email_template)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Acme Corp',
  'https://calendly.com/acme-corp/demo',
  'Hi {name}, thank you for your interest in Acme Corp. Here are some resources that might help.'
);
```

---

## Step 2: Configure Client-Specific Settings

Create a tenant configuration object (stored in your config system or database):

```json
{
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "brand": {
    "name": "Acme Corp",
    "logo_url": "https://acme.com/logo.png",
    "primary_color": "#1e40af",
    "tagline": "Enterprise automation for growing teams"
  },
  "chat": {
    "greeting": "Hi! I'm here to help you figure out if Acme Corp is right for your team. What brings you here today?",
    "qualification_questions": [
      "What's the biggest challenge your team faces with workflow automation?",
      "How many people are on your team?",
      "What tools are you currently using?",
      "What's your timeline for making a change?"
    ],
    "booking_prompt": "I think Acme Corp could be a great fit. Want to schedule a demo?",
    "nurture_prompt": "Thanks for sharing that. I'll send you some resources that might help.",
    "guidance_prompt": "Here are some articles that might be useful as you explore your options."
  },
  "scoring": {
    "high_threshold": {
      "has_team_size_5_plus": true,
      "problem_clarity": 1,
      "urgency_or_timeline": "this_quarter"
    },
    "medium_threshold": {
      "has_team": true,
      "problem_clarity": 1
    }
  },
  "routing": {
    "calendly_url": "https://calendly.com/acme-corp/demo",
    "alert_channel": "slack",
    "alert_channel_config": {
      "webhook_url": "https://hooks.slack.com/services/xxx/yyy/zzz",
      "channel": "#acme-sales"
    },
    "nurture_sequence": {
      "delay_hours": 24,
      "template_id": "acme-nurture-001"
    }
  },
  "labels": {
    "high_score_label": "Hot Lead",
    "medium_score_label": "Warm Lead",
    "low_score_label": "Exploring",
    "pipeline_stage_names": ["New", "Demo Scheduled", "Qualified", "Proposal", "Closed"]
  }
}
```

---

## Step 3: Configure Environment Variables

For the new tenant's deployment:

```env
# Client-safe (browser-exposed)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_CALENDLY_URL=https://calendly.com/acme-corp/demo

# Server-only (Edge Function secrets)
CLAUDE_API_KEY=your-claude-key
N8N_WEBHOOK_URL=https://your-n8n.com/webhook/acme
N8N_WEBHOOK_SECRET=your-webhook-secret
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## What Changes Per Client

| Item | Example: TQ Chatbot | Example: Acme Corp |
|------|---------------------|-------------------|
| **Brand name** | TQ ChatBot | Acme Corp |
| **Logo/colors** | Blue (#2563eb) | Navy (#1e40af) |
| **Greeting** | "What brings you here?" | "What's your biggest challenge?" |
| **Qualification questions** | Business, traffic, urgency | Team size, tools, timeline |
| **Calendly link** | calendly.com/tq-chatbot | calendly.com/acme-corp/demo |
| **Alert channel** | Email | Slack #acme-sales |
| **Scoring labels** | High / Medium / Low | Hot / Warm / Exploring |
| **Pipeline labels** | New → Booked → Converted | New → Demo → Qualified → Closed |
| **Nurture template** | TQ follow-up email | Acme resource email |
| **Dashboard title** | TQ Dashboard | Acme Sales Dashboard |

---

## What Should NOT Be Forked

These are shared across all clients and should be maintained in a single codebase:

| Component | Reason |
|-----------|--------|
| **Scoring engine** (`scoreLead()`) | Single source of truth for qualification logic. Thresholds are configurable, but the rule structure is shared. |
| **Event contract** (funnel event types) | Standardized event structure ensures consistency across all tenants for analytics and automation. |
| **Dashboard model** (metrics, charts) | Shared dashboard code with tenant-scoped data. No need to duplicate. |
| **Persistence layer** (schema, RLS) | Multi-tenant schema with RLS isolation. Forking would break data consistency. |
| **Signal extraction** (regex + LLM prompt) | Shared extraction logic. Client-specific context is added via tenant config, not code changes. |
| **Chat widget UI** | Shared component. Branding is applied via config, not code changes. |
| **n8n event dispatch** | Shared event contract. Each tenant's n8n workflow is configured separately. |

---

## Deployment Pattern

### Option A: Single Deployment, Multi-Tenant

One deployment serves all clients. Tenant is identified by:

- Subdomain: `acme.tqchatbot.com`
- URL parameter: `?tenant=acme-corp`
- Embedded config: Widget script includes `data-tenant-id`

### Option B: Per-Client Deployment

Each client gets their own deployment (Vercel project, Supabase project). Use this when:

- Clients need isolated databases
- Clients have different compliance requirements
- Clients want custom domains

In this case, the codebase is identical — only the environment variables and tenant config differ.

---

## Quick Start: Onboarding a New Client (5 Minutes)

1. Create tenant record in Supabase
2. Configure tenant settings (brand, questions, labels)
3. Set Calendly URL in `.env`
4. Deploy (or add tenant to existing deployment)
5. Share the landing page URL

No code changes required.
