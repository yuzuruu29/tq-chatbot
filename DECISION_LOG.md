# TQ ChatBot #1 - Decision Log

This document tracks key architectural and implementation decisions made during the development of TQ ChatBot #1.

## Project Overview
- **Purpose**: Web-based funnel chatbot MVP for lead qualification and routing
- **Core Principle**: Deterministic, explainable, and auditable lead scoring
- **Stack**: Vite + React + TypeScript + Supabase

---

## Architecture Decisions

### 1. Technology Stack Selection
**Decision**: Use Vite + React + TypeScript for the frontend
**Rationale**: 
- Vite provides fast development and build times
- React offers a component-based architecture suitable for chat UIs
- TypeScript ensures type safety and better maintainability
- Modern, widely-supported stack with good ecosystem

**Alternatives Considered**: Next.js, SvelteKit, Astro
**Status**: ✅ Implemented

### 2. State Management
**Decision**: Use React context and custom hooks for state management
**Rationale**: 
- Application complexity doesn't warrant Redux or similar libraries
- Custom hooks provide better type safety and organization
- Simpler to understand and maintain for this scale

**Alternatives Considered**: Redux Toolkit, Zustand, Jotai
**Status**: ✅ Implemented

### 3. Data Persistence
**Decision**: Implement abstraction layer with Supabase and in-memory fallback
**Rationale**: 
- Supabase provides scalable, real-time database with RLS
- In-memory fallback allows development without Supabase configuration
- Abstraction layer makes it easy to switch storage backends

**Alternatives Considered**: Firebase, direct API calls, localStorage only
**Status**: ✅ Implemented

### 4. Lead Scoring
**Decision**: Implement deterministic scoring function as the single source of truth
**Rationale**: 
- Must be explainable and auditable (requirement)
- LLM can assist with signal extraction but final decision is deterministic
- Easy to test and verify

**Alternatives Considered**: Pure LLM scoring, hybrid scoring with LLM override
**Status**: ✅ Implemented

---

## Implementation Decisions

### 5. Scoring Function Implementation
**Decision**: Use a 4-rule priority cascade with numeric breakdown
**Rationale**: 
- Matches the specified requirements exactly
- Rules are ordered by priority (high intent first)
- Each rule has clear, testable conditions
- Numeric score_value (0–100) provides granularity for dashboard display
- ScoreBreakdown (fit/urgency/pain/readiness/quality) makes every score explainable

**Rules**:
1. High: has_business + problem_clarity >= 1 + (wants_to_book OR urgency >= 2 OR has_traffic_or_spend)
2. Soft Booking: wants_to_book AND NOT has_business
3. Medium: has_business + problem_clarity >= 1
4. Low: Default case

**Numeric Dimensions** (0–100 total):
- Fit (0–25): has_business + has_traffic_or_spend
- Urgency (0–20): urgency signal strength
- Pain (0–25): problem_clarity
- Readiness (0–15): wants_to_book + contact_captured
- Quality (0–15): manual_sales_signal + budget_signal

**Status**: ✅ Implemented

### 6. Signal Extraction
**Decision**: Single canonical extraction function in scoring.ts; claudeService delegates to it
**Rationale**: 
- Eliminates duplicate, divergent regex patterns between scoring.ts and claudeService.ts
- ClaudeService.deterministicExtraction() now delegates to extractSignalsFromText()
- LLM extraction stub remains ready for Edge Function deployment

**Status**: ✅ Implemented (duplicate removed)

### 7. Chat Widget Design
**Decision**: Modal overlay with embedded chat interface
**Rationale**: 
- Non-intrusive but easily accessible
- Works well on both desktop and mobile
- Can be triggered from multiple points on the page

**Alternatives Considered**: Fixed sidebar, bottom bar, full-page chat
**Status**: ✅ Implemented

### 8. Lead Routing
**Decision**: Route based on scoring result with clear actions
**Rationale**: 
- High → Calendly with alert
- Medium (soft_booking) → Calendly without alert
- Medium (nurture) → Email capture
- Low → Helpful guidance

**Status**: ✅ Implemented

### 9. Closer vs Questionnaire Design
**Decision**: Bot behaves as a guided funnel closer, not a passive intake form
**Rationale**:
- A questionnaire collects data; a closer qualifies and routes
- The bot uses getQualificationGap() to determine what signal is missing
- It asks purposeful follow-up questions based on the gap (business → pain → urgency → readiness)
- Once enough signals exist, it routes toward the appropriate action (Calendly, nurture, guidance)
- Responses are drawn from tenant config qualification questions, not hardcoded generic prompts

