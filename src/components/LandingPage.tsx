import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import ChatWidget from "./ChatWidget";
import type { Lead } from "../types";

// ─── SVG Icons ────────────────────────────────────────────────
const IconTarget = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
);
const IconShield = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);
const IconClipboard = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
);
const IconLayers = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
);
const IconArrowRight = () => (
  <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
);
const IconChat = () => (
  <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
);
const IconPipeline = () => (
  <svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
);
const IconTag = () => (
  <svg viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
);
const IconSettings = () => (
  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
);
const IconDollar = () => (
  <svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
);
const IconCalendar = () => (
  <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
);
const IconBell = () => (
  <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
);
const IconActivity = () => (
  <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
);

// ─── Scroll Reveal Hook ──────────────────────────────────────
function useScrollReveal() {
  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reveals = document.querySelectorAll("[data-reveal]");

    if (prefersReduced) {
      // No animation — elements stay visible
      reveals.forEach((el) => el.classList.add("revealed"));
      return;
    }

    // Step 1: mark elements as "will-animate" so CSS hides them
    reveals.forEach((el) => el.classList.add("will-reveal"));

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("revealed");
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
      );
      // Step 2: observe each element
      reveals.forEach((el) => io.observe(el));
      return () => io.disconnect();
    } else {
      // Fallback: reveal immediately
      reveals.forEach((el) => el.classList.add("revealed"));
    }
  }, []);
}

