# AI_AUTOMATION_MAP.md — TQ ChatBot #1

## Where AI Is Used

### 1. Conversation (LLM-Powered)

**Location:** Chat widget conversation flow

**What it does:** The chatbot engages visitors in a natural conversation to gather qualification signals. It asks contextual follow-up questions based on the visitor's responses.

**How it works:**
- User sends a message
- Conversation engine determines the next question or response
- Response is generated based on the current conversation step and extracted signals

**AI model:** Claude (via Edge Function in production, deterministic stub in MVP)

**Current state:** Browser MVP uses pre-scripted responses. Production would use Claude for dynamic conversation.

---

### 2. Structured Extraction (LLM-Powered)

**Location:** `src/services/claudeService.ts`

**What it does:** Extracts structured signals from natural language user input.

**Input:** Free-text user message
**Output:** JSON object with typed signals

```json
{
  "has_business": true,
  "has_traffic_or_spend": true,
  "problem_clarity": 2,
  "urgency": 1,
  "wants_to_book": false,
  "confidence": 0.92,
  "explanation": "User runs an ecommerce brand spending on ads with a clear follow-up problem"
}
```

**AI model:** Claude Haiku (fast, cheap, sufficient for extraction)

**Current state:** Browser MVP uses deterministic regex patterns. Production calls Edge Function `/api/extract-signals`.

**Fallback:** If Claude is unavailable, the deterministic regex extraction handles common cases with ~80% accuracy.

---

### 3. Summary Generation (LLM-Powered)

**Location:** Dashboard "Scoring Insights" section

**What it does:** Generates human-readable summaries of why a lead was scored a certain way.

**Current state:** Uses the deterministic `score_reason` string from `scoreLead()`. Production could use Claude to generate more nuanced summaries.

---

### 4. Score Proposal (LLM-Assisted)

**Location:** `Signals.model_proposed_score` field

**What it does:** Claude can propose a lead score based on the full conversation context. The final score is always determined by the deterministic `scoreLead()` function, but the LLM's proposal is stored for comparison and auditing.

**Why LLM doesn't make final decisions:** The employer requirement specifies "deterministic, explainable, and auditable" scoring. LLM proposals can be inconsistent; the rule-based engine is the single source of truth.

---

## Where Deterministic Logic Is Used

### 1. Final Scoring

**Location:** `src/lib/scoring.ts` — `scoreLead()` function

**What it does:** Takes extracted signals and applies rule-based scoring:

```
Rule 1: has_business AND problem_clarity >= 1 AND (wants_to_book OR urgency >= 2 OR has_traffic_or_spend)
        → HIGH → calendly → alert

Rule 2: wants_to_book AND NOT has_business
        → MEDIUM → soft_booking → no alert

Rule 3: has_business AND problem_clarity >= 1
        → MEDIUM → nurture → no alert

Rule 4: (default)
        → LOW → helpful_guidance → no alert
```

**Why deterministic:** Every lead with the same signals gets the same score. No randomness, no hallucination, no drift. Fully auditable.

---

### 2. Routing

**Location:** `src/services/leadService.ts` — `routeLead()` method

**What it does:** Routes leads based on the deterministic score:

| Score | Route | Action |
|-------|-------|--------|
| high | calendly | Show Calendly widget + trigger alert |
| medium (soft_booking) | soft_booking | Show Calendly widget, no alert |
| medium (nurture) | nurture | Capture email, start nurture sequence |
| low | helpful_guidance | Show resources, no further action |

---

### 3. Idempotency

**Location:** `src/services/messageService.ts`, `src/services/leadService.ts`

**What it does:** Ensures that duplicate events (e.g., double-click on booking button) don't create duplicate records.

**How:** Each event has a unique ID; duplicate submissions are detected and ignored.

---

### 4. Suppression

**Location:** Followup job management

**What it does:** Prevents over-contacting leads:

- Suppresses follow-up emails if the lead already booked
- Suppresses Calendly widget if already shown in this session
- Suppresses alerts if the lead was already alerted

---

## Where Automation Is Used

### 1. n8n Alerts

**Location:** `src/services/n8nService.ts`

**What it does:** When a high-value lead is detected, an event is dispatched to n8n which:

- Sends a Slack/email alert to the sales team
- Creates a CRM record
- Logs the event for reporting

**Current state:** Browser MVP logs events to console. Production dispatches via Edge Function `/api/n8n-dispatch`.

---

### 2. Booking Sync

**Location:** Calendly integration

**What it does:** When a visitor books a call via the embedded Calendly widget:

- The booking event is recorded in Supabase
- The lead status is updated to "booked"
- A Calendly webhook can trigger n8n to sync with CRM

**Current state:** Browser MVP records booking events. Production listens for Calendly webhooks.

---

### 3. Follow-Up Suppression

**Location:** Followup job management

**What it does:** Manages automated follow-up sequences:

- Nurture emails are scheduled when a medium lead is captured
- Follow-ups are suppressed if the lead books a call
- Follow-ups are suppressed if the lead converts

**Current state:** Browser MVP creates followup_job records. Production triggers n8n workflows to send emails.

---

## Future Improvements

### 1. CRM Updates

**What:** Automatically create/update CRM records (HubSpot, Salesforce, Pipedrive) when leads are scored.

**How:** n8n workflow receives lead event → creates CRM contact → updates pipeline stage.

**Benefit:** Eliminates manual data entry; sales team sees leads in real-time.

---

### 2. Auto Follow-Up Drafts

**What:** Use Claude to generate personalized follow-up email drafts based on the conversation.

**How:** After scoring, send conversation summary to Claude → generate email draft → store in followup_job.

**Benefit:** Personalized follow-ups without manual effort.

---

### 3. Multi-Client Setup Assistant

**What:** A chatbot or form that guides new tenants through the onboarding process.

**How:** Ask questions about their business, Calendly URL, alert preferences → auto-generate tenant config.

**Benefit:** Self-service onboarding without developer involvement.

---

### 4. Conversation Optimization

**What:** Use historical conversation data to optimize question order and phrasing.

**How:** Analyze which question sequences lead to higher-quality leads → adjust conversation flow.

**Benefit:** Higher conversion rates over time.

---

### 5. Sentiment Analysis

**What:** Detect visitor sentiment during the conversation.

**How:** Analyze message tone and word choice → adjust conversation strategy (e.g., if frustrated, offer human handoff).

**Benefit:** Better visitor experience; catch frustration before abandonment.

---

### 6. A/B Testing

**What:** Test different conversation flows, greetings, and qualification questions.

**How:** Route visitors to different variants → measure conversion rates → pick the winner.

**Benefit:** Data-driven optimization of the funnel.
