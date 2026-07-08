// TQ ChatBot — Chat Widget Component
// Renders the conversational qualification UI. All state and logic lives in
// the useChatEngine hook; this component is a thin presentational layer.

import React from "react";
import type { Lead } from "../types";
import { useChatEngine } from "../hooks/useChatEngine";
import { calendlyService } from "../services/calendlyService";

interface ChatWidgetProps {
  tenantId: string;
  onLeadCreated?: (lead: Lead) => void;
  onClose?: () => void;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ tenantId, onLeadCreated, onClose }) => {
  const {
    messages, isLoading, currentStep, showCalendly, showContactForm, contactInfo,
    inputValue, config, messagesEndRef, inputRef,
    handleSendSubmit, handleContactSubmit, handleInputChange, handleChatInputChange,
    closeCalendly,
  } = useChatEngine(tenantId, onLeadCreated);

  return (
    <div className="tq-chatbot-widget">
      {/* Header (dark) */}
      <div className="tq-chatbot-header">
        <div className="tq-chatbot-header-left">
          <div className="tq-chatbot-header-avatar">TQ</div>
          <div className="tq-chatbot-header-info">
            <h3>{config.botTitle}</h3>
            <p>
              {config.botSubtitle}
              <span className="tq-chatbot-header-badge">Demo mode</span>
            </p>
          </div>
        </div>
        <button className="tq-chatbot-close" onClick={onClose} aria-label="Close chat">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Messages */}
      <div className="tq-chatbot-messages" role="log" aria-live="polite" aria-label="Chat messages">
        {messages.map((message) => (
          <div key={message.id} className={`tq-chatbot-message tq-chatbot-message-${message.role}`}>
            <div className={`tq-msg-avatar ${message.role === "user" ? "tq-msg-avatar-user" : "tq-msg-avatar-bot"}`}>
              {message.role === "user" ? "Y" : "TQ"}
            </div>
            <div>
              <div className="tq-chatbot-message-content">{message.content}</div>
              <div className="tq-chatbot-message-meta">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div className="tq-chatbot-typing">
            <div className="tq-msg-avatar tq-msg-avatar-bot">TQ</div>
            <div className="tq-typing-dots"><span /><span /><span /></div>
          </div>
        )}

        {/* Contact form */}
        {showContactForm && (
          <div className="tq-chatbot-message tq-chatbot-message-assistant">
            <div className="tq-msg-avatar tq-msg-avatar-bot">TQ</div>
            <div>
              <div className="tq-chatbot-message-content">
                <form onSubmit={handleContactSubmit} className="tq-chatbot-contact-form">
                  <h4>{"Let's connect"}</h4>
                  <input type="text" name="name" placeholder="Your name" value={contactInfo.name || ""} onChange={handleInputChange} required />
                  <input type="email" name="email" placeholder="Your email" value={contactInfo.email || ""} onChange={handleInputChange} required />
                  <input type="text" name="company" placeholder="Company (optional)" value={contactInfo.company || ""} onChange={handleInputChange} />
                  <button type="submit" disabled={isLoading}>{isLoading ? "Submitting..." : "Submit"}</button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Calendly embed */}
        {showCalendly && (
          <div className="tq-chatbot-message tq-chatbot-message-assistant">
            <div className="tq-msg-avatar tq-msg-avatar-bot">TQ</div>
            <div>
              <div className="tq-chatbot-message-content">
                <div className="tq-chatbot-calendly">
                  <h4>Book a call</h4>
                  <p>You look like a fit for a quick call. Pick a time that works for you.</p>
                  <div dangerouslySetInnerHTML={{ __html: calendlyService.getEmbedScript("calendly-inline-widget") || "" }} />
                  <button onClick={closeCalendly} className="tq-chatbot-calendly-close">Close</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {currentStep !== "completed" && !showCalendly && !showContactForm && (
        <form className="tq-chatbot-input" onSubmit={handleSendSubmit} aria-label="Send a message">
          <input
            ref={inputRef}
            type="text"
            placeholder="Tell me what you want to improve..."
            value={inputValue}
            onChange={handleChatInputChange}
            disabled={isLoading}
            aria-label="Message"
            autoComplete="off"
          />
          <button type="submit" disabled={isLoading || inputValue.trim().length === 0} aria-label="Send message">
            <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </form>
      )}

      {/* Footer */}
      <div className="tq-chatbot-footer">
        Powered by TQ Funnel ChatBot · Deterministic scoring · Reusable by config
      </div>

      {/* Completed state */}
      {currentStep === "completed" && (
        <div className="tq-chatbot-completed">
          <p>Thanks for the conversation. We will be in touch with your next step.</p>
        </div>
      )}
    </div>
  );
};

export default ChatWidget;
