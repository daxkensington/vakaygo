"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { analytics } from "@/lib/analytics";

// ─── Types ──────────────────────────────────────────────────────
interface ListingCard {
  title: string;
  slug: string;
  island: string;
  type: string;
  price: number | null;
  rating: number | null;
  image: string | null;
  url: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  listings?: ListingCard[];
}

interface ConciergeContext {
  island?: string;
  type?: string;
  listingTitle?: string;
  listingSlug?: string;
  listingPrice?: string;
  pageUrl?: string;
}

// ─── Constants ──────────────────────────────────────────────────
const WELCOME_MESSAGE =
  "Hey! I'm your AI travel concierge. I can search real listings, check availability, compare options, and help plan your Caribbean adventure. What are you looking for?";

const QUICK_SUGGESTIONS = [
  "Best stays in Grenada",
  "Top-rated restaurants",
  "Find tours under $100",
  "Tell me about Barbados",
];

const SESSION_KEY = "vakaygo-concierge-messages";

const TYPE_LABELS: Record<string, string> = {
  stay: "Stay",
  tour: "Tour",
  dining: "Dining",
  event: "Event",
  transport: "Transport",
  excursion: "Excursion",
  transfer: "Transfer",
  vip: "VIP",
  guide: "Guide",
};

// ─── Session Storage ────────────────────────────────────────────
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

