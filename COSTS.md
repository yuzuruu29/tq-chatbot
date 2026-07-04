# COSTS.md — TQ ChatBot #1

## Tools and Software Used

| Tool | Purpose | Free Tier | Paid Tier |
|------|---------|-----------|-----------|
| **Vite** | Build tool and dev server | ✅ Fully free (MIT) | — |
| **React** | UI framework | ✅ Fully free (MIT) | — |
| **TypeScript** | Type safety | ✅ Fully free (Apache 2.0) | — |
| **Supabase** | Database, Auth, Edge Functions | ✅ 500 MB DB, 1 GB storage, 50K MAU | $25/mo Pro |
| **Claude API** | LLM signal extraction | ✅ Free tier (limited) | ~$3/million input tokens |
| **Calendly** | Appointment scheduling | ✅ 1 event type | $10/mo Standard |
| **n8n** | Workflow automation | ✅ Self-hosted free | $20/mo Cloud Starter |
| **Vitest** | Testing framework | ✅ Fully free (MIT) | — |
| **Vercel / Netlify** | Hosting (recommended) | ✅ Free tier | $20/mo Pro |

---

## Low-Cost V1 Estimate (Single Client)

| Item | Monthly Cost | Notes |
|------|-------------|-------|
| Supabase Free Tier | $0 | 500 MB DB, 50K MAU — sufficient for V1 |
| Claude API (Haiku) | ~$2–5 | ~10K conversations/mo at ~500 tokens each |
| Calendly Free | $0 | 1 event type, sufficient for V1 |
| n8n Self-Hosted | $0 | Run on existing server or Railway free tier |
| Vercel Free Tier | $0 | 100 GB bandwidth, sufficient for landing page |
| **Total V1** | **~$2–5/mo** | Main cost is LLM usage |

---

## Main Variable Cost: LLM Usage

The primary variable cost is Claude API usage for signal extraction.

### Cost Breakdown per Conversation

| Step | Tokens (approx) | Cost (Haiku) |
|------|-----------------|--------------|
| System prompt | ~200 | $0.00006 |
| User message | ~100 | $0.00003 |
| Extraction response | ~200 | $0.00012 |
| **Per conversation** | **~500** | **~$0.0002** |

### Scaling Estimates

| Conversations/mo | Claude Cost | Notes |
|------------------|-------------|-------|
| 1,000 | ~$0.20 | Negligible |
| 10,000 | ~$2.00 | Low traffic site |
| 100,000 | ~$20.00 | Medium traffic site |
| 1,000,000 | ~$200.00 | High traffic — consider batching |

### Cost Reduction Strategies

1. **Use deterministic extraction first** — only call Claude when regex confidence is low
2. **Cache common patterns** — store extraction results for similar inputs
3. **Batch processing** — queue extractions and process in batches
4. **Use cheaper models** — Haiku is 10x cheaper than Sonnet for extraction tasks
5. **Rate limiting** — cap conversations per visitor per session

---

## Multi-Client Scaling Costs

| Clients | Supabase | Claude | n8n | Total/mo |
|---------|----------|--------|-----|----------|
| 1 | $0 | $2–5 | $0 | ~$5 |
| 5 | $25 | $10–25 | $0 | ~$50 |
| 10 | $25 | $20–50 | $20 | ~$95 |
| 50 | $75 | $100–250 | $50 | ~$375 |

---

## Summary

- **V1 is nearly free** — Supabase and Vercel free tiers cover single-client usage
- **Main cost is LLM** — Claude API at ~$0.0002 per conversation
- **Deterministic fallback keeps costs at zero** when Claude is not configured
- **Scales linearly** — costs grow proportionally with conversation volume
