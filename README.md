# TQ ChatBot #1

A web-based funnel chatbot MVP that qualifies visitors, captures lead details, scores leads deterministically, and routes qualified leads to Calendly.

## 🚀 Features

- **Intelligent Qualification**: AI-powered chatbot that asks the right questions to understand visitor intent
- **Deterministic Scoring**: Leads are scored as `low`, `medium`, or `high` based on clear, auditable rules
- **Smart Routing**: High-value leads go to Calendly, medium leads to nurture sequences, low leads get helpful guidance
- **Real-time Analytics**: Dashboard with leads, conversions, and funnel performance metrics
- **Multi-tenant Support**: Designed for multiple businesses/tenants with proper data isolation

## 📋 Core Principles

1. **Funnel Operator, Not Support Bot**: The chatbot is designed to qualify and route leads, not provide customer support
2. **Deterministic Scoring**: Final lead scoring must be deterministic, explainable, and auditable
3. **LLM Assistance**: Claude can assist with signal extraction, but the final scoring decision is rule-based
4. **Privacy First**: No sensitive data is exposed client-side; all credentials are properly secured

## 🛠 Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Database**: Supabase (PostgreSQL)
- **Styling**: CSS Modules with CSS Variables
- **Testing**: Vitest
- **LLM**: Groq (optional, with deterministic fallback) via Supabase Edge Function
- **Scheduling**: Calendly (optional, with safe embed stub)
- **Automation**: n8n webhook contract (Edge Function-ready)

## 📁 Project Structure

