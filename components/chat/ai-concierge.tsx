"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const WELCOME_MESSAGE =
  "Hey! I'm your Caribbean travel concierge. Ask me anything — best beaches, island recommendations, trip planning, you name it!";

const QUICK_SUGGESTIONS = [
  "Best island for couples?",
  "Plan a 5-day trip",
  "Grenada beaches",
  "Budget-friendly islands",
];

const SESSION_KEY = "vakaygo-concierge-messages";

function loadMessages(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: Message[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages));
  } catch {}
}

// ─── Sparkle Icon ─────────────────────────────────────────────
function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
    </svg>
  );
}

// ─── Chat Icon ────────────────────────────────────────────────
function ChatIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

// ─── Close Icon ───────────────────────────────────────────────
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

// ─── Send Icon ────────────────────────────────────────────────
function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

// ─── Typing Indicator ─────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <span
        className="w-2 h-2 rounded-full bg-navy-300 animate-bounce"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="w-2 h-2 rounded-full bg-navy-300 animate-bounce"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="w-2 h-2 rounded-full bg-navy-300 animate-bounce"
        style={{ animationDelay: "300ms" }}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export function AIConcierge() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [showPulse, setShowPulse] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load from sessionStorage on mount
  useEffect(() => {
    setMessages(loadMessages());
    setHasMounted(true);
  }, []);

  // Persist messages
  useEffect(() => {
    if (hasMounted) {
      saveMessages(messages);
    }
  }, [messages, hasMounted]);

  // Stop pulse after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowPulse(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setHasUnread(false);
    }
  }, [isOpen]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: Message = { role: "user", content: content.trim() };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      setIsLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: newMessages }),
        });

        if (!res.ok) throw new Error("Failed to get response");

        const data = await res.json();
        const assistantMessage: Message = {
          role: "assistant",
          content: data.message,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        if (!isOpen) {
          setHasUnread(true);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Sorry, I'm having trouble connecting right now. Please try again in a moment!",
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, isOpen]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  if (!hasMounted) return null;

  return (
    <>
      {/* ── Chat Panel ───────────────────────────────────── */}
      {isOpen && (
        <div className="fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[380px] h-[520px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-gold-500 to-gold-400 text-white">
            <div className="flex items-center gap-2">
              <SparkleIcon className="w-5 h-5" />
              <span className="font-semibold text-[15px]">
                VakayGo Concierge
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-white/20 transition-colors"
              aria-label="Close chat"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {/* Welcome message always shows */}
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-cream-50 text-navy-700 rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed">
                {WELCOME_MESSAGE}
              </div>
            </div>

            {/* Quick suggestions if no messages yet */}
            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {QUICK_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="text-xs px-3 py-1.5 rounded-full bg-gold-50 text-gold-700 hover:bg-gold-100 transition-colors border border-gold-200"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {/* Message bubbles */}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-gold-500 text-white rounded-br-sm"
                      : "bg-cream-50 text-navy-700 rounded-bl-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-cream-50 text-navy-700 rounded-2xl rounded-bl-sm">
                  <TypingIndicator />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form
            onSubmit={handleSubmit}
            className="px-4 py-3 border-t border-cream-200 bg-white"
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about Caribbean travel..."
                className="flex-1 text-sm px-4 py-2.5 rounded-xl bg-cream-50 border border-cream-200 focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent text-navy-700 placeholder:text-navy-300"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="p-2.5 rounded-xl bg-gold-500 text-white hover:bg-gold-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Send message"
              >
                <SendIcon className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Floating Chat Button ─────────────────────────── */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`fixed bottom-6 right-4 sm:right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-white shadow-[0_4px_20px_rgba(200,145,46,0.4)] hover:shadow-[0_6px_28px_rgba(200,145,46,0.5)] hover:scale-105 transition-all duration-200 flex items-center justify-center ${showPulse ? "animate-pulse" : ""}`}
        aria-label={isOpen ? "Close concierge chat" : "Open concierge chat"}
      >
        {isOpen ? (
          <CloseIcon className="w-6 h-6" />
        ) : (
          <ChatIcon className="w-6 h-6" />
        )}

        {/* Unread indicator */}
        {hasUnread && !isOpen && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white" />
        )}
      </button>
    </>
  );
}
