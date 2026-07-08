// TQ ChatBot — useChatEngine Hook
// Encapsulates all conversation state, signal extraction, scoring, and
// lead creation logic for the chat widget. The ChatWidget component
// consumes this hook and renders only UI.

import { useState, useEffect, useRef, useCallback } from "react";
import type { ChatMessage, ChatSession, VisitorContext, Lead } from "../types";
import { messageService } from "../services/messageService";
import { leadService } from "../services/leadService";
import {
  scoreLead, defaultSignals, extractSignalsFromText, mergeSignals,
  getQualificationGap, extractBusinessTypeFromContext, extractPainFromContext,
  getRouteConfig,
} from "../lib/scoring";
import { calendlyService } from "../services/calendlyService";
import { makeIdempotencyKey, idempotencyTracker, isSpamSubmission } from "../lib/idempotency";
import { chatRateLimiter, groqRateLimiter } from "../lib/rateLimit";
import { getTenantConfig, type TenantConfig } from "../config/tenant";
import { edgeProcessMessage } from "../lib/edgeClient";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../lib/logger";

// ── Types ───────────────────────────────────────────────────────

export interface ChatState {
  messages: ChatMessage[];
  session: ChatSession | null;
  context: VisitorContext | null;
  signals: typeof defaultSignals;
  isLoading: boolean;
  currentStep: "greeting" | "qualification" | "contact_capture" | "routing" | "completed";
  contactInfo: { name?: string; email?: string; phone?: string; company?: string };
  showCalendly: boolean;
  showContactForm: boolean;
  lastQuestionPurpose: "business" | "pain" | "urgency" | "readiness" | null;
}

interface PersistedChatState {
  messages: ChatMessage[];
  signals: typeof defaultSignals;
  currentStep: ChatState["currentStep"];
  contactInfo: ChatState["contactInfo"];
  sessionId: string;
  lastQuestionPurpose?: "business" | "pain" | "urgency" | "readiness" | null;
}

// ── Helpers ─────────────────────────────────────────────────────

const SESSION_STORAGE_KEY = (visitorId: string, tenantId: string) =>
  `tq_chat_state_${tenantId}_${visitorId}`;

function loadPersistedState(visitorId: string, tid: string): PersistedChatState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY(visitorId, tid));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedChatState;
  } catch {
    return null;
  }
}

function getCalendlyPrompt(signals: typeof defaultSignals): string {
  if (signals.wants_to_book) return "You mentioned wanting to book — let me get you to the booking page.";
  if (signals.urgency >= 2) return "Since this is time-sensitive, the fastest next step is a quick call. Let me show you the booking page.";
  return "Would you like to book a quick call to see how this would work for your setup?";
}

function generateCloserResponse(
  userInput: string,
  signals: typeof defaultSignals,
  scoringResult: ReturnType<typeof scoreLead>,
  config: TenantConfig,
): string {
  const normalized = userInput.toLowerCase();

  if (/^(hi|hello|hey|yo|sup|hiya)\b/i.test(normalized)) {
    return config.qualificationQuestions.find(q => q.purpose === "business")?.text
      || "What kind of business are you running, and what are you trying to improve?";
  }

  const gap = getQualificationGap(signals);

  if (gap === "business") {
    return "I need to understand what you do first. " + (
      config.qualificationQuestions.find(q => q.purpose === "business")?.text
      || "What kind of business are you running, and what are you trying to improve?"
    );
  }
  if (gap === "pain") {
    const painQuestion = config.qualificationQuestions.find(q => q.purpose === "pain")?.text
      || "What is the specific challenge? For example, is it lead quality, follow-up speed, or conversion rates?";
    if (signals.business_type_text) return `Got it — ${signals.business_type_text}. ${painQuestion}`;
    return painQuestion;
  }
  if (gap === "urgency") {
    return config.qualificationQuestions.find(q => q.purpose === "urgency")?.text
      || "How urgent is this? Are you looking to make a change in the next few weeks, or is this more of a future exploration?";
  }

  if (scoringResult.final_score === "high") return "This looks like a strong fit. " + getCalendlyPrompt(signals);
  if (scoringResult.final_score === "medium" && signals.wants_to_book)
    return "Happy to set that up. Could you share your name and email so I can get that arranged?";
  if (scoringResult.final_score === "medium")
    return "That helps. " + (config.qualificationQuestions.find(q => q.purpose === "readiness")?.text
      || "What does your current process look like for handling interested visitors?");
  if (scoringResult.final_score === "low")
    return "Thanks for sharing. " + (config.qualificationQuestions.find(q => q.purpose === "business")?.text
      || "Could you tell me a bit about your business and what you are looking to achieve?");

  return config.fallbackMessage;
}

