import React, { useState, useEffect, useRef, useCallback } from "react";
import type { ChatMessage, ChatSession, VisitorContext, Lead } from "../types";
import { messageService } from "../services/messageService";
import { leadService } from "../services/leadService";
import { scoreLead, defaultSignals, extractSignalsFromText, mergeSignals } from "../lib/scoring";
import { calendlyService } from "../services/calendlyService";
import { v4 as uuidv4 } from "uuid";

interface ChatWidgetProps {
  tenantId: string;
  onLeadCreated?: (lead: Lead) => void;
  onClose?: () => void;
}

interface ChatState {
  messages: ChatMessage[];
  session: ChatSession | null;
  context: VisitorContext | null;
  signals: typeof defaultSignals;
  isLoading: boolean;
  currentStep: "greeting" | "qualification" | "contact_capture" | "routing" | "completed";
  contactInfo: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
  };
  showCalendly: boolean;
  showContactForm: boolean;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ tenantId, onLeadCreated, onClose }) => {
  const [state, setState] = useState<ChatState>({
    messages: [],
    session: null,
    context: null,
    signals: { ...defaultSignals },
    isLoading: false,
    currentStep: "greeting",
    contactInfo: {},
    showCalendly: false,
    showContactForm: false
  });

  // Controlled value for the chat input so the form submit path has the
  // canonical source of truth (no DOM reads mixed with React state).
  const [inputValue, setInputValue] = useState("");

  // Synchronous guard against duplicate submits within a single render frame.
  // The async handleSendMessage still relies on isLoading for the disabled UI,
  // but a ref blocks re-entry from rapid clicks/Enter presses that fire before
  // the next state flush.
  const sendingRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initializeSession();
  }, [tenantId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages]);

  useEffect(() => {
    if (state.currentStep !== "completed" && !state.showCalendly && !state.showContactForm) {
      inputRef.current?.focus();
    }
  }, [state.currentStep, state.showCalendly, state.showContactForm]);

  const initializeSession = async () => {
    let visitorId = localStorage.getItem(`tq_visitor_${tenantId}`);
    if (!visitorId) {
      visitorId = uuidv4();
      localStorage.setItem(`tq_visitor_${tenantId}`, visitorId);
    }

    const context: VisitorContext = {
      visitor_id: visitorId,
      session_id: uuidv4(),
      tenant_id: tenantId
    };

    const session = await messageService.createSession(context);

    const welcomeMessage: ChatMessage = {
      id: uuidv4(),
      session_id: session.id,
      content: "Hey, I can help work out whether this is the right system for you. I'll ask a few quick questions, then point you to the best next step.",
      role: "assistant",
      timestamp: new Date().toISOString()
    };

    await messageService.createMessage({
      session_id: session.id,
      content: welcomeMessage.content,
      role: welcomeMessage.role
    });

    setState(prev => ({
      ...prev,
      messages: [welcomeMessage],
      session,
      context,
      currentStep: "qualification"
    }));
  };

  const handleSendMessage = useCallback(async (rawContent: string) => {
    const content = rawContent.trim();
    if (!state.context || !state.session || !content) return;

    // Synchronous re-entry guard. Stays true for the whole async pipeline.
    if (sendingRef.current) return;
    sendingRef.current = true;

    setState(prev => ({ ...prev, isLoading: true }));

    // Stable, locally-generated id. We append optimistically now and never
    // re-append this object again — the server response is only used to
    // append the assistant message.
    const userMessage: ChatMessage = {
      id: uuidv4(),
      session_id: state.session.id,
      content,
      role: "user",
      timestamp: new Date().toISOString()
    };

    await messageService.createMessage({
      session_id: state.session.id,
      content: userMessage.content,
      role: userMessage.role
    });

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage]
    }));

    const extractedSignals = extractSignalsFromText(content);
    const updatedSignals = mergeSignals(state.signals, extractedSignals);

    if (updatedSignals.wants_to_book && !state.contactInfo.email) {
      setState(prev => ({
        ...prev,
        signals: updatedSignals,
        showContactForm: true,
        isLoading: false
      }));
      sendingRef.current = false;
      return;
    }

    const scoringResult = scoreLead(updatedSignals);
    const assistantResponse = generateAssistantResponse(content, updatedSignals, scoringResult);

    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      session_id: state.session.id,
      content: assistantResponse,
      role: "assistant",
      timestamp: new Date().toISOString()
    };

    await messageService.createMessage({
      session_id: state.session.id,
      content: assistantMessage.content,
      role: assistantMessage.role
    });

    // IMPORTANT: the user message was already appended optimistically above.
    // Append only the assistant message here to avoid a duplicate user bubble.
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, assistantMessage],
      signals: updatedSignals,
      isLoading: false
    }));

    if (scoringResult.alert || scoringResult.route === "calendly") {
      await handleLeadCreation(updatedSignals, scoringResult);
    }

    sendingRef.current = false;
  }, [state.context, state.session, state.signals, state.contactInfo]);

  const handleSendSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    // Single submit path: form submit handles both Enter (browser-native) and
    // the Send button click. No onClick handler on the button, no onKeyDown
    // on the input, no other entry points.
    e.preventDefault();
    if (sendingRef.current) return;
    const value = inputValue;
    setInputValue("");
    void handleSendMessage(value);
  };

  const generateAssistantResponse = (
    userInput: string,
    signals: typeof defaultSignals,
    scoringResult: ReturnType<typeof scoreLead>
  ): string => {
    const normalized = userInput.toLowerCase();

    if (normalized.includes("hi") || normalized.includes("hello") || normalized.includes("hey")) {
      return "Hi there. What kind of business are you running, and what are you trying to improve?";
    }

    if (signals.has_business) {
      if (signals.problem_clarity >= 1) {
        return "Got it. Can you tell me more about the specific challenge? For example, is it lead quality, follow-up speed, or conversion rates?";
      }
      return "Interesting. What kind of challenges are you facing right now? Are you getting traffic but struggling to convert, or something else?";
    }

    if (signals.has_traffic_or_spend) {
      return "Sounds like you have activity already. What happens after someone shows interest? Is your follow-up process working well?";
    }

    if (signals.urgency >= 2) {
      return "Understood, this sounds time-sensitive. What is the main thing you need to fix right now?";
    }

    if (signals.wants_to_book) {
      return "Happy to set that up. Could you share your name and email so I can get that arranged?";
    }

    if (scoringResult.final_score === "low") {
      return "Thanks for sharing. To point you in the right direction, could you tell me a bit about your business and what you are looking to achieve?";
    }

    if (scoringResult.final_score === "medium") {
      return "That helps. What does your current process look like for handling interested visitors? Are you doing it manually or with some tooling?";
    }

    if (scoringResult.final_score === "high") {
      return "This sounds like a strong fit. You have a real business need and a clear problem. Would you like to book a quick call to see how this would work for your setup?";
    }

    return "Thanks for sharing. What else can you tell me about your situation?";
  };

  const handleLeadCreation = async (
    _signals: typeof defaultSignals,
    scoringResult: ReturnType<typeof scoreLead>
  ) => {
    if (!state.context || !state.session) return;

    const lead = await leadService.createLead(
      state.context,
      state.messages[state.messages.length - 2]?.content || "",
      state.contactInfo
    );

    await leadService.routeLead(lead);

    switch (scoringResult.route) {
      case "calendly":
        setState(prev => ({ ...prev, showCalendly: true, currentStep: "routing" }));
        break;
      case "soft_booking":
        setState(prev => ({ ...prev, showCalendly: true, currentStep: "routing" }));
        break;
      case "nurture":
        setState(prev => ({ ...prev, showContactForm: true, currentStep: "contact_capture" }));
        break;
      case "helpful_guidance":
        setState(prev => ({ ...prev, currentStep: "completed" }));
        break;
    }

    onLeadCreated?.(lead);
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.context || !state.session) return;

    setState(prev => ({ ...prev, isLoading: true }));

    const lead = await leadService.createLead(
      state.context,
      state.messages[state.messages.length - 1]?.content || "",
      state.contactInfo
    );

    await leadService.routeLead(lead);

    const updatedSignals = { ...state.signals, contact_captured: true };
    const scoringResult = scoreLead(updatedSignals);

    let response = "";
    switch (scoringResult.route) {
      case "calendly":
      case "soft_booking":
        response = "Great. Let me get you to the booking page.";
        setState(prev => ({
          ...prev,
          showContactForm: false,
          showCalendly: true,
          signals: updatedSignals,
          isLoading: false,
          currentStep: "routing"
        }));
        break;
      case "nurture":
        response = "Thanks. I'll send over some useful resources and we can follow up from there.";
        setState(prev => ({
          ...prev,
          showContactForm: false,
          signals: updatedSignals,
          isLoading: false,
          currentStep: "completed"
        }));
        break;
      case "helpful_guidance":
        response = "Appreciate you reaching out. Here are some resources that should help you get started.";
        setState(prev => ({
          ...prev,
          showContactForm: false,
          signals: updatedSignals,
          isLoading: false,
          currentStep: "completed"
        }));
        break;
    }

    if (response) {
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        session_id: state.session.id,
        content: response,
        role: "assistant",
        timestamp: new Date().toISOString()
      };

      await messageService.createMessage({
        session_id: state.session.id,
        content: assistantMessage.content,
        role: assistantMessage.role
      });

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, assistantMessage]
      }));
    }

    onLeadCreated?.(lead);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setState(prev => ({
      ...prev,
      contactInfo: { ...prev.contactInfo, [name]: value }
    }));
  };

  const handleChatInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  return (
    <div className="tq-chatbot-widget">
      <div className="tq-chatbot-header">
        <div className="tq-chatbot-header-left">
          <div className="tq-chatbot-header-avatar">
            <svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <div className="tq-chatbot-header-info">
            <h3>TQ Funnel Assistant</h3>
            <p>Qualifies and routes leads</p>
          </div>
        </div>
        <button className="tq-chatbot-close" onClick={onClose} aria-label="Close chat">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div className="tq-chatbot-messages">
        {state.messages.map((message) => (
          <div
            key={message.id}
            className={`tq-chatbot-message tq-chatbot-message-${message.role}`}
          >
            <div className="tq-chatbot-message-content">
              {message.content}
            </div>
            <div className="tq-chatbot-message-meta">
              {message.role === "user" ? "You" : "TQ Bot"} - {" "}
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
              })}
            </div>
          </div>
        ))}
        
        {state.isLoading && (
          <div className="tq-chatbot-message tq-chatbot-message-assistant">
            <div className="tq-chatbot-message-content">
              <span className="tq-chatbot-typing">
                Thinking
                <span className="tq-typing-dots">
                  <span /><span /><span />
                </span>
              </span>
            </div>
          </div>
        )}
        
        {state.showContactForm && (
          <div className="tq-chatbot-message tq-chatbot-message-assistant">
            <div className="tq-chatbot-message-content">
              <form onSubmit={handleContactSubmit} className="tq-chatbot-contact-form">
                <h4>Let's connect</h4>
                <input
                  type="text"
                  name="name"
                  placeholder="Your name"
                  value={state.contactInfo.name || ""}
                  onChange={handleInputChange}
                  required
                />
                <input
                  type="email"
                  name="email"
                  placeholder="Your email"
                  value={state.contactInfo.email || ""}
                  onChange={handleInputChange}
                  required
                />
                <input
                  type="text"
                  name="company"
                  placeholder="Company (optional)"
                  value={state.contactInfo.company || ""}
                  onChange={handleInputChange}
                />
                <button type="submit" disabled={state.isLoading}>
                  {state.isLoading ? "Submitting..." : "Submit"}
                </button>
              </form>
            </div>
          </div>
        )}
        
        {state.showCalendly && (
          <div className="tq-chatbot-message tq-chatbot-message-assistant">
            <div className="tq-chatbot-message-content">
              <div className="tq-chatbot-calendly">
                <h4>Book a call</h4>
                <p>You look like a fit for a quick call. Pick a time that works for you.</p>
                <div
                  dangerouslySetInnerHTML={{
                    __html: calendlyService.getEmbedScript("calendly-inline-widget") || ""
                  }}
                />
                <button onClick={() => {
                  calendlyService.recordClick(state.context?.visitor_id || "");
                  setState(prev => ({
                    ...prev,
                    showCalendly: false,
                    currentStep: "completed"
                  }));
                }} className="tq-chatbot-calendly-close">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {state.currentStep !== "completed" && !state.showCalendly && !state.showContactForm && (
        <form className="tq-chatbot-input" onSubmit={handleSendSubmit}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Tell me what you want to improve..."
            value={inputValue}
            onChange={handleChatInputChange}
            disabled={state.isLoading}
            aria-label="Message"
          />
          <button type="submit" disabled={state.isLoading || inputValue.trim().length === 0}>
            Send
          </button>
        </form>
      )}

      {state.currentStep === "completed" && (
        <div className="tq-chatbot-completed">
          <p>Thanks for the conversation. We will be in touch with your next step.</p>
        </div>
      )}
    </div>
  );
};

export default ChatWidget;