// ─── Component ───────────────────────────────────────────────
export const LandingPage: React.FC = () => {
  const [showChat, setShowChat] = useState(false);
  const [leadToast, setLeadToast] = useState<Lead | null>(null);
  useScrollReveal();

  // Listen for external "open chat" requests dispatched from nav/footer.
  useEffect(() => {
    const handler = () => setShowChat(true);
    document.addEventListener("tq:open-chat", handler);
    return () => document.removeEventListener("tq:open-chat", handler);
  }, []);

  const handleLeadCreated = (lead: Lead) => {
    setLeadToast(lead);
    setTimeout(() => setLeadToast(null), 5000);
  };

  // ─── Value cards data ──────────────────────────────────────
  const valueCards = [
    {
      icon: <IconTarget />,
      color: "blue",
      title: "Qualifies before booking",
      desc: "Only strong-fit leads are routed to the calendar. Everyone else gets a useful next step, not a dead end.",
    },
    {
      icon: <IconShield />,
      color: "teal",
      title: "Scores with rules, not vibes",
      desc: "Claude can extract signals from conversation, but deterministic logic decides the final score. Every time.",
    },
    {
      icon: <IconClipboard />,
      color: "amber",
      title: "Logs every decision",
      desc: "Messages, scoring signals, events, and routing decisions are stored and auditable. No black boxes.",
    },
    {
      icon: <IconLayers />,
      color: "green",
      title: "Reusable by config",
      desc: "Swap the brand, prompt, questions, labels, and integrations for another client. Same engine, new deployment.",
    },
  ];

  // ─── Pipeline steps data ───────────────────────────────────
  const pipelineSteps = [
    { num: 1, title: "Visitor starts chat", desc: "Embedded widget opens on any client page" },
    { num: 2, title: "Bot qualifies intent", desc: "Structured questions extract business context" },
    { num: 3, title: "Signals extracted", desc: "Claude parses conversation into structured signals" },
    { num: 4, title: "Deterministic score", desc: "Rules engine assigns High / Medium / Low" },
    { num: 5, title: "Route to Calendly", desc: "Qualified leads get the booking link" },
    { num: 6, title: "Dashboard shows leaks", desc: "Funnel visibility from landing to booking" },
  ];

  // ─── Config items data ─────────────────────────────────────
  const configItems = [
    { icon: <IconTag />, label: "Brand & Logo", value: "per client" },
    { icon: <IconChat />, label: "System Prompt", value: "customizable" },
    { icon: <IconSettings />, label: "Qualification Questions", value: "configurable" },
    { icon: <IconDollar />, label: "Scoring Thresholds", value: "deterministic" },
    { icon: <IconCalendar />, label: "Calendly URL", value: "per client" },
    { icon: <IconBell />, label: "Alert Channel", value: "n8n webhook" },
    { icon: <IconActivity />, label: "Pipeline Labels", value: "custom tags" },
  ];

  // ─── Architecture nodes ────────────────────────────────────
  const archNodes = [
    { title: "Client Website", desc: "Embedded chat widget on any page", highlight: false },
    { title: "Conversation Engine", desc: "Structured qualification flow", highlight: false },
    { title: "Claude Extraction", desc: "LLM parses signals from conversation", highlight: true },
    { title: "Deterministic Scoring", desc: "Rules engine — consistent, explainable", highlight: true },
    { title: "Supabase", desc: "Leads, messages, signals, events", highlight: false },
    { title: "n8n Automation", desc: "Webhooks, alerts, pipeline sync", highlight: false },
    { title: "Calendly / Alerts / Dashboard", desc: "Routing, notifications, funnel visibility", highlight: false },
  ];

  const archSideItems = [
    "Brand & Logo",
    "System Prompt",
    "Qualification Questions",
    "Scoring Thresholds",
    "Calendly URL",
    "Alert Channel",
    "Pipeline Labels",
  ];

  return (
    <div className="tq-landing-page">
      {/* ═══ Hero ═══ */}
      <section className="tq-hero">
        <div className="tq-container">
          <div className="tq-hero-content" data-reveal>
            <div className="tq-hero-badge">
              <span className="tq-hero-badge-dot" />
              Funnel Qualification Engine
            </div>
            <h1>
              AI funnel qualification, packaged for <em>repeatable</em> client deployments.
            </h1>
            <p className="tq-hero-subtitle">
              TQ Funnel ChatBot qualifies visitors, extracts buying signals, scores intent with
              deterministic rules, and routes qualified prospects to the right next step.
            </p>
            <div className="tq-hero-buttons">
              <button className="tq-btn tq-btn-primary" onClick={() => setShowChat(true)}>
                <svg className="tq-btn-icon" viewBox="0 0 24 24"><IconChat /></svg>
                Open Chat Demo
              </button>
              <Link to="/dashboard" className="tq-btn tq-btn-secondary">
                View Dashboard
                <svg className="tq-btn-icon" viewBox="0 0 24 24"><IconArrowRight /></svg>
              </Link>
            </div>
            <div className="tq-proof-strip">
              <span className="tq-proof-item"><span className="tq-proof-dot" />Deterministic scoring</span>
              <span className="tq-proof-item"><span className="tq-proof-dot" />Supabase-ready</span>
              <span className="tq-proof-item"><span className="tq-proof-dot" />n8n event contract</span>
              <span className="tq-proof-item"><span className="tq-proof-dot" />Calendly routing</span>
              <span className="tq-proof-item"><span className="tq-proof-dot" />Reusable by config</span>
            </div>
          </div>

          <div className="tq-hero-image" data-reveal data-reveal-delay="1">
            <div className="tq-pipeline-card">
              <div className="tq-pipeline-header">
                <div className="tq-pipeline-header-icon"><IconPipeline /></div>
                <h4>Pipeline Preview</h4>
                <span className="tq-pipeline-live">Live</span>
              </div>
              <div className="tq-pipeline-steps">
                <div className="tq-pipeline-step">Visitor</div>
                <span className="tq-pipeline-arrow"><IconArrowRight /></span>
                <div className="tq-pipeline-step">Qualification</div>
                <span className="tq-pipeline-arrow"><IconArrowRight /></span>
                <div className="tq-pipeline-step tq-pipeline-step-active">Score</div>
                <span className="tq-pipeline-arrow"><IconArrowRight /></span>
                <div className="tq-pipeline-step">Route</div>
              </div>
              <div className="tq-lead-preview">
                <div className="tq-lead-preview-header">
                  <span className="tq-lead-preview-title">Lead Intelligence</span>
                  <span className="tq-lead-score-chip tq-lead-score-high">High</span>
                </div>
                <div className="tq-lead-rows">
                  <div className="tq-lead-preview-row">
                    <span className="tq-lead-preview-label">Lead Score</span>
                    <span className="tq-lead-preview-value">High — Qualified</span>
                  </div>
                  <div className="tq-lead-preview-row">
                    <span className="tq-lead-preview-label">Route</span>
                    <span className="tq-lead-preview-value">Calendly</span>
                  </div>
                  <div className="tq-lead-reason">
                    Business context confirmed + clear problem statement + time urgency detected
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ System Value ═══ */}
      <section className="tq-features" id="system-value">
        <div className="tq-container">
          <span className="tq-section-label" data-reveal>System Value</span>
          <h2 className="tq-section-title" data-reveal>A reusable funnel operator for client sites.</h2>
          <p className="tq-section-desc" data-reveal>
            Qualify visitors, extract buying signals, score intent, and route the right leads to the
            calendar. The LLM handles conversation. The rules decide the score.
          </p>
          <div className="tq-features-grid">
            {valueCards.map((card, i) => (
              <div key={i} className="tq-feature" data-reveal data-reveal-delay={String(i + 1)}>
                <div className={`tq-feature-icon-wrap tq-feature-icon-${card.color}`}>
                  {card.icon}
                </div>
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ How It Works ═══ */}
      <section className="tq-how-it-works" id="how-it-works">
        <div className="tq-container">
          <span className="tq-section-label" data-reveal>Qualification Pipeline</span>
          <h2 className="tq-section-title" data-reveal>From visitor intent to booked call</h2>
          <p className="tq-section-desc" data-reveal>
            Every step is logged. Every score is explainable. Every routing decision is auditable.
          </p>
          <div className="tq-pipeline-flow" data-reveal>
            {pipelineSteps.map((step, i) => (
              <React.Fragment key={step.num}>
                <div className="tq-pipeline-flow-step">
                  <div className="tq-step-num">{step.num}</div>
                  <h4>{step.title}</h4>
                  <p>{step.desc}</p>
                </div>
                {i < pipelineSteps.length - 1 && (
                  <div className="tq-step-connector"><IconArrowRight /></div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Config Layer ═══ */}
      <section className="tq-config-section" id="config">
        <div className="tq-container">
          <div className="tq-config-inner">
            <div className="tq-config-content" data-reveal>
              <span className="tq-section-label">Client Config Layer</span>
              <h2 className="tq-section-title">Build once. Reconfigure per client.</h2>
              <p className="tq-section-desc">
                Every client deployment shares the same qualification engine. Swap the brand, prompt,
                questions, scoring thresholds, Calendly URL, alert channel, and pipeline labels —
                without touching the core system.
              </p>
              <p className="tq-config-message">
                Same engine. <em>Different client.</em> Zero rework. Same auditable pipeline.
              </p>
            </div>
            <div className="tq-config-panel" data-reveal data-reveal-delay="1">
              <div className="tq-config-panel-title">Client Configuration</div>
              <div className="tq-config-items">
                {configItems.map((item, i) => (
                  <div key={i} className="tq-config-item">
                    <div className="tq-config-item-icon">{item.icon}</div>
                    <span className="tq-config-item-label">{item.label}</span>
                    <span className="tq-config-item-value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Dashboard Preview ═══ */}
      <section className="tq-dashboard-preview-section" id="dashboard">
        <div className="tq-container">
          <div style={{ textAlign: "center" }}>
            <span className="tq-section-label" data-reveal>Funnel Dashboard</span>
            <h2 className="tq-section-title" data-reveal>Where is the funnel leaking?</h2>
            <p className="tq-section-desc" data-reveal>
              Lead qualification, routing, and booking visibility — all in one operational view.
              <span style={{ display: "block", marginTop: 4, fontSize: "var(--tq-text-xs)", color: "var(--tq-text-muted)" }}>
                Showing sample data for illustration
              </span>
            </p>
          </div>
          <div className="tq-dashboard-preview" data-reveal>
            <div className="tq-dash-card">
              <div className="tq-dash-header">
                <div>
                  <div className="tq-dash-title">Funnel Dashboard</div>
                  <div className="tq-dash-subtitle">Lead qualification, routing, and booking visibility</div>
                </div>
                <div className="tq-dash-tabs">
                  <button className="tq-dash-tab tq-dash-tab-active">This Week</button>
                  <button className="tq-dash-tab">This Month</button>
                  <button className="tq-dash-tab">All Time</button>
                </div>
              </div>

              <div className="tq-kpi-grid">
                <div className="tq-kpi-card">
                  <div className="tq-kpi-label">Leads Today</div>
                  <div className="tq-kpi-value">12</div>
                  <div className="tq-kpi-change tq-kpi-up">+18% vs yesterday</div>
                </div>
                <div className="tq-kpi-card">
                  <div className="tq-kpi-label">Qualified</div>
                  <div className="tq-kpi-value">7</div>
                  <div className="tq-kpi-change tq-kpi-up">58% rate</div>
                </div>
                <div className="tq-kpi-card">
                  <div className="tq-kpi-label">Nurture</div>
                  <div className="tq-kpi-value">3</div>
                  <div className="tq-kpi-change" style={{ color: "var(--tq-warning)" }}>25% of total</div>
                </div>
                <div className="tq-kpi-card">
                  <div className="tq-kpi-label">Booked</div>
                  <div className="tq-kpi-value">4</div>
                  <div className="tq-kpi-change tq-kpi-up">57% of qualified</div>
                </div>
              </div>

              <div className="tq-funnel-section">
                <div className="tq-funnel-label">Funnel Steps</div>
                <div className="tq-funnel-steps">
                  {[
                    { value: "48", name: "Landed" },
                    { value: "31", name: "Engaged", drop: "-35% drop" },
                    { value: "18", name: "Qualified", drop: "-42% drop" },
                    { value: "14", name: "Calendly Shown" },
                    { value: "9", name: "Clicked", drop: "-36% drop" },
                    { value: "5", name: "Booked", drop: "-44% drop" },
                  ].map((step, i, arr) => (
                    <React.Fragment key={step.name}>
                      <div className="tq-funnel-step">
                        <div className="tq-funnel-step-value">{step.value}</div>
                        <div className="tq-funnel-step-name">{step.name}</div>
                        {step.drop && <div className="tq-funnel-drop">{step.drop}</div>}
                      </div>
                      {i < arr.length - 1 && <span className="tq-funnel-arrow">→</span>}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div className="tq-preview-table-section">
                <div className="tq-preview-table-header">
                  <span className="tq-preview-table-title">Recent Conversations</span>
                  <a href="/dashboard" className="tq-btn tq-btn-ghost tq-btn-sm">View All →</a>
                </div>
                <div className="tq-preview-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Lead</th>
                        <th>Business</th>
                        <th>Score</th>
                        <th>Route</th>
                        <th>Score Reason</th>
                        <th>Booking</th>
                        <th>Last Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { name: "Sarah Chen", biz: "Horizon Digital", score: "high", route: "Calendly", reason: "Business + clear problem + urgency", booking: "yes", bookingLabel: "Booked", time: "2 min ago" },
                        { name: "Marcus Johnson", biz: "Apex Solutions", score: "high", route: "Calendly", reason: "Budget confirmed + timeline set", booking: "pending", bookingLabel: "Pending", time: "14 min ago" },
                        { name: "Priya Patel", biz: "NovaTech", score: "medium", route: "Nurture", reason: "Interested but no timeline", booking: "no", bookingLabel: "—", time: "1 hr ago" },
                        { name: "James Wilson", biz: "—", score: "low", route: "Low Priority", reason: "Exploring only + no business context", booking: "no", bookingLabel: "—", time: "3 hrs ago" },
                        { name: "Elena Rodriguez", biz: "Meridian Group", score: "high", route: "Calendly", reason: "Decision maker + budget ready", booking: "yes", bookingLabel: "Booked", time: "5 hrs ago" },
                      ].map((row) => (
                        <tr key={row.name}>
                          <td style={{ fontWeight: 600 }}>{row.name}</td>
                          <td>{row.biz}</td>
                          <td><span className={`tq-score-badge-sm tq-score-badge-${row.score}`}>{row.score.charAt(0).toUpperCase() + row.score.slice(1)}</span></td>
                          <td>
                            <span className="tq-route-badge-sm" style={row.score === "medium" ? { background: "var(--tq-warning-bg)", color: "var(--tq-warning)" } : row.score === "low" ? { background: "var(--tq-danger-bg)", color: "var(--tq-danger)" } : undefined}>{row.route}</span>
                          </td>
                          <td style={{ color: "var(--tq-text-secondary)", fontSize: "var(--tq-text-xs)" }}>{row.reason}</td>
                          <td><span className={`tq-booking-badge tq-booking-${row.booking}`}>{row.bookingLabel}</span></td>
                          <td style={{ color: "var(--tq-text-muted)", fontSize: "var(--tq-text-xs)" }}>{row.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Architecture ═══ */}
      <section className="tq-architecture" id="architecture">
        <div className="tq-container">
          <span className="tq-section-label" data-reveal>System Architecture</span>
          <h2 className="tq-section-title" data-reveal>How the pieces fit together</h2>
          <p className="tq-section-desc" data-reveal>
            A modular pipeline where each layer is independently configurable and replaceable. The LLM
            handles conversation and extraction. Final scoring is deterministic.
          </p>
          <div className="tq-arch-layout" data-reveal>
            <div className="tq-arch-flow">
              {archNodes.map((node, i) => (
                <React.Fragment key={node.title}>
                  <div className={`tq-arch-node${node.highlight ? " tq-arch-node-highlight" : ""}`}>
                    <div className="tq-arch-node-title">{node.title}</div>
                    <div className="tq-arch-node-desc">{node.desc}</div>
                  </div>
                  {i < archNodes.length - 1 && <div className="tq-arch-arrow" />}
                </React.Fragment>
              ))}
            </div>
            <div className="tq-arch-side-box" data-reveal data-reveal-delay="1">
              <div className="tq-arch-side-title">Client Config Layer</div>
              <div className="tq-arch-side-items">
                {archSideItems.map((item) => (
                  <div key={item} className="tq-arch-side-item">
                    <span className="tq-arch-side-dot" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="tq-cta-section">
        <div className="tq-container">
          <div className="tq-cta-card" data-reveal>
            <h2>From visitor intent to booked call</h2>
            <p>Every decision logged. Every score explainable. Every deployment reconfigurable. Open the chat demo to see the qualification engine work.</p>
            <div className="tq-cta-buttons">
              <button className="tq-btn tq-btn-primary" onClick={() => setShowChat(true)}>
                <svg className="tq-btn-icon" viewBox="0 0 24 24"><IconChat /></svg>
                Open Chat Demo
              </button>
              <Link to="/dashboard" className="tq-btn tq-btn-secondary tq-cta-btn-secondary">
                View Dashboard
                <svg className="tq-btn-icon" viewBox="0 0 24 24"><IconArrowRight /></svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Chat Widget Overlay ═══ */}
      {showChat && (
        <div className="tq-chatbot-overlay">
          <div className="tq-chatbot-container">
            <ChatWidget
              tenantId="00000000-0000-0000-0000-000000000000"
              onLeadCreated={handleLeadCreated}
              onClose={() => setShowChat(false)}
            />
          </div>
        </div>
      )}

      {/* ═══ Floating Chat Button ═══ */}
      {!showChat && (
        <button className="tq-chatbot-toggle" onClick={() => setShowChat(true)} aria-label="Open chat">
          <IconChat />
          Qualify a lead
        </button>
      )}

      {/* ═══ Lead-created toast ═══ */}
      {leadToast && (
        <div className="tq-lead-toast" role="status">
          <span>Lead captured for {leadToast.contact_info?.name || "a visitor"}</span>
          <Link to="/dashboard" className="tq-lead-toast-link">View in dashboard</Link>
        </div>
      )}
    </div>
  );
};

export default LandingPage;