// ── Hook ────────────────────────────────────────────────────────

export function useChatEngine(tenantId: string, onLeadCreated?: (lead: Lead) => void) {
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
    lastQuestionPurpose: null,
  });

  const [inputValue, setInputValue] = useState("");
  const sendingRef = useRef(false);
  const leadCreatedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const visitorIdRef = useRef<string>("");

  // ── Initialize session ─────────────────────────────────────────

  const initializeSession = useCallback(async () => {
    let visitorId = localStorage.getItem(`tq_visitor_${tenantId}`);
    if (!visitorId) {
      visitorId = uuidv4();
      localStorage.setItem(`tq_visitor_${tenantId}`, visitorId);
    }
    visitorIdRef.current = visitorId;

    const persisted = loadPersistedState(visitorId, tenantId);

    if (persisted && persisted.messages.length > 0) {
      const session: ChatSession = {
        id: persisted.sessionId,
        visitor_id: visitorId,
        tenant_id: tenantId,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const context: VisitorContext = { visitor_id: visitorId, session_id: persisted.sessionId, tenant_id: tenantId };

      for (const msg of persisted.messages) {
        idempotencyTracker.add(makeIdempotencyKey(persisted.sessionId, msg.content, msg.role));
      }

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
        lastQuestionPurpose: persisted.lastQuestionPurpose ?? null,
      }));
      return;
    }

    const context: VisitorContext = { visitor_id: visitorId, session_id: uuidv4(), tenant_id: tenantId };
    const session = await messageService.createSession(context);
    const welcomeMessage: ChatMessage = {
      id: uuidv4(),
      session_id: session.id,
      content: config.welcomeMessage,
      role: "assistant",
      timestamp: new Date().toISOString(),
    };
    await messageService.createMessage({ session_id: session.id, content: welcomeMessage.content, role: welcomeMessage.role });

    setState(prev => ({ ...prev, messages: [welcomeMessage], session, context, currentStep: "qualification" }));
  }, [tenantId, config.welcomeMessage]);

  // ── Effects ────────────────────────────────────────────────────

  useEffect(() => { initializeSession(); }, [initializeSession]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [state.messages]);
  useEffect(() => {
    if (state.currentStep !== "completed" && !state.showCalendly && !state.showContactForm) {
      inputRef.current?.focus();
    }
  }, [state.currentStep, state.showCalendly, state.showContactForm]);

  // Persist state to sessionStorage on change.
  const persistState = useCallback(() => {
    if (!state.session || !visitorIdRef.current || state.messages.length === 0) return;
    try {
      sessionStorage.setItem(
        SESSION_STORAGE_KEY(visitorIdRef.current, tenantId),
        JSON.stringify({
          messages: state.messages,
          signals: state.signals,
          currentStep: state.currentStep,
          contactInfo: state.contactInfo,
          sessionId: state.session.id,
          lastQuestionPurpose: state.lastQuestionPurpose,
        } as PersistedChatState),
      );
    } catch { /* sessionStorage may be full/blocked — non-fatal */ }
  }, [state.messages, state.signals, state.currentStep, state.contactInfo, state.session, tenantId, state.lastQuestionPurpose]);

  useEffect(() => { persistState(); }, [persistState]);

  // ── Lead creation ──────────────────────────────────────────────

  const handleLeadCreation = useCallback(async (
    _signals: typeof defaultSignals,
    scoringResult: ReturnType<typeof scoreLead>,
  ) => {
    if (!state.context || !state.session) return;
    const lead = await leadService.createLead(
      state.context,
      state.messages[state.messages.length - 2]?.content || "",
      state.contactInfo,
    );
    await leadService.routeLead(lead);

    switch (scoringResult.route) {
      case "calendly":
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
  }, [state.context, state.session, state.messages, state.contactInfo, onLeadCreated]);

  // ── Send message ───────────────────────────────────────────────

  const handleSendMessage = useCallback(async (rawContent: string) => {
    const content = rawContent.trim();
    if (!state.context || !state.session || !content) return;
    if (sendingRef.current) return;
    sendingRef.current = true;

    if (isSpamSubmission(content)) { sendingRef.current = false; return; }

    const rateLimitResult = chatRateLimiter.check();
    if (!rateLimitResult.allowed) {
      setState(prev => ({ ...prev, messages: [...prev.messages, {
        id: uuidv4(), session_id: state.session!.id,
        content: "You are sending messages too quickly. Please wait a moment before continuing.",
        role: "assistant" as const, timestamp: new Date().toISOString(),
      }] }));
      sendingRef.current = false;
      return;
    }

    const idemKey = makeIdempotencyKey(state.session.id, content, "user");
    if (idempotencyTracker.has(idemKey)) { sendingRef.current = false; return; }
    idempotencyTracker.add(idemKey);

    setState(prev => ({ ...prev, isLoading: true }));

    const userMessage: ChatMessage = {
      id: uuidv4(), session_id: state.session.id, content, role: "user", timestamp: new Date().toISOString(),
    };
    await messageService.createMessage({ session_id: state.session.id, content: userMessage.content, role: userMessage.role })
      .catch(() => logger.warn("Failed to persist user message — conversation continues in-memory."));
    setState(prev => ({ ...prev, messages: [...prev.messages, userMessage] }));

    // Context-aware signal extraction.
    const prevPurpose = state.lastQuestionPurpose;
    let extractedSignals = extractSignalsFromText(content);
    if (prevPurpose === "business" && !extractedSignals.has_business) {
      const ctx = extractBusinessTypeFromContext(content);
      if (ctx) extractedSignals = { ...extractedSignals, ...ctx };
    }
    if (prevPurpose === "pain" && (!extractedSignals.problem_clarity || extractedSignals.problem_clarity < 1)) {
      const pain = extractPainFromContext(content);
      if (pain) extractedSignals = { ...extractedSignals, ...pain };
    }
    let updatedSignals = mergeSignals(state.signals, extractedSignals);

    if (updatedSignals.wants_to_book && !state.contactInfo.email) {
      setState(prev => ({ ...prev, signals: updatedSignals, showContactForm: true, isLoading: false }));
      sendingRef.current = false;
      return;
    }

    const scoringResult = scoreLead(updatedSignals);
    let assistantResponse = generateCloserResponse(content, updatedSignals, scoringResult, config);

    const gap = getQualificationGap(updatedSignals);
    const nextQuestionPurpose: ChatState["lastQuestionPurpose"] = gap;

    // ── Groq as primary model provider ──────────────────────────────
    // Call Groq via Edge Function for signal extraction + response drafting.
    // This is the PRIMARY response path — Groq drafts the assistant message.
    // Falls back to deterministic response when Groq is unavailable, times
    // out, returns invalid data, or the per-tab rate limit is exceeded.
    const routeConfig = getRouteConfig(scoringResult.route);
    const groqCheck = groqRateLimiter.check();

    if (groqCheck.allowed) {
      try {
        const groqResult = await edgeProcessMessage(
          tenantId, content,
          state.messages.map(m => ({ role: m.role, content: m.content })),
          updatedSignals, prevPurpose,
          config as unknown as Record<string, unknown>,
          { next_gap: gap, final_score: scoringResult.final_score, route: scoringResult.route,
            business_type_text: updatedSignals.business_type_text, problem_text: updatedSignals.problem_text,
            next_action: routeConfig.description },
        );

        if (groqResult) {
          // Merge Groq-extracted signals (only upgrade, never overwrite positives).
          if (groqResult.extracted_signals) {
            const groqSignals: Partial<typeof defaultSignals> = {};
            const gs = groqResult.extracted_signals;
            if (gs.has_business === true && !updatedSignals.has_business) groqSignals.has_business = true;
            if (gs.business_type_text && !updatedSignals.business_type_text) groqSignals.business_type_text = gs.business_type_text;
            if (gs.problem_clarity != null && gs.problem_clarity > 0 && (!updatedSignals.problem_clarity || updatedSignals.problem_clarity < 1))
              groqSignals.problem_clarity = gs.problem_clarity;
            if (gs.problem_text && !updatedSignals.problem_text) groqSignals.problem_text = gs.problem_text;
            if (gs.urgency != null && gs.urgency > 0 && (!updatedSignals.urgency || updatedSignals.urgency < 1))
              groqSignals.urgency = gs.urgency;
            if (gs.wants_to_book === true && !updatedSignals.wants_to_book) groqSignals.wants_to_book = true;
            if (gs.has_traffic_or_spend === true && !updatedSignals.has_traffic_or_spend) groqSignals.has_traffic_or_spend = true;
            if (gs.email) groqSignals.contact_captured = true;

            if (Object.keys(groqSignals).length > 0) {
              updatedSignals = mergeSignals(updatedSignals, groqSignals);
              const enhancedScore = scoreLead(updatedSignals);
              if (
                (enhancedScore.final_score === "high" && scoringResult.final_score !== "high") ||
                (enhancedScore.final_score === "medium" && scoringResult.final_score === "low")
              ) {
                assistantResponse = generateCloserResponse(content, updatedSignals, enhancedScore, config);
              }
            }
          }

          // Groq-drafted response is the PRIMARY response — override deterministic wording.
          if (groqResult.drafted_response) {
            assistantResponse = groqResult.drafted_response;
          }
        }
      } catch {
        // Groq call failed — deterministic response stands as fallback.
        logger.warn("Groq call failed; using deterministic response.");
      }
    } else {
      logger.warn("Groq rate limit reached; falling back to deterministic response.", {
        retryAfterMs: groqCheck.retryAfterMs,
      });
    }

    const assistantMessage: ChatMessage = {
      id: uuidv4(), session_id: state.session.id, content: assistantResponse,
      role: "assistant", timestamp: new Date().toISOString(),
    };
    await messageService.createMessage({ session_id: state.session.id, content: assistantMessage.content, role: assistantMessage.role })
      .catch(() => logger.warn("Failed to persist assistant message — conversation continues in-memory."));

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, assistantMessage],
      signals: updatedSignals,
      isLoading: false,
      lastQuestionPurpose: nextQuestionPurpose,
    }));

    if ((scoringResult.alert || scoringResult.route === "calendly") && !leadCreatedRef.current) {
      leadCreatedRef.current = true;
      await handleLeadCreation(updatedSignals, scoringResult);
    }
    sendingRef.current = false;
  }, [state.context, state.session, state.signals, state.contactInfo, state.lastQuestionPurpose, tenantId, config, handleLeadCreation]);

  // ── Contact form submit ────────────────────────────────────────

  const handleContactSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.context || !state.session) return;
    setState(prev => ({ ...prev, isLoading: true }));

    if (!leadCreatedRef.current) {
      leadCreatedRef.current = true;
      const lead = await leadService.createLead(state.context, state.messages[state.messages.length - 1]?.content || "", state.contactInfo);
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
        setState(prev => ({ ...prev, showContactForm: false, showCalendly: true, signals: updatedSignals, isLoading: false, currentStep: "routing" }));
        break;
      case "nurture":
        response = "Thanks. I'll send over some useful resources and we can follow up from there.";
        setState(prev => ({ ...prev, showContactForm: false, signals: updatedSignals, isLoading: false, currentStep: "completed" }));
        break;
      case "helpful_guidance":
        response = "Appreciate you reaching out. Here are some resources that should help you get started.";
        setState(prev => ({ ...prev, showContactForm: false, signals: updatedSignals, isLoading: false, currentStep: "completed" }));
        break;
    }

    if (response) {
      const assistantMessage: ChatMessage = {
        id: uuidv4(), session_id: state.session.id, content: response, role: "assistant", timestamp: new Date().toISOString(),
      };
      await messageService.createMessage({ session_id: state.session.id, content: assistantMessage.content, role: assistantMessage.role });
      setState(prev => ({ ...prev, messages: [...prev.messages, assistantMessage] }));
    }
  }, [state.context, state.session, state.messages, state.contactInfo, state.signals, onLeadCreated]);

  // ── Input handlers ─────────────────────────────────────────────

  const handleSendSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sendingRef.current) return;
    const value = inputValue;
    setInputValue("");
    void handleSendMessage(value);
  }, [inputValue, handleSendMessage]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setState(prev => ({ ...prev, contactInfo: { ...prev.contactInfo, [name]: value } }));
  }, []);

  const handleChatInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  }, []);

  // ── Public API ─────────────────────────────────────────────────

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    currentStep: state.currentStep,
    showCalendly: state.showCalendly,
    showContactForm: state.showContactForm,
    contactInfo: state.contactInfo,
    inputValue,
    setInputValue,
    config,
    messagesEndRef,
    inputRef,
    handleSendSubmit,
    handleContactSubmit,
    handleInputChange,
    handleChatInputChange,
    /** Expose for the Calendly embed close handler. */
    visitorId: state.context?.visitor_id,
    closeCalendly: useCallback(() => {
      calendlyService.recordClick(state.context?.visitor_id || "");
      setState(prev => ({ ...prev, showCalendly: false, currentStep: "completed" }));
    }, [state.context?.visitor_id]),
  };
}