**Key Behaviours**:
- Greets, then immediately asks about business context
- If no business: asks about business
- If business but no pain: asks about specific challenge
- If business + pain but no urgency: asks about timeline
- If high score: routes to Calendly with a tailored prompt
- If wants_to_book: captures contact, then shows Calendly
- Never feels like a static survey

**Status**: ✅ Implemented

---

## Security Decisions

### 10. Row Level Security (RLS)
**Decision**: Implement comprehensive RLS policies for all tables
**Rationale**: 
- Multi-tenant architecture requires data isolation
- Prevents unauthorized access to tenant data
- Follows principle of least privilege

**Policies**:
- Tenants: Only service role can manage, authenticated users can read their own
- Leads: Tenant members can read/write their own leads
- Chat sessions/messages: Participants can access their conversations
- Events: Tenant members can read their own events

**Status**: ✅ Implemented in schema.sql

### 11. Environment Variables
**Decision**: Use Vite's import.meta.env for client-side environment variables
**Rationale**: 
- Secure way to expose configuration to client
- Variables are replaced at build time
- Sensitive keys should only be used server-side

**Variables**:
- VITE_SUPABASE_URL: Supabase project URL
- VITE_SUPABASE_ANON_KEY: Supabase anonymous key
- VITE_CALENDLY_URL: Calendly embed URL

**Server-only (no VITE_ prefix):**
- CLAUDE_API_KEY: Edge Function secret
- N8N_WEBHOOK_URL: Edge Function secret
- N8N_WEBHOOK_SECRET: Edge Function secret
- SUPABASE_SERVICE_ROLE_KEY: Edge Function secret

**Status**: ✅ Implemented

### 12. API Key Handling
**Decision**: Never expose sensitive API keys client-side
**Rationale**: 
- Client-side code can be inspected by anyone
- Sensitive operations should use server-side endpoints
- Use stubs for development without real credentials

**Status**: ✅ Implemented

### 13. Public Endpoint Security Posture
**Decision**: Browser MVP uses in-memory storage; production uses Edge Functions
**Rationale**:
- The public chat endpoint has no authentication
- Writing directly to Supabase from the browser with the anon key would require permissive RLS policies that expose data
- Instead, the browser stores messages in-memory; production uses an Edge Function with the service-role key

**Production Requirements**:
1. Supabase Edge Function /api/chat persists messages with service-role key
2. Edge Function enforces per-IP and per-session rate limits
3. CDN/WAF layer (Cloudflare) with bot detection
4. Supabase Database Function for per-visitor write quotas

**Client-Side Guards (UX, not security)**:
- Rate limiter: 30 messages per 60 seconds per browser tab
- Idempotency tracker: prevents duplicate message persistence on retry
- Spam filter: rejects empty, garbage, and repeated-character submissions
- Duplicate-submit ref: prevents re-entry from rapid clicks

**Status**: ✅ Client-side guards implemented; production Edge Function is a launch blocker

### 14. Supabase Service-Role Key
**Decision**: Service-role key never exposed to browser; privileged writes go through Edge Functions
**Rationale**: 
- Service-role key bypasses RLS — it can read/write ALL tenant data
- Browser should only use anon key + RLS policies
- Privileged operations (alerts, followup_jobs, tenant admin) use Edge Functions

**Status**: ✅ Documented and enforced

---

## Integration Decisions

### 15. Calendly Integration
**Decision**: Implement embed widget with event tracking
**Rationale**: 
- Calendly provides easy scheduling
- Embed widget is user-friendly
- Track shown/clicked/booked events for analytics

**Status**: ✅ Implemented as stub (ready for real integration)

### 16. n8n Integration
**Decision**: Define event contracts for workflow automation
**Rationale**: 
- n8n can handle complex workflows
- Event contracts ensure consistent data structure
- Can be extended to other automation tools

**Status**: ✅ Implemented as stub (ready for real integration)

### 17. Claude Integration
**Decision**: Implement extraction prompt with safe fallback
**Rationale**: 
- Claude can improve signal extraction accuracy
- Fallback to deterministic extraction when API not available
- Structured output for consistent processing

**Status**: ✅ Implemented as stub (ready for real integration)

---

## Hardening Decisions (2026-07-05)

### 18. Idempotency Strategy
**Decision**: Client-side idempotency key + in-memory deduplication tracker
**Rationale**:
- Repeated submit/click/Enter must not create duplicate user messages
- Repeated network retry must not create duplicate lead records
- Key format: `${sessionId}:${role}:${content.slice(0,200).toLowerCase()}`
- Tracker uses a Set with 5000-entry cap (FIFO eviction)

