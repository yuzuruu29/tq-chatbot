import React, { useState } from "react";
import ChatWidget from "./ChatWidget";
import type { Lead } from "../types";

const IconTarget = () => (
  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
);
const IconShield = () => (
  <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);
const IconClipboard = () => (
  <svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
);
const IconLayers = () => (
  <svg viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
);
const IconArrowRight = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
);

export const LandingPage: React.FC = () => {
  const [showChat, setShowChat] = useState(false);

  const handleLeadCreated = (_lead: Lead) => {};

  const toggleChat = () => setShowChat(!showChat);

  const features = [
    {
      icon: <IconTarget />,
      color: "blue",
      title: "Qualifies before booking",
      desc: "Only strong-fit leads are routed to the calendar. The rest get the right next step."
    },
    {
      icon: <IconShield />,
      color: "green",
      title: "Scores with rules, not vibes",
      desc: "The LLM can extract signals, but deterministic logic decides the final score."
    },
    {
      icon: <IconClipboard />,
      color: "amber",
      title: "Logs every step",
      desc: "Messages, scoring signals, events, and routing decisions stay auditable."
    },
    {
      icon: <IconLayers />,
      color: "navy",
      title: "Reusable by config",
      desc: "Swap the brand, prompt, questions, labels, and integrations for another client."
    }
  ];

  const benefits = [
    {
      title: "Qualifies before booking",
      desc: "Only strong-fit leads are routed to the calendar. Everyone else gets a useful next step, not a dead end."
    },
    {
      title: "Scores with rules, not vibes",
      desc: "Claude can extract signals from conversation, but deterministic logic decides the final score. Every time."
    },
    {
      title: "Logs every step",
      desc: "Messages, scoring signals, events, and routing decisions are stored and auditable. No black boxes."
    },
    {
      title: "Reusable by config",
      desc: "Swap the brand, prompt, questions, labels, and integrations for another client. Same engine, new deployment."
    }
  ];

  return (
    <div className="tq-landing-page">
      {/* Hero */}
      <section className="tq-hero">
        <div className="tq-container">
          <div className="tq-hero-content">
            <h1>AI funnel qualification, packaged for repeatable client deployments.</h1>
            <p className="tq-hero-subtitle">
              TQ ChatBot qualifies visitors, extracts lead signals, scores intent deterministically, and routes qualified prospects to the right next step.
            </p>
            <div className="tq-hero-buttons">
              <button className="tq-btn-primary" onClick={toggleChat}>
                Open Chat Demo
              </button>
              <a href="/dashboard">
                <button className="tq-btn-secondary">View Dashboard</button>
              </a>
            </div>
            <div className="tq-proof-strip">
              <span className="tq-proof-item"><span className="tq-proof-dot" />Deterministic scoring</span>
              <span className="tq-proof-item"><span className="tq-proof-dot" />Supabase-ready</span>
              <span className="tq-proof-item"><span className="tq-proof-dot" />n8n event contract</span>
              <span className="tq-proof-item"><span className="tq-proof-dot" />Calendly routing</span>
            </div>
          </div>
          <div className="tq-hero-image">
            <div className="tq-pipeline-card">
              <div className="tq-pipeline-header">
                <div className="tq-pipeline-header-icon">
                  <svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                </div>
                <h4>Pipeline Preview</h4>
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
                <div className="tq-lead-preview-row">
                  <span className="tq-lead-preview-label">Lead score</span>
                  <span className="tq-lead-score-chip tq-lead-score-high">High</span>
                </div>
                <div className="tq-lead-preview-row">
                  <span className="tq-lead-preview-label">Route</span>
                  <span className="tq-lead-preview-value">Calendly</span>
                </div>
                <div className="tq-lead-preview-row">
                  <span className="tq-lead-preview-label">Reason</span>
                  <span className="tq-lead-preview-value" style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--tq-text-secondary)" }}>
                    Business + clear problem + urgency
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="tq-features">
        <div className="tq-container">
          <span className="tq-section-label">How it works</span>
          <h2 className="tq-section-title">Built once. Reconfigured per client.</h2>
          <p className="tq-section-desc">
            The LLM handles conversation. The rules decide the score. Every deployment shares the same auditable pipeline.
          </p>
          <div className="tq-features-grid">
            {features.map((f, i) => (
              <div key={i} className="tq-feature">
                <div className={`tq-feature-icon-wrap tq-feature-icon-${f.color}`}>
                  {f.icon}
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="tq-benefits">
        <div className="tq-container">
          <span className="tq-section-label">Why this matters</span>
          <h2 className="tq-section-title">A reusable funnel operator for client sites.</h2>
          <p className="tq-section-desc">
            Qualify visitors, extract buying signals, score intent, and route the right leads to the calendar.
          </p>
          <div className="tq-benefits-grid">
            {benefits.map((b, i) => (
              <div key={i} className="tq-benefit">
                <div className="tq-benefit-num">{i + 1}</div>
                <h3>{b.title}</h3>
                <p>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Chat CTA */}
      <section className="tq-chat-cta">
        <div className="tq-container">
          <div className="tq-chat-cta-card">
            <h2>See the funnel in action</h2>
            <p>Open the chat demo to experience the qualification flow. Ask about a business problem and watch the scoring engine work.</p>
            <button className="tq-btn-primary" onClick={toggleChat}>
              Start a Conversation
            </button>
          </div>
        </div>
      </section>

      {/* Chat Widget */}
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

      {/* Floating Chat Button */}
      {!showChat && (
        <button className="tq-chatbot-toggle" onClick={toggleChat} aria-label="Open chat">
          <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        </button>
      )}
    </div>
  );
};

export default LandingPage;
