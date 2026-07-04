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
**Decision**: Use the provided scoring function with clear rule hierarchy
**Rationale**: 
- Matches the specified requirements exactly
- Rules are ordered by priority (high intent first)
- Each rule has clear, testable conditions

**Rules**:
1. High: has_business + problem_clarity >= 1 + (wants_to_book OR urgency >= 2 OR has_traffic_or_spend)
2. Soft Booking: wants_to_book AND NOT has_business
3. Medium: has_business + problem_clarity >= 1
4. Low: Default case

**Status**: ✅ Implemented

### 6. Signal Extraction
**Decision**: Implement both deterministic pattern matching and LLM stub
**Rationale**: 
- Deterministic extraction works without LLM API
- LLM stub can be extended with real API calls later
- Pattern matching covers common cases reliably

**Status**: ✅ Implemented

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

---

## Security Decisions

### 9. Row Level Security (RLS)
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

### 10. Environment Variables
**Decision**: Use Vite's import.meta.env for client-side environment variables
**Rationale**: 
- Secure way to expose configuration to client
- Variables are replaced at build time
- Sensitive keys should only be used server-side

**Variables**:
- VITE_SUPABASE_URL: Supabase project URL
- VITE_SUPABASE_ANON_KEY: Supabase anonymous key
- VITE_CLAUDE_API_KEY: Claude API key (for LLM extraction)
- VITE_CALENDLY_URL: Calendly embed URL
- VITE_N8N_API_KEY: n8n API key
- VITE_N8N_BASE_URL: n8n base URL

**Status**: ✅ Implemented

### 11. API Key Handling
**Decision**: Never expose sensitive API keys client-side
**Rationale**: 
- Client-side code can be inspected by anyone
- Sensitive operations should use server-side endpoints
- Use stubs for development without real credentials

**Status**: ✅ Implemented

---

## Integration Decisions

### 12. Calendly Integration
**Decision**: Implement embed widget with event tracking
**Rationale**: 
- Calendly provides easy scheduling
- Embed widget is user-friendly
- Track shown/clicked/booked events for analytics

**Status**: ✅ Implemented as stub (ready for real integration)

### 13. n8n Integration
**Decision**: Define event contracts for workflow automation
**Rationale**: 
- n8n can handle complex workflows
- Event contracts ensure consistent data structure
- Can be extended to other automation tools

**Status**: ✅ Implemented as stub (ready for real integration)

### 14. Claude Integration
**Decision**: Implement extraction prompt with safe fallback
**Rationale**: 
- Claude can improve signal extraction accuracy
- Fallback to deterministic extraction when API not available
- Structured output for consistent processing

**Status**: ✅ Implemented as stub (ready for real integration)

---

## Testing Decisions

### 15. Testing Framework
**Decision**: Use Vitest for unit and integration tests
**Rationale**: 
- Fast and modern testing framework
- Good TypeScript support
- Built-in coverage reporting
- Works well with Vite

**Alternatives Considered**: Jest, Cypress, Playwright
**Status**: ✅ Implemented

### 16. Test Coverage
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

### 17. Build Configuration
**Decision**: Use Vite's default build configuration
**Rationale**: 
- Optimized for production
- Good defaults for React applications
- Easy to customize if needed

**Status**: ✅ Implemented

### 18. Environment Configuration
**Decision**: Provide .env.example with all required variables
**Rationale**: 
- Makes setup easier for other developers
- Documents required configuration
- Prevents accidental commitment of real secrets

**Status**: ✅ Implemented

---

## Future Considerations

### 19. Scalability
- Consider adding caching for frequently accessed data
- Evaluate database indexing for performance
- Monitor and optimize query performance

### 20. Internationalization
- Add support for multiple languages
- Localize chat messages and UI
- Handle different date/time formats

### 21. Advanced Analytics
- Add more detailed funnel analytics
- Implement cohort analysis
- Add A/B testing capabilities

### 22. Machine Learning
- Use historical data to improve scoring
- Implement anomaly detection
- Add predictive lead scoring

---

## Security Hardening Decisions

### 23. Environment Variable Security
**Decision**: Separate client-safe (VITE_) from server-only env vars
**Rationale**: 
- Vite exposes any VITE_ prefixed variable to the browser bundle
- API keys, webhook secrets, and service-role keys must NEVER be client-exposed
- Claude, n8n, and Supabase service-role operations must go through Edge Functions

**Client-safe (VITE_):**
- `VITE_SUPABASE_URL` — project URL
- `VITE_SUPABASE_ANON_KEY` — anonymous key (RLS-protected)
- `VITE_CALENDLY_URL` — embed URL

**Server-only (no prefix):**
- `CLAUDE_API_KEY` — Edge Function secret
- `N8N_WEBHOOK_URL` — Edge Function secret
- `N8N_WEBHOOK_SECRET` — Edge Function secret
- `SUPABASE_SERVICE_ROLE_KEY` — Edge Function secret

**Status**: ✅ Implemented and hardened

### 24. Claude Service Security Model
**Decision**: Browser never holds Claude API key; extraction calls go through Edge Function
**Rationale**: 
- API key in browser = anyone can steal and abuse it
- Edge Function holds key server-side, validates requests, returns structured response
- Browser MVP uses deterministic regex as safe fallback (no API key needed)

**Production flow:**
1. Browser → POST /api/extract-signals (Supabase Edge Function)
2. Edge Function → Claude API with CLAUDE_API_KEY
3. Edge Function → returns structured JSON signals

**Status**: ✅ Implemented (stub ready for Edge Function deployment)

### 25. n8n Service Security Model
**Decision**: Browser never holds n8n webhook URL or secret; events go through Edge Function
**Rationale**: 
- Webhook URL in browser = anyone can spam your n8n workflows
- Edge Function holds webhook URL and secret, validates requests, forwards events
- Browser MVP logs events to console as safe fallback

**Production flow:**
1. Browser → POST /api/n8n-dispatch (Supabase Edge Function)
2. Edge Function → validates N8N_WEBHOOK_SECRET
3. Edge Function → forwards event to n8n webhook

**Status**: ✅ Implemented (stub ready for Edge Function deployment)

### 26. Supabase Service-Role Key
**Decision**: Service-role key never exposed to browser; privileged writes go through Edge Functions
**Rationale**: 
- Service-role key bypasses RLS — it can read/write ALL tenant data
- Browser should only use anon key + RLS policies
- Privileged operations (alerts, followup_jobs, tenant admin) use Edge Functions

**Status**: ✅ Documented and enforced

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

---

## Open Questions

1. **Rate Limiting**: Should we implement rate limiting for the chat widget?
2. **Session Timeout**: What should be the session timeout duration?
3. **Data Retention**: How long should we retain chat data?
4. **GDPR Compliance**: What additional measures are needed for GDPR compliance?
5. **Accessibility**: Should we add more accessibility features to the chat widget?

---

*Last Updated: 2026-07-04*
*Version: 1.0.0*