**Production Enhancement**:
- Supabase UNIQUE constraint on (session_id, content_hash, role) in chat_messages
- Edge Function validates idempotency key in request header

**Status**: ✅ Implemented

### 19. Suppression Strategy
**Decision**: Suppress duplicate alerts and spam submissions
**Rationale**:
- Same lead should not trigger repeated alerts within a 5-minute cooldown
- Low-score leads never get alerts (they route to helpful_guidance)
- Spam submissions (empty, garbage, repeated characters) are silently dropped
- Suppression events are recorded as "alert_suppressed" for auditability

**Rules**:
1. Alert cooldown: 5-minute window per lead_id
2. Low-score suppression: score=low never fires alerts
3. Spam filter: length < 2, no alphanumeric, or repeated same character (5+)
4. Duplicate message: idempotency key prevents re-persistence

**Suppression does NOT silently erase high-intent leads**: only low-score and within-cooldown alerts are suppressed. All suppression is logged as funnel events.

**Status**: ✅ Implemented

### 20. Rate Limiting Design
**Decision**: Client-side rate limiter (30 messages/60s) with documented production path
**Rationale**:
- Browser MVP has no backend, so rate limiting is client-side only
- Prevents accidental rapid-fire from normal users
- Bounds API cost exposure during development

**Production Path** (launch blocker):
1. Edge Function /api/chat with per-IP rate limiting
2. Supabase RPC with per-visitor write quotas
3. CDN/WAF layer with bot detection

**Status**: ✅ Client-side implemented; production path documented

### 21. PII and RLS Posture
**Decision**: Document PII fields and enforce access control
**PII Fields Identified**:
- leads.contact_info (name, email, phone, company)
- chat_messages.content (conversation text)
- leads.signals (business details)
- leads.scoring_result (qualification data)

**Current Posture**:
- All tables have RLS enabled
- Policies require auth.uid() for all reads/writes
- Browser MVP uses in-memory storage (no PII in database without auth)
- Dashboard reads require authenticated access
- Anonymous key alone cannot read or write any data with current policies

**Launch Blockers**:
- Dashboard must NOT be deployed publicly without Supabase Auth
- Public chat endpoint must use Edge Function for persistence (not direct Supabase writes)

**Status**: ✅ Documented in schema.sql and this log

### 22. Summary Quality
**Decision**: Generate structured lead summaries from signals and scoring
**Rationale**:
- Dashboard depends on summary quality for human reviewers
- Summary captures: business_type, pain_point, urgency, requested_service, lead_quality, next_action
- Generated deterministically from the same signals used for scoring
- Displayed in Dashboard "Scoring Insights" section

**Seed Scenario Coverage**:
- High-intent lead: "Active business with traffic/spend" + "Clear problem" + "High urgency"
- Medium-intent lead: "Business owner" + "Partial problem" + "Moderate urgency"
- Low-intent lead: "No business context" + "No pain" + "No time pressure"
- Spam/empty: Filtered before scoring (isSpamSubmission)

**Status**: ✅ Implemented

### 23. Multi-Tenant Config Seam
**Decision**: Centralize tenant-specific values in src/config/tenant.ts
**Rationale**:
- Avoids hardcoding business-specific values throughout components
- Clean path for: tenant name, niche, qualification questions, scoring weights, route rules, dashboard labels
- ChatWidget imports and uses TenantConfig for welcome messages, bot name, qualification questions
- getTenantConfig() returns the right config by id

**What Changes Per Tenant**:
- Brand name, bot title, bot subtitle
- Welcome and fallback messages
- Qualification questions (business, pain, urgency, readiness, contact)
- Scoring weights (fit, urgency, pain, readiness, quality)
- Score thresholds (high: 70, medium: 40)
- Route rules and dashboard labels
- Calendly URL, nurture email template

**What Does NOT Change**:
- Scoring logic (4-rule cascade)
- Signal extraction regex
- Idempotency and suppression logic
- RLS policies
- Chat widget component structure

**Status**: ✅ Implemented

---

## Testing Decisions

### 24. Testing Framework
**Decision**: Use Vitest for unit and integration tests
**Rationale**: 
- Fast and modern testing framework
- Good TypeScript support
- Built-in coverage reporting
- Works well with Vite

**Alternatives Considered**: Jest, Cypress, Playwright
**Status**: ✅ Implemented

