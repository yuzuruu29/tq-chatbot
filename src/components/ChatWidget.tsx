import React, { useState, useEffect, useRef, useCallback } from "react";
import type { ChatMessage, ChatSession, VisitorContext, Lead } from "../types";
import { messageService } from "../services/messageService";
import { leadService } from "../services/leadService";
import { scoreLead, defaultSignals, extractSignalsFromText, mergeSignals, getQualificationGap, extractBusinessTypeFromContext, extractPainFromContext, getRouteConfig } from "../lib/scoring";
import { calendlyService } from "../services/calendlyService";
import { makeIdempotencyKey, idempotencyTracker, isSpamSubmission } from "../lib/idempotency";
import { chatRateLimiter } from "../lib/rateLimit";
import { getTenantConfig, type TenantConfig } from "../config/tenant";
import { edgeProcessMessage } from "../lib/edgeClient";
import { v4 as uuidv4 } from "uuid";

// Persistence key for sessionStorage — scoped to visitor + tenant so
// multiple tabs or tenants do not collide.
const SESSION_STORAGE_KEY = (visitorId: string, tenantId: string) =>
  `tq_chat_state_${tenantId}_${visitorId}`;

interface PersistedChatState {
  messages: ChatMessage[];
  signals: typeof defaultSignals;
  currentStep: ChatState["currentStep"];
  contactInfo: ChatState["contactInfo"];
  sessionId: string;
  lastQuestionPurpose?: "business" | "pain" | "urgency" | "readiness" | null;
}

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
  /** Tracks which qualification question was last asked, so the next user
   *  message can be interpreted in context (e.g. short noun phrase = business). */
  lastQuestionPurpose: "business" | "pain" | "urgency" | "readiness" | null;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ tenantId, onLeadCreated, onClose }) => {
  const config: TenantConfig = getTenantConfig(tenantId);

  const [state, setState] = useState<ChatState>({
    messages: [],
    session: null,
    context: null,
    signals: { ...defaultSignals },
    isLoading: false,
    currentStep: "greeting",
    contactInfo: {},
    showCalendly: false,
    showContactForm: false,
    lastQuestionPurpose: null
  });

  // Controlled value for the chat input so the form submit path has the
  // canonical source of truth (no DOM reads mixed with React state).
  const [inputValue, setInputValue] = useState("");

  // Synchronous guard against duplicate submits within a single render frame.
  // The async handleSendMessage still relies on isLoading for the disabled UI,
  // but a ref blocks re-entry from rapid clicks/Enter presses that fire before
  // the next state flush.
  const sendingRef = useRef(false);

  // Track whether we have already created a lead for this session to prevent
  // duplicate lead records from repeated scoring triggers.
  const leadCreatedRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Visitor ID is stable across refreshes (persisted in localStorage).
  const visitorIdRef = useRef<string>("");

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
    // Visitor ID is stable across refreshes (persisted in localStorage).
    let visitorId = localStorage.getItem(`tq_visitor_${tenantId}`);
    if (!visitorId) {
      visitorId = uuidv4();
      localStorage.setItem(`tq_visitor_${tenantId}`, visitorId);
    }
    visitorIdRef.current = visitorId;

    // Check sessionStorage for existing conversation state.
    // This allows the conversation to survive page refresh without
    // requiring server-side session persistence.
    const persisted = loadPersistedState(visitorId, tenantId);

    if (persisted && persisted.messages.length > 0) {
      // Restore conversation from sessionStorage.
      const session: ChatSession = {
        id: persisted.sessionId,
        visitor_id: visitorId,
        tenant_id: tenantId,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const context: VisitorContext = {
        visitor_id: visitorId,
        session_id: persisted.sessionId,
        tenant_id: tenantId
      };

      // Restore idempotency tracker state for persisted messages so
      // retries after refresh do not create duplicates.
      for (const msg of persisted.messages) {
        const key = makeIdempotencyKey(persisted.sessionId, msg.content, msg.role);
        idempotencyTracker.add(key);
      }

      // If lead was already created before refresh, prevent duplicate.
      if (persisted.currentStep === "routing" || persisted.currentStep === "completed") {
        leadCreatedRef.current = true;
      }

      setState(prev => ({
        ...prev,
        messages: persisted.messages,
        session,
        context,
        signals: persisted.signals,
        currentStep: persisted.currentStep,
        contactInfo: persisted.contactInfo,
        showContactForm: persisted.currentStep === "contact_capture",
        showCalendly: persisted.currentStep === "routing",
        lastQuestionPurpose: persisted.lastQuestionPurpose ?? null
      }));
      return;
    }

    // No persisted state — create a fresh session.
    const context: VisitorContext = {
      visitor_id: visitorId,
      session_id: uuidv4(),
      tenant_id: tenantId
    };

    const session = await messageService.createSession(context);

    const welcomeMessage: ChatMessage = {
      id: uuidv4(),
      session_id: session.id,
      content: config.welcomeMessage,
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

    // Spam guard: suppress empty, garbage, or repeated messages.
    if (isSpamSubmission(content)) {
      sendingRef.current = false;
      return;
    }

    // Rate limit guard: cap messages per window to bound API cost exposure.
    const rateLimitResult = chatRateLimiter.check();
    if (!rateLimitResult.allowed) {
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        session_id: state.session.id,
        content: "You are sending messages too quickly. Please wait a moment before continuing.",
        role: "assistant",
        timestamp: new Date().toISOString()
      };
      setState(prev => ({ ...prev, messages: [...prev.messages, assistantMessage] }));
      sendingRef.current = false;
      return;
    }

    // Idempotency guard: prevent duplicate message persistence on retry.
    const idemKey = makeIdempotencyKey(state.session.id, content, "user");
    if (idempotencyTracker.has(idemKey)) {
      sendingRef.current = false;
      return;
    }
    idempotencyTracker.add(idemKey);

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
    }).catch(() => {
      // Message persistence failed (Edge Function down, network error).
      // The message is already optimistically displayed to the user.
      // Log but do not block the conversation flow.
      console.warn("Failed to persist user message — conversation continues in-memory.");
    });

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage]
    }));

    // Context-aware signal extraction: if the bot just asked a specific
    // qualification question, interpret short answers in that context.
    const prevPurpose = state.lastQuestionPurpose;
    let extractedSignals = extractSignalsFromText(content);
    if (prevPurpose === "business" && !extractedSignals.has_business) {
      const contextSignals = extractBusinessTypeFromContext(content);
      if (contextSignals) {
        extractedSignals = { ...extractedSignals, ...contextSignals };
      }
    }
    if (prevPurpose === "pain" && (!extractedSignals.problem_clarity || extractedSignals.problem_clarity < 1)) {
      const painSignals = extractPainFromContext(content);
      if (painSignals) {
        extractedSignals = { ...extractedSignals, ...painSignals };
      }
    }
    let updatedSignals = mergeSignals(state.signals, extractedSignals);

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
    let assistantResponse = generateCloserResponse(content, updatedSignals, scoringResult);

    // Determine what question the response is asking so the NEXT user message
    // can be interpreted in context.  Derive from the qualification gap rather
    // than brittle regex on the response text — this works regardless of whether
    // the response was deterministic or Groq-drafted.
    const gap = getQualificationGap(updatedSignals);
    let nextQuestionPurpose: ChatState["lastQuestionPurpose"] = gap;

    // Optional: call Groq for enhanced extraction and response drafting.
    // This runs in the background — the deterministic response is used
    // immediately.  If Groq returns a drafted response, it replaces the
    // deterministic one.  If Groq returns additional signals, they are
    // merged (but never overwrite positive deterministic signals with null).
    const routeConfig = getRouteConfig(scoringResult.route);
    edgeProcessMessage(
      tenantId,
      content,
      state.messages.map(m => ({ role: m.role, content: m.content })),
      updatedSignals,
      prevPurpose,
      config as unknown as Record<string, unknown>,
      {
        next_gap: gap,
        final_score: scoringResult.final_score,
        route: scoringResult.route,
        business_type_text: updatedSignals.business_type_text,
        problem_text: updatedSignals.problem_text,
        next_action: routeConfig.description
      }
    ).then(groqResult => {
      if (!groqResult) return;

      // Merge Groq-extracted signals: only set fields that are non-null
      // and that the deterministic extraction did not already positively detect.
      if (groqResult.extracted_signals) {
        const groqSignals: Partial<typeof defaultSignals> = {};
        const gs = groqResult.extracted_signals;
        if (gs.has_business === true && !updatedSignals.has_business) groqSignals.has_business = true;
        if (gs.business_type_text && !updatedSignals.business_type_text) groqSignals.business_type_text = gs.business_type_text;
        if (gs.problem_clarity != null && gs.problem_clarity > 0 && (!updatedSignals.problem_clarity || updatedSignals.problem_clarity < 1)) {
          groqSignals.problem_clarity = gs.problem_clarity;
        }
        if (gs.problem_text && !updatedSignals.problem_text) groqSignals.problem_text = gs.problem_text;
        if (gs.urgency != null && gs.urgency > 0 && (!updatedSignals.urgency || updatedSignals.urgency < 1)) {
          groqSignals.urgency = gs.urgency;
        }
        if (gs.wants_to_book === true && !updatedSignals.wants_to_book) groqSignals.wants_to_book = true;
        if (gs.has_traffic_or_spend === true && !updatedSignals.has_traffic_or_spend) groqSignals.has_traffic_or_spend = true;
        if (gs.email) {
          groqSignals.contact_captured = true;
        }

        if (Object.keys(groqSignals).length > 0) {
          updatedSignals = mergeSignals(updatedSignals, groqSignals);
          // Re-score with enhanced signals
          const enhancedScore = scoreLead(updatedSignals);
          // Only upgrade score, never downgrade
          if (
            (enhancedScore.final_score === "high" && scoringResult.final_score !== "high") ||
            (enhancedScore.final_score === "medium" && scoringResult.final_score === "low")
          ) {
            // Use the enhanced score for routing
            assistantResponse = generateCloserResponse(content, updatedSignals, enhancedScore);
          }
        }
      }

      // Use Groq-drafted response if available (overrides deterministic wording only)
      if (groqResult.drafted_response) {
        assistantResponse = groqResult.drafted_response;
      }

      // Update the assistant message in-place
      setState(prev => {
        const msgs = [...prev.messages];
        const lastIdx = msgs.length - 1;
        if (lastIdx >= 0 && msgs[lastIdx].role === "assistant") {
          msgs[lastIdx] = { ...msgs[lastIdx], content: assistantResponse };
        }
        return { ...prev, messages: msgs, signals: updatedSignals };
      });
    }).catch(() => {
      // Groq call failed — deterministic response stands.  Non-fatal.
    });

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
    }).catch(() => {
      console.warn("Failed to persist assistant message — conversation continues in-memory.");
    });

    // IMPORTANT: the user message was already appended optimistically above.
    // Append only the assistant message here to avoid a duplicate user bubble.
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, assistantMessage],
      signals: updatedSignals,
      isLoading: false,
      lastQuestionPurpose: nextQuestionPurpose
    }));

    // Only create a lead once per session, and only when scoring triggers an
    // alert or routes to calendly. Prevents duplicate lead records.
    if ((scoringResult.alert || scoringResult.route === "calendly") && !leadCreatedRef.current) {
      leadCreatedRef.current = true;
      await handleLeadCreation(updatedSignals, scoringResult);
    }

    sendingRef.current = false;
  }, [state.context, state.session, state.signals, state.contactInfo, state.lastQuestionPurpose]);

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

  /**
   * Closer-style response generation.
   * Uses qualification gap analysis to ask purposeful follow-up questions
   * instead of generic survey prompts. The bot actively qualifies the lead
   * based on business context, urgency, fit, and readiness.
   */
  const generateCloserResponse = (
    userInput: string,
    signals: typeof defaultSignals,
    scoringResult: ReturnType<typeof scoreLead>
  ): string => {
    const normalized = userInput.toLowerCase();

    // Greeting detection — redirect to qualification
    if (/^(hi|hello|hey|yo|sup|hiya)\b/i.test(normalized)) {
      return config.qualificationQuestions.find(q => q.purpose === "business")?.text
        || "What kind of business are you running, and what are you trying to improve?";
    }

    // If we have a clear qualification gap, ask the right next question.
    const gap = getQualificationGap(signals);

    if (gap === "business") {
      return "I need to understand what you do first. " + (
        config.qualificationQuestions.find(q => q.purpose === "business")?.text
        || "What kind of business are you running, and what are you trying to improve?"
      );
    }

    if (gap === "pain") {
      const painQuestion =
        config.qualificationQuestions.find(q => q.purpose === "pain")?.text
        || "What is the specific challenge? For example, is it lead quality, follow-up speed, or conversion rates?";
      // Acknowledge the business type if we just captured it.
      if (signals.business_type_text) {
        return `Got it — ${signals.business_type_text}. ${painQuestion}`;
      }
      return painQuestion;
    }

    if (gap === "urgency") {
      return (
        config.qualificationQuestions.find(q => q.purpose === "urgency")?.text
        || "How urgent is this? Are you looking to make a change in the next few weeks, or is this more of a future exploration?"
      );
    }

    // If score is high and we have enough signals, route toward action.
    if (scoringResult.final_score === "high") {
      return "This looks like a strong fit. " + getCalendlyPrompt(signals);
    }

    if (scoringResult.final_score === "medium" && signals.wants_to_book) {
      return "Happy to set that up. Could you share your name and email so I can get that arranged?";
    }

    if (scoringResult.final_score === "medium") {
      return "That helps. " + (
        config.qualificationQuestions.find(q => q.purpose === "readiness")?.text
        || "What does your current process look like for handling interested visitors?"
      );
    }

    // Low score — probe for more context or wrap up gracefully.
    if (scoringResult.final_score === "low") {
      return "Thanks for sharing. " + (
        config.qualificationQuestions.find(q => q.purpose === "business")?.text
        || "Could you tell me a bit about your business and what you are looking to achieve?"
      );
    }

    return config.fallbackMessage;
  };

  /**
   * Build a Calendly prompt tailored to the lead's signals.
   */
  const getCalendlyPrompt = (signals: typeof defaultSignals): string => {
    if (signals.wants_to_book) {
      return "You mentioned wanting to book — let me get you to the booking page.";
    }
    if (signals.urgency >= 2) {
      return "Since this is time-sensitive, the fastest next step is a quick call. Let me show you the booking page.";
    }
    return "Would you like to book a quick call to see how this would work for your setup?";
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

    // Prevent duplicate lead creation on re-submit of contact form.
    if (!leadCreatedRef.current) {
      leadCreatedRef.current = true;
      const lead = await leadService.createLead(
        state.context,
        state.messages[state.messages.length - 1]?.content || "",
        state.contactInfo
      );
      await leadService.routeLead(lead);
      onLeadCreated?.(lead);
    }

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

  // --- Session persistence helpers ---
  // Conversation state is persisted to sessionStorage so the visitor can
  // refresh the page without losing their qualification progress.
  // sessionStorage (not localStorage) is used because the conversation is
  // tab-scoped — opening a new tab starts a fresh conversation.

  const loadPersistedState = (visitorId: string, tid: string): PersistedChatState | null => {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY(visitorId, tid));
      if (!raw) return null;
      return JSON.parse(raw) as PersistedChatState;
    } catch {
      return null;
    }
  };

  const persistState = useCallback(() => {
    if (!state.session || !visitorIdRef.current || state.messages.length === 0) return;
    try {
      const persisted: PersistedChatState = {
        messages: state.messages,
        signals: state.signals,
        currentStep: state.currentStep,
        contactInfo: state.contactInfo,
        sessionId: state.session.id,
        lastQuestionPurpose: state.lastQuestionPurpose
      };
      sessionStorage.setItem(
        SESSION_STORAGE_KEY(visitorIdRef.current, tenantId),
        JSON.stringify(persisted)
      );
    } catch {
      // sessionStorage may be full or blocked (private browsing). Non-fatal.
    }
  }, [state.messages, state.signals, state.currentStep, state.contactInfo, state.session, tenantId, state.lastQuestionPurpose]);

  // Persist state whenever conversation-relevant fields change.
  useEffect(() => {
    persistState();
  }, [persistState]);

  return (
    <div className="tq-chatbot-widget">
      <div className="tq-chatbot-header">
        <div className="tq-chatbot-header-left">
          <div className="tq-chatbot-header-avatar">
            <svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <div className="tq-chatbot-header-info">
            <h3>{config.botTitle}</h3>
            <p>{config.botSubtitle}</p>
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
              {message.role === "user" ? "You" : config.botName} - {" "}
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