// ─── Markdown-lite renderer ─────────────────────────────────────
function renderMarkdown(text: string) {
  // Split into lines and process
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="list-disc pl-4 space-y-1 my-1">
          {listItems.map((item, i) => (
            <li key={i}>{processInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
  }

  function processInline(str: string): React.ReactNode {
    // Bold
    const parts: React.ReactNode[] = [];
    const boldRegex = /\*\*(.*?)\*\*/g;
    let lastIndex = 0;
    let match;

    while ((match = boldRegex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parts.push(str.slice(lastIndex, match.index));
      }
      parts.push(
        <strong key={`b-${match.index}`} className="font-semibold">
          {match[1]}
        </strong>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < str.length) {
      parts.push(str.slice(lastIndex));
    }

    return parts.length === 1 ? parts[0] : <>{parts}</>;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // List items
    if (/^[-*]\s/.test(line)) {
      listItems.push(line.replace(/^[-*]\s/, ""));
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      listItems.push(line.replace(/^\d+\.\s/, ""));
      continue;
    }

    flushList();

    if (line.trim() === "") {
      elements.push(<br key={`br-${i}`} />);
    } else {
      elements.push(
        <p key={`p-${i}`} className="my-0.5">
          {processInline(line)}
        </p>
      );
    }
  }

  flushList();
  return <>{elements}</>;
}

// ─── Icons ──────────────────────────────────────────────────────
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

function MicIcon({ className }: { className?: string }) {
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
      <rect x="9" y="1" width="6" height="12" rx="3" />
      <path d="M19 10v2a7 7 0 01-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

// ─── Typing Indicator ───────────────────────────────────────────
function TypingIndicator({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="flex items-center gap-1">
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
      {label && (
        <span className="text-xs text-navy-400 animate-pulse">{label}</span>
      )}
    </div>
  );
}

// ─── Listing Card Component ─────────────────────────────────────
function ListingCardInline({
  listing,
  onClick,
}: {
  listing: ListingCard;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 w-52 bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-hidden text-left hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)] transition-all duration-200 hover:-translate-y-0.5 group"
    >
      <div className="relative h-28 overflow-hidden bg-cream-100">
        {listing.image ? (
          <img
            src={listing.image}
            alt={listing.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gold-100 to-teal-100 flex items-center justify-center">
            <SparkleIcon className="w-8 h-8 text-gold-400" />
          </div>
        )}
        <span className="absolute top-2 left-2 bg-gold-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
          {TYPE_LABELS[listing.type] || listing.type}
        </span>
      </div>
      <div className="p-3">
        <h4 className="text-xs font-semibold text-navy-700 line-clamp-1 group-hover:text-gold-600 transition-colors">
          {listing.title}
        </h4>
        <div className="flex items-center justify-between mt-1.5">
          {listing.price !== null ? (
            <span className="text-xs font-bold text-navy-700">
              ${listing.price.toFixed(0)}
            </span>
          ) : (
            <span className="text-xs text-navy-400">Price TBD</span>
          )}
          {listing.rating !== null && listing.rating > 0 && (
            <div className="flex items-center gap-0.5">
              <StarIcon className="w-3 h-3 text-gold-500" />
              <span className="text-[10px] font-semibold text-navy-600">
                {listing.rating.toFixed(1)}
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Main Component ─────────────────────────────────────────────
export function AIConcierge({
  listingContext,
}: {
  listingContext?: {
    title: string;
    slug: string;
    island: string;
    type: string;
    price?: string;
  };
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | undefined>();
  const [hasUnread, setHasUnread] = useState(false);
  const [showPulse, setShowPulse] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const router = useRouter();
  const params = useParams();

  // Build context from current page
  const buildContext = useCallback((): ConciergeContext => {
    const ctx: ConciergeContext = {};
    if (params?.island && typeof params.island === "string") {
      ctx.island = params.island;
    }
    if (typeof window !== "undefined") {
      ctx.pageUrl = window.location.pathname;
      // Check for listing context set by "Ask AI about this" button
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lc = (window as any).__vakaygo_listing_context;
      if (lc) {
        ctx.listingTitle = lc.title;
        ctx.listingSlug = lc.slug;
        ctx.island = lc.island;
        ctx.type = lc.type;
        ctx.listingPrice = lc.price;
      }
    }
    if (listingContext) {
      ctx.listingTitle = listingContext.title;
      ctx.listingSlug = listingContext.slug;
      ctx.island = listingContext.island;
      ctx.type = listingContext.type;
      ctx.listingPrice = listingContext.price;
    }
    return ctx;
  }, [params, listingContext]);

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

  // Open with listing context prefill
  const openWithContext = useCallback(
    (prefill?: string) => {
      setIsOpen(true);
      if (prefill) {
        setInput(prefill);
      }
    },
    []
  );

  // Expose openWithContext globally for listing detail pages
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__vakaygo_concierge_open = openWithContext;
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__vakaygo_concierge_open;
    };
  }, [openWithContext]);

  // Voice input
  const toggleVoice = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
      setIsListening(false);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  // Text-to-speech for assistant responses
  const speakText = useCallback((text: string) => {
    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.lang = "en-US";
    // Prefer a natural-sounding voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes("Samantha") || v.name.includes("Google") || v.name.includes("Natural")) || voices.find(v => v.lang.startsWith("en"));
    if (preferred) utterance.voice = preferred;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [voiceEnabled]);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  // Send message
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: Message = { role: "user", content: content.trim() };
      analytics.useConcierge(content.trim());
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      setIsLoading(true);
      setLoadingLabel("Thinking...");

      try {
        // After a small delay, update the label to show searching
        const searchTimer = setTimeout(
          () => setLoadingLabel("Searching listings..."),
          1500
        );

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            context: buildContext(),
          }),
        });

        clearTimeout(searchTimer);

        if (!res.ok) throw new Error("Failed to get response");

        const data = await res.json();
        const assistantMessage: Message = {
          role: "assistant",
          content: data.message,
          listings: data.listings,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Speak the response if voice is enabled
        if (voiceEnabled && data.message) {
          speakText(data.message);
        }

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
        setLoadingLabel(undefined);
      }
    },
    [messages, isLoading, isOpen, buildContext, voiceEnabled, speakText]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const navigateToListing = (url: string) => {
    router.push(url);
    setIsOpen(false);
  };

  // Quick actions after a message with listings
  const handleQuickAction = (action: string, msg: Message) => {
    if (action === "more" && msg.listings && msg.listings.length > 0) {
      const type = msg.listings[0].type;
      const island = msg.listings[0].island;
      sendMessage(`Show me more ${type} options in ${island}`);
    } else if (action === "compare" && msg.listings && msg.listings.length >= 2) {
      const names = msg.listings
        .slice(0, 3)
        .map((l) => l.title)
        .join(", ");
      sendMessage(`Compare these: ${names}`);
    }
  };

  const hasSpeechApi =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  if (!hasMounted) return null;

  return (
    <>
      {/* ── Chat Panel ───────────────────────────────────── */}
      {isOpen && (
        <div
          className="fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[420px] h-[560px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden animate-slide-up"
          style={{
            background:
              "linear-gradient(white, white) padding-box, linear-gradient(135deg, #c8912e, #2dd4bf, #c8912e) border-box",
            border: "2px solid transparent",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-gold-500 to-gold-400 text-white">
            <div className="flex items-center gap-2">
              <SparkleIcon className="w-5 h-5" />
              <span className="font-semibold text-[15px]">
                VakayGo Concierge
              </span>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">
                AI
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setVoiceEnabled((v) => {
                    if (v) stopSpeaking();
                    return !v;
                  });
                }}
                className={`p-1.5 rounded-lg transition-colors ${voiceEnabled ? "bg-white/30" : "hover:bg-white/20"}`}
                aria-label={voiceEnabled ? "Disable voice" : "Enable voice"}
                title={voiceEnabled ? "Voice responses ON" : "Voice responses OFF"}
              >
                {isSpeaking ? (
                  <svg className="w-4 h-4 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>
                ) : voiceEnabled ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
                ) : (
                  <svg className="w-4 h-4 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                )}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-white/20 transition-colors"
                aria-label="Close chat"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {/* Welcome message always shows */}
            <div className="flex gap-2 justify-start">
              <div className="flex-shrink-0 w-7 h-7 bg-gold-100 rounded-full flex items-center justify-center mt-1">
                <SparkleIcon className="w-4 h-4 text-gold-500" />
              </div>
              <div className="max-w-[85%] bg-cream-50 text-navy-700 rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed">
                {WELCOME_MESSAGE}
              </div>
            </div>

            {/* Quick suggestions if no messages yet */}
            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2 mt-2 ml-9">
                {QUICK_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="text-xs px-3 py-1.5 rounded-full bg-gold-50 text-gold-700 hover:bg-gold-100 transition-colors shadow-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {/* Message bubbles */}
            {messages.map((msg, i) => (
              <div key={i}>
                <div
                  className={`flex ${msg.role === "user" ? "justify-end" : "gap-2 justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 w-7 h-7 bg-gold-100 rounded-full flex items-center justify-center mt-1">
                      <SparkleIcon className="w-4 h-4 text-gold-500" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-gold-500 text-white rounded-br-sm"
                        : "bg-cream-50 text-navy-700 rounded-bl-sm"
                    }`}
                  >
                    {msg.role === "assistant"
                      ? renderMarkdown(msg.content)
                      : msg.content}
                  </div>
                </div>

                {/* Listing Cards */}
                {msg.listings && msg.listings.length > 0 && (
                  <div className="ml-9 mt-2">
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                      {msg.listings.map((listing) => (
                        <ListingCardInline
                          key={listing.slug}
                          listing={listing}
                          onClick={() => navigateToListing(listing.url)}
                        />
                      ))}
                    </div>
                    {/* Quick actions */}
                    <div className="flex gap-2 mt-2">
                      {msg.listings.length >= 2 && (
                        <button
                          onClick={() => handleQuickAction("compare", msg)}
                          className="text-[10px] px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors"
                        >
                          Compare these
                        </button>
                      )}
                      <button
                        onClick={() => handleQuickAction("more", msg)}
                        className="text-[10px] px-2.5 py-1 rounded-full bg-gold-50 text-gold-700 hover:bg-gold-100 transition-colors"
                      >
                        See more like this
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex gap-2 justify-start">
                <div className="flex-shrink-0 w-7 h-7 bg-gold-100 rounded-full flex items-center justify-center mt-1">
                  <SparkleIcon className="w-4 h-4 text-gold-500" />
                </div>
                <div className="bg-cream-50 text-navy-700 rounded-2xl rounded-bl-sm">
                  <TypingIndicator label={loadingLabel} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer: Input + Powered by */}
          <div className="border-t border-cream-200 bg-white">
            <form onSubmit={handleSubmit} className="px-4 py-3">
              <div className="flex items-center gap-2">
                {hasSpeechApi && (
                  <button
                    type="button"
                    onClick={toggleVoice}
                    className={`p-2.5 rounded-xl transition-colors ${
                      isListening
                        ? "bg-red-500 text-white animate-pulse"
                        : "bg-cream-50 text-navy-400 hover:bg-cream-100"
                    }`}
                    aria-label={
                      isListening ? "Stop listening" : "Voice input"
                    }
                  >
                    <MicIcon className="w-4 h-4" />
                  </button>
                )}
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    isListening
                      ? "Listening..."
                      : "Ask about Caribbean travel..."
                  }
                  className="flex-1 text-sm px-4 py-2.5 rounded-xl bg-cream-50 focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent text-navy-700 placeholder:text-navy-300"
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
            <div className="px-4 pb-2 flex items-center justify-center gap-1">
              <span className="text-[10px] text-navy-300">Powered by</span>
              <span className="text-[10px] font-semibold text-navy-400">
                Claude
              </span>
            </div>
          </div>
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