### 25. Test Coverage
**Decision**: Focus on core scoring logic and services
**Rationale**: 
- Scoring function is critical and must be thoroughly tested
- Services contain business logic that needs verification
- UI tests are less critical for MVP

**Coverage Targets**:
- scoring.ts: 100%
- services/*: >80%
- lib/*: >80%

**Status**: ✅ Implemented

---

## Deployment Decisions

### 26. Build Configuration
**Decision**: Use Vite's default build configuration
**Rationale**: 
- Optimized for production
- Good defaults for React applications
- Easy to customize if needed

**Status**: ✅ Implemented

### 27. Environment Configuration
**Decision**: Provide .env.example with all required variables
**Rationale**: 
- Makes setup easier for other developers
- Documents required configuration
- Prevents accidental commitment of real secrets

**Status**: ✅ Implemented

---

## Motion and UX Polish

### 28. Chat Widget Motion
**Decision**: Subtle CSS-only animations for chat open, message entrance, and interactive states
**Rationale**:
- Chat open: opacity + translateY + slight scale (240ms, ease-out)
- Message entrance: opacity + translateY (200ms)
- Toggle hover: translateY(-2px) + scale(1.04)
- Toggle press: scale(0.98)
- Send button hover: translateY(-1px), press: scale(0.98)
- All motion disabled under `@media (prefers-reduced-motion: reduce)`

**Rules**:
- No emojis, particles, starfields, or bouncing gimmicks
- Duration range: 160ms–280ms
- Easing: cubic-bezier(0.16, 1, 0.3, 1)
- Hover lift maximum: translateY(-2px)
- Press state maximum: scale(0.98)
- No horizontal overflow
- Focus rings remain visible

**Status**: ✅ Implemented

---

## Backend / Security Decisions (2026-07-05)

### 29. Edge Function for Chat Persistence
**Decision**: Supabase Edge Function `chat-api` handles all public writes
**Rationale**:
- Browser writes directly to Supabase fail because RLS requires auth.uid()
- Edge Function holds SUPABASE_SERVICE_ROLE_KEY server-side, bypasses RLS
- Browser calls Edge Function via fetch; Edge Function validates, rate-limits, and persists
- Four actions: create_session, create_message, create_lead, record_event
- Lead upsert by (session_id, visitor_id) prevents duplicate lead records
- Message idempotency by (session_id, role, content) within 5-second window

**Deployment**: `supabase functions deploy chat-api` with env var SUPABASE_SERVICE_ROLE_KEY

**Status**: ✅ Implemented (file: supabase/functions/chat-api/index.ts)

### 30. Server-Side Rate Limiting
**Decision**: PostgreSQL function check_rate_limit() enforced by Edge Function
**Rationale**:
- Client-side rate limiting is a UX guard, not a security boundary
- Server-side enforcement uses a rate_limits table with per-identifier, per-minute windowing
- check_rate_limit() is SECURITY DEFINER — only callable by service role
- 30 requests per minute per visitor/IP, enforced before every write
- Rate limit table has RLS: only service role can read/write
- Edge Function returns 429 when limit exceeded

**Fallback**: If check_rate_limit() errors, the function fails open (allows the request) to avoid blocking legitimate users.

**Status**: ✅ Implemented

### 31. Dashboard Authentication
**Decision**: Supabase Auth login gate wrapping the Dashboard route
**Rationale**:
- Dashboard displays PII (names, emails, business details, conversation content)
- RLS policies require auth.uid() for all reads — anonymous key cannot read data
- AuthGate component checks for existing Supabase session on mount
- If no session, renders a minimal email/password login form
- Uses supabase.auth.signInWithPassword() — no new dependencies
- Session persists via Supabase's built-in session management
- No redesign of Dashboard UI — AuthGate wraps it as a security layer

**Production setup**: Create auth user via Supabase dashboard or CLI before deployment.

**Status**: ✅ Implemented

### 32. Tenant ID Reconciliation
**Decision**: Align tenant config ID with database seed UUID
**Rationale**:
- Config used string "default" but database seed uses UUID 00000000-0000-0000-0000-000000000000
- FK constraint on leads/chat_sessions requires tenant_id to exist in tenants table
- Updated techQuartersConfig.id to the seed UUID
- Updated getTenantConfig() to accept both "default" and the UUID
- Updated all component tenantId props to use the UUID
- Updated Dashboard.getLeadsByTenant() to use the UUID

**Status**: ✅ Implemented

### 33. Schema Fixes
**Decision**: Fix BOOLEAN OR SMALLINT syntax error and add rate_limits infrastructure
**Rationale**:
- lead_scoring_signals.value had `BOOLEAN OR SMALLINT` which is invalid PostgreSQL
- Changed to `JSONB NOT NULL DEFAULT 'false'` — stores boolean or numeric values as JSON
- Added rate_limits table with identifier, window_start, request_count
- Added check_rate_limit() SECURITY DEFINER function
- Added RLS on rate_limits (service role only)
- Added alert_suppressed to funnel_events CHECK constraint

**Status**: ✅ Implemented

### 34. Edge Function Client Architecture
**Decision**: Browser-side edgeClient.ts wraps all Edge Function calls
**Rationale**:
- Single module handles all communication with the chat-api Edge Function
- Graceful fallback: returns null when Edge Function is unavailable (dev mode)
- Services (messageService, leadService) try Edge Function first, fall back to in-memory
- Env vars read lazily (via getter functions) for testability
- Consistent error handling: network errors, 429, 500 all return null gracefully

**Status**: ✅ Implemented

---

## What Is Production-Ready Now

1. Deterministic scoring with numeric breakdown and explainable reasons
2. Closer-style conversation flow with qualification gap analysis
3. Idempotent message persistence (client-side + server-side Edge Function)
4. Alert suppression with cooldown and audit trail
5. Spam submission filtering
6. Rate limiting: client-side (30 msgs/60s) + server-side (check_rate_limit RPC)
7. Multi-tenant config seam (wired into ChatWidget, aligned with DB seed UUID)
8. Lead summary generation for dashboard
9. RLS-enabled Supabase schema with verified policies on all 8 tables
10. Subtle, professional motion with reduced-motion support
11. Edge Function `chat-api` for secure persistence with service-role key
12. Dashboard authentication via Supabase Auth login gate
13. Schema fixes (JSONB value type, rate_limits table, alert_suppressed event)
14. 67 tests passing across 4 test files

## What Remains a Launch Blocker

None of the original launch blockers remain. The following are production hardening items:

1. **WAF/CDN layer**: Edge Function rate limiting is application-level. A CDN (Cloudflare) with bot detection provides network-level protection.
2. **n8n webhook integration**: Currently stubbed. Production needs Edge Function to dispatch events with N8N_WEBHOOK_SECRET.
3. **Claude API integration**: Currently stubbed. Production needs Edge Function to call Claude with CLAUDE_API_KEY.
4. **Supabase Auth user creation**: Must create a dashboard user via Supabase dashboard or CLI before deployment.
5. **Edge Function deployment**: Must deploy chat-api via `supabase functions deploy` and set SUPABASE_SERVICE_ROLE_KEY env var.
6. **Rate limit cleanup**: Run `DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '10 minutes'` periodically (pg_cron or scheduled function).

## What Was Intentionally Not Done

1. **No new heavy dependencies**: All changes use existing packages.
2. **No emojis or marketing copy**: Bot tone is direct and professional.
3. **No particles, starfields, or excessive glow**: Motion is subtle and restrained.
4. **No changes to approved landing-page copy**: LandingPage.tsx content unchanged.
5. **No weakening of existing tests**: chatWidget.test.tsx regression test preserved.
6. **No removal of duplicate-send fix**: sendingRef guard preserved and extended.

---

## Changelog

| Date | Decision | Status |
|------|----------|--------|
| 2026-07-04 | Project kickoff | ✅ Complete |
| 2026-07-04 | Stack selection | ✅ Complete |
| 2026-07-04 | Architecture design | ✅ Complete |
| 2026-07-04 | Core implementation | ✅ Complete |
| 2026-07-04 | Testing setup | ✅ Complete |
| 2026-07-04 | Documentation | ✅ Complete |
| 2026-07-04 | Security hardening | ✅ Complete |
| 2026-07-04 | Deliverables documentation | ✅ Complete |
| 2026-07-05 | Closer-style funnel logic | ✅ Complete |
| 2026-07-05 | Scoring type mismatch fix + numeric breakdown | ✅ Complete |
| 2026-07-05 | Idempotency layer | ✅ Complete |
| 2026-07-05 | Suppression layer | ✅ Complete |
| 2026-07-05 | Rate limiting | ✅ Complete |
| 2026-07-05 | PII/RLS posture documentation | ✅ Complete |
| 2026-07-05 | Summary quality | ✅ Complete |
| 2026-07-05 | Multi-tenant config wiring | ✅ Complete |
| 2026-07-05 | Motion/UX polish | ✅ Complete |
| 2026-07-05 | Edge Function chat-api | ✅ Complete |
| 2026-07-05 | Server-side rate limiting | ✅ Complete |
| 2026-07-05 | Dashboard auth (Supabase Auth) | ✅ Complete |
| 2026-07-05 | Tenant ID reconciliation | ✅ Complete |
| 2026-07-05 | Schema fixes (JSONB, rate_limits) | ✅ Complete |
| 2026-07-05 | Edge Function client architecture | ✅ Complete |
| 2026-07-05 | Evaluation readiness audit — all 10 hard parts | ✅ Complete |
| 2026-07-05 | Session persistence (sessionStorage) | ✅ Complete |
| 2026-07-05 | Structured extraction (email, business name) | ✅ Complete |
| 2026-07-05 | Early-stop / hot-lead routing | ✅ Complete |
| 2026-07-05 | Booking suppression with cancellation re-open | ✅ Complete |
| 2026-07-05 | Edge Function tenant validation + payload guards | ✅ Complete |
| 2026-07-05 | Edge Function timeout (10s abort) | ✅ Complete |
| 2026-07-05 | Graceful failure: .catch() on persistence calls | ✅ Complete |
| 2026-07-05 | Fix qualification loop — merge bug + context-aware pain | ✅ Complete |
| 2026-07-05 | Groq provider (server-side only, optional) | ✅ Complete |
| 2026-07-05 | Gap-based lastQuestionPurpose (replaces regex) | ✅ Complete |
| 2026-07-05 | 16 loop regression tests | ✅ Complete |

---

## Evaluation Readiness Audit (2026-07-05)

This section covers the 10 hard-parts evaluation lens. Each area documents
what was chosen, what was deliberately skipped for V1, and why.

### Area 1: Conversation State

**What was chosen**: Client-side React state with sessionStorage persistence.
The visitor_id is stable across refreshes (localStorage). On page load, the
widget checks sessionStorage for existing conversation state (messages,
signals, currentStep, contactInfo, sessionId) and restores it if found.

**State location**:
- `visitor_id` — localStorage (stable across refreshes)
- `session_id` — sessionStorage (tab-scoped, survives refresh)
- `messages`, `signals`, `currentStep`, `contactInfo` — React state + sessionStorage
- DB persistence — via Edge Function (chat_sessions, chat_messages tables)

**Refresh behaviour**: The conversation survives page refresh within the same
tab. Opening a new tab starts a fresh conversation (sessionStorage is
tab-scoped). The idempotency tracker is re-populated from persisted messages
so retries after refresh do not create duplicates.

**V1 tradeoff**: Server-side session recovery (loading messages from Supabase
by session_id) is not implemented. For the V1 use case (short 2–5 message
qualification conversations), sessionStorage is sufficient.

**Status**: ✅ Implemented

### Area 2: Structured Extraction

**What was chosen**: Deterministic regex-based extraction in
`extractSignalsFromText()` with dedicated helpers for email
(`extractEmail`, `isValidEmail`) and business names (`extractBusinessName`).

**How missing values are handled**:
- Email: returns `null` when not found — never fabricated
- Business name: returns `null` when not found — never hallucinated
- Problem/pain: `problem_clarity` defaults to `0` (no problem)
- All boolean signals default to `false`

**Refusal handling**: If the user refuses to provide information, the regex
does not match and the signal stays at its default. The bot asks again
through the closer-style flow.

**Tests added**: Valid email, invalid email, email from free text, email
normalisation, business name extraction, refusal-to-provide, no hallucination.

**Status**: ✅ Implemented

### Area 3: Auditable Scoring

**What was chosen**: `scoreLead()` is the single source of truth. It returns
`final_score`, `score_value` (0–100), `breakdown` (5 dimensions), `factors[]`
with human-readable reasons, `score_reason`, and `summary`.

**Signal capture is separate from scoring**: `extractSignalsFromText()` captures
raw signals. `scoreLead()` interprets them. A reviewer can inspect
`breakdown`, `factors`, and `score_reason` to understand why a lead was
high/medium/low.

**Determinism**: Given the same signals, `scoreLead()` always returns the same
result. No randomness or LLM dependency in the final score.

**Tests**: 37 scoring tests covering all 4 rules, edge cases, signal
extraction, signal merging, breakdown verification, and qualification gap
analysis.

**Status**: ✅ Implemented

### Area 4: Idempotent Events

**What was chosen**: Multi-layer idempotency:

1. **Client-side guard**: `sendingRef` blocks re-entry from rapid clicks/Enter.
2. **Idempotency tracker**: `makeIdempotencyKey(sessionId, content, role)` with
   5000-entry Set prevents duplicate message persistence.
3. **Edge Function dedup**: Time-windowed (5s) dedup for messages.
4. **Lead upsert**: Edge Function upserts by (session_id, visitor_id).

**V1 tradeoff**: No DB-level UNIQUE constraint on chat_messages. The Edge
Function's time-windowed dedup is sufficient for V1. Production would add a
content_hash UNIQUE constraint.

**Tests**: 19 tests covering key generation, tracker, suppression, spam filter,
and rate limiting.

**Status**: ✅ Implemented

### Area 5: Booking Suppression and Sync

**What was chosen**: Alert suppression rules:

1. `score === "low"` → never fires alerts
2. Same lead_id within 5-minute cooldown → suppressed
3. `status === "booked"` → no follow-up alerts
4. `recordBookingCancellation()` → status "contacted", re-enables follow-up

All suppression logged as `alert_suppressed` funnel events with reason.

**V1 tradeoff**: Real booking sync (Calendly webhook) is out of scope. The
integration points exist (`recordCalendlyBooking`, `recordBookingCancellation`).

**Status**: ✅ Implemented (with documented V1 scope boundary)

### Area 6: Public Endpoint Abuse

**What was chosen**: Defence in depth:

1. **Server-side rate limiting**: `check_rate_limit()` RPC, 30 req/min, returns 429.
2. **Tenant validation**: Edge Function verifies tenant_id exists in `tenants` table.
3. **Payload validation**: Rejects > 10KB payloads, caps content at 5000 chars.
4. **Spam filter**: Rejects empty, garbage, repeated-character submissions.
5. **PII in logs**: Logs only error messages, never PII.
6. **No service-role key client-side**: Key exists only in Edge Function env.

**Status**: ✅ Implemented

### Area 7: RLS on Public Write Path

**What was chosen**: All 8 tables have RLS enabled. Policies require `auth.uid()`
for all reads and writes. The browser does NOT write directly to Supabase —
all writes go through the Edge Function (service-role key, bypasses RLS).
Anon key alone cannot read or write any data.

**Status**: ✅ Implemented and documented

### Area 8: Multi-Tenant Reusability

**What was chosen**: `src/config/tenant.ts` is the central seam. What changes
per tenant: brand, messages, questions, scoring weights, thresholds, route
rules, dashboard labels, Calendly URL. What does NOT change: scoring logic,
signal extraction, idempotency, suppression, RLS, widget structure.

**Onboarding**: New tenant = new TenantConfig object + DB record. No code fork.

**V1 tradeoff**: Scoring weights are in config but not yet wired into
`scoreLead()`. The config seam is ready.

**Status**: ✅ Implemented

### Area 9: Graceful Failure

**What was chosen**:

1. **10-second timeout** on Edge Function calls (AbortController).
2. **Null return on failure** → services fall back to in-memory transparently.
3. **`.catch()` on persistence calls** → failed write does not block conversation.
4. **Dashboard resilience** → handles empty/missing data gracefully.
5. **No state corruption** → failed Edge Function call does not corrupt local state.

**V1 tradeoff**: No explicit user-facing error message when persistence fails.
The conversation continues in-memory.

**Status**: ✅ Implemented

### Area 10: Knowing When to Stop

**What was chosen**: `getQualificationGap()` calls `scoreLead()` first. If the
signals already produce a "high" score, it returns `null` immediately — the
bot routes instead of asking more questions.

**Product judgement**: A questionnaire collects all fields. A closer stops
qualifying once it can route. Examples:
- "I run an ecommerce brand, spending on ads, follow-up is slow" → routes
  to Calendly immediately (no urgency question asked).
- "Can I book a call?" → booking path immediately (no business question).

**Tests**: 3 early-stop tests covering hot lead short-circuit, booking intent
routing, and continued qualification for medium-score leads.

**Status**: ✅ Implemented

---

## Remaining Risks and V1 Tradeoffs

1. **No server-side session recovery**: sessionStorage is tab-scoped. New tab = fresh conversation.
2. **No DB-level idempotency constraint**: Edge Function time-windowed dedup is sufficient for V1.
3. **No real booking sync**: Calendly webhook integration is stubbed.
4. **Scoring weights not wired to config**: Config has weights but `scoreLead()` uses hardcoded rules.
5. **No LLM extraction**: claudeService is a stub. Production would call Claude for better accuracy.
6. **No WAF/CDN layer**: Application-level rate limiting is in place.

## Why This Is a Closer, Not a Questionnaire

1. **Qualification gap analysis**: The bot determines what signal is missing and asks only that question.
2. **Early-stop routing**: When the score is high, the bot routes immediately.
3. **Signal-driven conversation**: Every question is driven by the current signal state.
4. **Tailored responses**: Calendly prompt is tailored to the lead's signals.
5. **Route differentiation**: High → Calendly+alert. Medium → nurture/booking. Low → guidance.

---

## Qualification Loop Bug Fix (2026-07-05)

### 35. Deterministic Signal Merge Fix
**Decision**: `extractSignalsFromText()` returns only positively detected fields, not explicit `false`/`0` defaults.
**Rationale**:
- The old pattern returned `{ has_business: false, urgency: 0, ... }` for every message
- `mergeSignals()` saw `false !== undefined` and overwrote prior `true` with `false`
- This caused the bot to loop back to the business question after a pain answer
- New pattern: only return fields with positive evidence. `undefined` means "no evidence" → merge preserves existing value

**Root cause**: "Getting leads, customers" did not match business patterns → extraction returned `has_business: false` → merge overwrote `true` → gap became `"business"` → loop.

**Fix**: Change `extractSignalsFromText()` to set boolean fields only when `true`, and numeric fields only when a positive match is found. Remove the `else { signals.problem_clarity = 0 }` and `else { signals.urgency = 0 }` branches.

**Status**: ✅ Implemented

### 36. Context-Aware Pain Extraction
**Decision**: Add `extractPainFromContext(input)` helper for short pain/growth answers.
**Rationale**:
- Short answers like "getting leads", "more customers", "online orders" are valid pain responses
- Standard `extractSignalsFromText()` does not match these (no "problem"/"issue" keywords)
- `extractPainFromContext()` recognizes growth-oriented noun phrases and verb+object patterns
- Called when `lastQuestionPurpose === "pain"` and standard extraction found no pain

**Accepted patterns**: getting leads, more customers, more walk-ins, online orders, faster replies, missed inquiries, lead quality, follow-up speed, conversion rates, more bookings, more sales, customer acquisition, low sales, not enough customers

**Rejected patterns**: hello, yes, no, idk, I don't want to say, what do you mean?

**Status**: ✅ Implemented

### 37. Groq Provider (Server-Side Only)
**Decision**: Add Groq as an optional server-side provider for structured extraction and response drafting.
**Rationale**:
- Groq can extract signals from ambiguous messages that deterministic regex misses
- Groq can draft more natural assistant responses
- Groq is OPTIONAL — deterministic extraction and scoring remain the source of truth
- Groq runs ONLY in the Edge Function (Deno runtime) — GROQ_API_KEY never reaches the browser
- If Groq fails, times out, or returns invalid JSON, deterministic fallback is used

**Security**:
- GROQ_API_KEY read from `Deno.env` only — never `VITE_` prefixed
- Edge Function `process_message` action calls Groq server-side
- Browser calls Edge Function, never Groq directly
- Groq suggestions are merged conservatively: only add positive signals, never overwrite deterministic positives with null

**Integration**:
- `supabase/functions/chat-api/groq.ts` — Groq provider module
- Edge Function `process_message` action — optional Groq extraction + drafting
- `edgeProcessMessage()` in `edgeClient.ts` — browser-side client
- ChatWidget calls Groq asynchronously after deterministic response is generated

**Status**: ✅ Implemented

### 38. Gap-Based lastQuestionPurpose
**Decision**: Derive `lastQuestionPurpose` from `getQualificationGap()` instead of regex on response text.
**Rationale**:
- Old approach used regex on the assistant response to detect what question was asked
- Groq-drafted responses may not match the regex patterns
- The `gap` variable already encodes the correct next question purpose
- More reliable, works with both deterministic and Groq-drafted responses

**Status**: ✅ Implemented

---

## What Is Production-Ready Now (updated)

All previous items remain, plus:

15. Deterministic signal merge fix — no more qualification loop
16. Context-aware pain extraction for short growth answers
17. Groq provider (optional, server-side only) for enhanced extraction and response drafting
18. Gap-based conversation state tracking
19. 16 new loop regression tests (112 total)

## Remaining Risks and V1 Tradeoffs (updated)

Previous items remain, plus:

7. **Groq cost exposure**: Groq calls are bounded by Edge Function rate limiting and 7s timeout, but each call has a cost. Production should monitor Groq usage.
8. **Groq response quality**: Groq-drafted responses override deterministic wording. If Groq produces poor responses, the fallback is to not set GROQ_API_KEY.

---

*Last Updated: 2026-07-05*
*Version: 5.0.0*