```
tq-chatbot-task/
├── src/
│   ├── components/           # React components
│   │   ├── ChatWidget.tsx   # Embedded chat widget (UI layer)
│   │   ├── LandingPage.tsx  # Marketing landing page
│   │   ├── Dashboard.tsx    # Analytics dashboard
│   │   └── AuthGate.tsx     # Supabase Auth wrapper
│   ├── hooks/               # Custom React hooks
│   │   └── useChatEngine.ts # Conversation state machine + scoring logic
│   ├── lib/                 # Core libraries
│   │   ├── scoring.ts       # Deterministic scoring module
│   │   ├── supabase.ts      # Supabase client + typed Database schema
│   │   ├── edgeClient.ts    # Edge Function client (browser → Supabase)
│   │   ├── idempotency.ts   # Duplicate/spam guards
│   │   ├── rateLimit.ts     # Client-side rate limiter
│   │   └── logger.ts        # PII-redacting logger
│   ├── services/            # Business services
│   │   ├── messageService.ts  # Chat message persistence
│   │   ├── leadService.ts     # Lead management + funnel events
│   │   ├── dashboardService.ts # Dashboard data aggregation (Supabase views + fallback)
│   │   └── calendlyService.ts  # Calendly integration
│   ├── types/               # TypeScript type definitions
│   │   └── index.ts         # Core types
│   ├── __tests__/           # Test files
│   │   └── scoring.test.ts   # Scoring acceptance tests
│   ├── App.tsx              # Main app component
│   └── App.css              # Global styles
├── supabase/
│   └── schema.sql           # Database schema and RLS policies
├── .env.example             # Environment variables template
├── DECISION_LOG.md          # Architectural decisions
├── vite.config.ts           # Vite configuration
├── package.json
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm 9+
- Git

### Installation

1. **Clone the repository** (if applicable):
   ```bash
   git clone <repository-url>
   cd tq-chatbot-task
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up Supabase** (optional for development):
   - Create a new Supabase project at [supabase.com](https://supabase.com)
   - Run the schema from `supabase/schema.sql`
   - Update `.env` with your Supabase URL and anon key

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Building for Production

```bash
npm run build
```

### Running Tests

```bash
npm run test
```

### Preview Production Build

```bash
npm run preview
```

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `VITE_CALENDLY_URL` | No | Calendly embed URL |
| `VITE_DISABLE_AUTH` | No | Set `"true"` to bypass auth in local dev |
| `GROQ_API_KEY` | No | Groq API key (server-only, Edge Function) |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Service-role key (server-only, Edge Function) |

### Supabase Setup

1. Create a new Supabase project
2. Run the SQL from `supabase/schema.sql` to create tables and RLS policies
3. Update your `.env` file with the Supabase credentials

### Calendly Integration

1. Set up your Calendly account
2. Create the event types you want to offer
3. Update `VITE_CALENDLY_URL` in your `.env` file
4. The chatbot will automatically show the Calendly widget for qualified leads

### n8n Integration

1. Set up your n8n instance
2. Create workflows for lead qualification, Calendly bookings, etc.
3. Update `VITE_N8N_API_KEY` and `VITE_N8N_BASE_URL` in your `.env` file
4. The application will send events to n8n for workflow automation

## 🎯 Lead Scoring

The scoring system uses deterministic rules to classify leads:

### Scoring Rules (in priority order):

1. **High Intent** (`high`, `calendly`, alert: true)
   - Has a real business
   - Clear problem (problem_clarity >= 1)
   - Strong buying or urgency signal (wants_to_book OR urgency >= 2 OR has_traffic_or_spend)

2. **Soft Booking** (`medium`, `soft_booking`, alert: false)
   - Wants to book a call
   - Business context not established

3. **Medium Intent** (`medium`, `nurture`, alert: false)
   - Has a business
   - Clear problem (problem_clarity >= 1)
   - Unclear urgency or readiness

4. **Low Intent** (`low`, `helpful_guidance`, alert: false)
   - Default case
   - No clear business, problem, or buying signal

### Signal Types

| Signal | Type | Description |
|--------|------|-------------|
| `has_business` | boolean | User has/owns/runs a business |
| `has_traffic_or_spend` | boolean | User spends on ads or gets traffic |
| `problem_clarity` | 0\|1\|2 | Clarity of the problem (0=none, 1=some, 2=clear) |
| `urgency` | 0\|1\|2 | Urgency level (0=none, 1=some, 2=high) |
| `wants_to_book` | boolean | User wants to book a call/meeting |
| `manual_sales_signal` | boolean | Mentions sales, revenue, growth |
| `budget_signal` | boolean | Mentions budget, money, investment |
| `contact_captured` | boolean | User has provided contact info |

## 📊 Dashboard Metrics

The dashboard provides real-time insights into your funnel performance:

- **Total Leads**: Number of leads captured (today/week/month)
- **Score Distribution**: Breakdown of leads by score (high/medium/low)
- **Calendly Performance**: Widget shown, clicked, and booked counts
- **Conversion Rates**: Percentage of visitors who book calls
- **Recent Leads**: List of recent leads with details
- **Scoring Insights**: Explanations for lead scoring decisions

## 🧪 Acceptance Tests

The project includes comprehensive tests for the scoring scenarios:

1. **Hot Lead**: "I run an ecommerce brand. We are spending on paid ads and getting leads, but follow-up is slow. I want to talk soon."
   - Expected: `high`, `calendly`, alert: true

2. **Warm Lead**: "I have a small service business. I know our funnel is weak, but I'm not sure about budget or timing yet."
   - Expected: `medium`, `nurture`, alert: false

3. **Tyre-kicker**: "Just looking around. Not sure yet."
   - Expected: `low`, `helpful_guidance`, alert: false

4. **Soft Booking**: "Can I just book a call?"
   - Expected: `medium`, `soft_booking`, alert: false

Run tests with:
```bash
npm run test
```

## 🔒 Security

### Row Level Security (RLS)

All database tables have RLS policies to ensure data isolation:
- Tenants can only access their own data
- Service role has full access for administrative tasks
- Proper policies for read, write, and update operations

### Environment Security

- Never commit real API keys or secrets to version control
- Use `.env` for development and proper secret management for production
- Client-side code only has access to non-sensitive configuration

### Data Protection

- All sensitive operations use server-side endpoints (when implemented)
- Chat data is stored securely in Supabase
- Proper access controls for all data

## 📝 Architecture Decisions

See [DECISION_LOG.md](DECISION_LOG.md) for detailed architectural decisions and rationale.

---

## 📦 Final Submission — Deliverables Mapping

This section maps directly to Kaan's requested deliverables:

### 1. Plan and Structure
- **[SYSTEM_STRUCTURE.md](SYSTEM_STRUCTURE.md)** — Written architecture with layer-by-layer explanation
- **[visual-architecture.html](visual-architecture.html)** — Visual diagram of the full system flow
- **[DECISION_LOG.md](DECISION_LOG.md)** — Architectural decisions with rationale

### 2. Tools and Monthly Cost
- **[COSTS.md](COSTS.md)** — All tools used, free tier coverage, V1 estimate (~$2–5/mo), LLM cost scaling

### 3. Visual Structure
- **[visual-architecture.html](visual-architecture.html)** — Clean HTML/CSS diagram showing the full pipeline:
  Client Website → Chat Widget → Conversation Engine → Claude Extraction → Deterministic Scoring → Supabase → n8n → Calendly/Alerts/Dashboard
- Includes side box for Client Config Layer

### 4. Written Structure
- **[SYSTEM_STRUCTURE.md](SYSTEM_STRUCTURE.md)** — Explains each layer, what is reusable vs client-specific
- **[RECONFIGURATION_GUIDE.md](RECONFIGURATION_GUIDE.md)** — How to reuse the engine for another business

### 5. Where AI / Agents / Automation Are Added
- **[AI_AUTOMATION_MAP.md](AI_AUTOMATION_MAP.md)** — Complete map of:
  - Where AI is used (conversation, extraction, summary, score proposal)
  - Where deterministic logic is used (final scoring, routing, idempotency, suppression)
  - Where automation is used (n8n alerts, booking sync, follow-up suppression)
  - Future improvements (CRM, auto follow-up, multi-client setup)

### 6. Working Proof
- **`npm run test`** — 116/116 tests pass (scoring, idempotency, edge client, dashboard, chat widget)
- **`npm run build`** — TypeScript compiles, Vite builds successfully
- **Deterministic scoring** — Fully working with auditable rules
- **Chat widget** — Functional with conversation flow, contact capture, Calendly embed
- **Dashboard** — Shows leads, score distribution, Calendly metrics, scoring insights
- **Supabase schema** — Complete with 7 tables, RLS policies, indexes, views
- **Event contracts** — n8n and Calendly integration stubs ready for production

### 7. Reconfiguration Documentation
- **[RECONFIGURATION_GUIDE.md](RECONFIGURATION_GUIDE.md)** — Complete guide for onboarding new clients:
  - Tenant config example (brand, questions, labels, Calendly URL, alert channel)
  - What changes per client vs what should not be forked
  - 5-minute onboarding checklist

### Additional Deliverables
- **[.env.example](.env.example)** — Security-hardened with clear client-safe vs server-only separation
- **[COSTS.md](COSTS.md)** — Detailed cost analysis with scaling estimates
- **Security hardening** — No sensitive keys exposed to client bundle; Claude/n8n/service-role keys documented as server-only

---

## 🔒 Security Hardening

### Environment Variable Security

| Variable | Prefix | Exposed To | Purpose |
|----------|--------|-----------|---------|
| `VITE_SUPABASE_URL` | VITE_ | Browser | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | VITE_ | Browser | Supabase anonymous key (RLS-protected) |
| `VITE_CALENDLY_URL` | VITE_ | Browser | Calendly embed URL |
| `CLAUDE_API_KEY` | None | Server only | Claude API key (Edge Function) |
| `N8N_WEBHOOK_URL` | None | Server only | n8n webhook URL (Edge Function) |
| `N8N_WEBHOOK_SECRET` | None | Server only | n8n webhook secret (Edge Function) |
| `SUPABASE_SERVICE_ROLE_KEY` | None | Server only | Supabase service-role key (Edge Function) |

**Rule:** Any variable that provides write access, API access, or webhook access is server-only. The browser only reads data through RLS-protected queries with the anonymous key.

### Production Security Model

- **Groq LLM calls** → Supabase Edge Function `chat-api` (signal extraction + response drafting)
- **n8n event dispatch** → Edge Function-ready webhook contract (logs to console in dev)
- **Service-role writes** → Supabase Edge Functions (alerts, followup_jobs, tenant admin)
- **Browser** → Only uses anon key + RLS policies

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is proprietary. All rights reserved.

## 🙏 Acknowledgments

- Built with [Vite](https://vitejs.dev/)
- Powered by [React](https://react.dev/)
- Database by [Supabase](https://supabase.com/)
- LLM by [Claude](https://claude.ai/)
- Scheduling by [Calendly](https://calendly.com/)
- Automation by [n8n](https://n8n.io/)

---

**Version**: 1.0.0  
**Last Updated**: 2026-07-04  
**Author**: TQ ChatBot Team
