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

// ─── Personalities ─────────────────────────────────────────────
// Personality definitions — voice is handled server-side via OpenAI TTS API
// Each personality maps to a distinct OpenAI voice (nova, onyx, shimmer, echo, fable, alloy)
const PERSONALITIES = [
  { id: "coral", name: "Coral", emoji: "🐚", desc: "Warm & knowledgeable", color: "from-gold-400 to-gold-600" },
  { id: "captain", name: "Captain Jack", emoji: "⚓", desc: "Salty island captain", color: "from-blue-500 to-blue-700" },
  { id: "luxe", name: "Luxe", emoji: "✨", desc: "Premium concierge", color: "from-purple-400 to-purple-600" },
  { id: "backpacker", name: "Ziggy", emoji: "🎒", desc: "Budget adventurer", color: "from-green-400 to-green-600" },
  { id: "local", name: "Auntie Mae", emoji: "🌺", desc: "Caribbean insider", color: "from-orange-400 to-orange-600" },
  { id: "party", name: "DJ Tropic", emoji: "🎶", desc: "Nightlife expert", color: "from-pink-400 to-pink-600" },
];

// Language code map for STT (speech recognition)
const LOCALE_TO_LANG: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  pt: "pt-BR",
  nl: "nl-NL",
  de: "de-DE",
};

const WELCOME_MESSAGES: Record<string, string> = {
  coral: "Hey! I'm Coral, your AI travel concierge. I can search real listings, check availability, compare options, and help plan your Caribbean adventure. What are you looking for?",
  captain: "Ahoy! Captain Jack here. I've sailed every island in the Caribbean and I know the best spots — tourist traps and hidden treasures alike. Where shall we set course?",
  luxe: "Welcome. I'm Luxe, your premium Caribbean concierge. I specialize in the finest experiences — from private villas to exclusive dining. How may I elevate your journey?",
  backpacker: "Yo! I'm Ziggy! Ready to find you the most epic Caribbean experiences without burning through your wallet. Hidden gems, street food, local vibes — what's the move?",
  local: "Hey darlin'! Auntie Mae here. I know every back road, family kitchen, and secret beach across these islands. Tell me what you're looking for and I'll set you right.",
  party: "What's good! DJ Tropic in the house. Beach parties, rum bars, carnival season, live music — I know where the energy is across all 21 islands. What vibe are we chasing?",
};

// ─── Constants ──────────────────────────────────────────────────
const QUICK_SUGGESTIONS = [
  "Best stays in Grenada",
  "Top-rated restaurants",
  "Find tours under $100",
  "Tell me about Barbados",
];

const SESSION_KEY = "vakaygo-concierge-messages";
const PERSONALITY_KEY = "vakaygo-concierge-personality";

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
  spa: "Spa & Wellness",
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

function loadPersonality(): string {
  if (typeof window === "undefined") return "coral";
  try {
    return localStorage.getItem(PERSONALITY_KEY) || "coral";
  } catch {
    return "coral";
  }
}

function savePersonality(id: string) {
  try {
    localStorage.setItem(PERSONALITY_KEY, id);
  } catch {}
}

// ─── Markdown-lite renderer ─────────────────────────────────────
function renderMarkdown(text: string) {
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

    if (/^[-*]\s/.test(line)) {
      listItems.push(line.replace(/^[-*]\s/, ""));
      continue;
    }

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
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="1" width="6" height="12" rx="3" />
      <path d="M19 10v2a7 7 0 01-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

// ─── Typing Indicator ───────────────────────────────────────────
function TypingIndicator({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-navy-300 animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-2 h-2 rounded-full bg-navy-300 animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-2 h-2 rounded-full bg-navy-300 animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
      {label && <span className="text-xs text-navy-400 animate-pulse">{label}</span>}
    </div>
  );
}

// ─── Voice Mode Visualizer ──────────────────────────────────────
type VoiceState = "idle" | "listening" | "thinking" | "speaking";

function VoiceVisualizer({ state, personality }: { state: VoiceState; personality: typeof PERSONALITIES[number] }) {
  const rings = state === "listening" ? 3 : state === "speaking" ? 4 : state === "thinking" ? 2 : 0;

  return (
    <div className="relative flex items-center justify-center w-40 h-40 mx-auto">
      {/* Animated rings */}
      {Array.from({ length: rings }).map((_, i) => (
        <div
          key={i}
          className={`absolute rounded-full border-2 ${
            state === "listening" ? "border-red-400/40" :
            state === "speaking" ? "border-gold-400/40" :
            "border-navy-300/30"
          }`}
          style={{
            width: `${100 + i * 30}%`,
            height: `${100 + i * 30}%`,
            animation: `pulse ${1.5 + i * 0.3}s ease-in-out infinite`,
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      {/* Center avatar */}
      <div className={`relative z-10 w-24 h-24 rounded-full bg-gradient-to-br ${personality.color} flex items-center justify-center shadow-lg ${state === "thinking" ? "animate-pulse" : ""}`}>
        <span className="text-4xl">{personality.emoji}</span>
      </div>
    </div>
  );
}

// ─── Listing Card Component ─────────────────────────────────────
function ListingCardInline({ listing, onClick }: { listing: ListingCard; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 w-52 bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-hidden text-left hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)] transition-all duration-200 hover:-translate-y-0.5 group"
    >
      <div className="relative h-28 overflow-hidden bg-cream-100">
        {listing.image ? (
          <img src={listing.image} alt={listing.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gold-100 to-teal-100 flex items-center justify-center">
            <SparkleIcon className="w-8 h-8 text-gold-400" />
          </div>
        )}
        <span className="absolute top-2 left-2 bg-gold-700 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
          {TYPE_LABELS[listing.type] || listing.type}
        </span>
      </div>
      <div className="p-3">
        <h4 className="text-xs font-semibold text-navy-700 line-clamp-1 group-hover:text-gold-600 transition-colors">
          {listing.title}
        </h4>
        <div className="flex items-center justify-between mt-1.5">
          {listing.price !== null ? (
            <span className="text-xs font-bold text-navy-700">${listing.price.toFixed(0)}</span>
          ) : (
            <span className="text-xs text-navy-400">Price TBD</span>
          )}
          {listing.rating !== null && listing.rating > 0 && (
            <div className="flex items-center gap-0.5">
              <StarIcon className="w-3 h-3 text-gold-500" />
              <span className="text-[10px] font-semibold text-navy-600">{listing.rating.toFixed(1)}</span>
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
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [personality, setPersonality] = useState("coral");
  const [showPersonalities, setShowPersonalities] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const voiceModeRef = useRef(false);
  const pendingVoiceTranscriptRef = useRef<string | null>(null);
  const sendMessageRef = useRef<((content: string, isVoice?: boolean) => Promise<void>) | null>(null);
  const router = useRouter();
  const params = useParams();

  const currentPersonality = PERSONALITIES.find((p) => p.id === personality) || PERSONALITIES[0];

  // Keep ref in sync
  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  // Build context from current page
  const buildContext = useCallback((): ConciergeContext => {
    const ctx: ConciergeContext = {};
    if (params?.island && typeof params.island === "string") {
      ctx.island = params.island;
    }
    if (typeof window !== "undefined") {
      ctx.pageUrl = window.location.pathname;
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
    setPersonality(loadPersonality());
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
    if (isOpen && !voiceMode) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setHasUnread(false);
    }
  }, [isOpen, voiceMode]);

  // Open with listing context prefill
  const openWithContext = useCallback((prefill?: string) => {
    setIsOpen(true);
    if (prefill) setInput(prefill);
  }, []);

  // Expose openWithContext globally
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__vakaygo_concierge_open = openWithContext;
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__vakaygo_concierge_open;
    };
  }, [openWithContext]);

  // ─── Speech Functions ─────────────────────────────────────────

  // Get the user's locale from the cookie or default to en
  const getUserLocale = useCallback((): string => {
    if (typeof document === "undefined") return "en";
    const match = document.cookie.match(/(?:^|;\s*)locale=([^;]*)/);
    return match?.[1] || "en";
  }, []);

  // Audio element ref for API-based TTS playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const speakText = useCallback(async (text: string, onDone?: () => void) => {
    if (typeof window === "undefined" || !text.trim()) {
      onDone?.();
      return;
    }

    setIsSpeaking(true);
    setVoiceState("speaking");

    try {
      // Call our TTS API which uses OpenAI's HD voices
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          personality: personality,
        }),
      });

      if (!res.ok) throw new Error("TTS failed");

      const audioBlob = await res.blob();

      // Clean up previous audio URL
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = audioUrl;

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        setVoiceState("idle");
        onDone?.();
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        setVoiceState("idle");
        onDone?.();
      };

      await audio.play();
    } catch (err) {
      console.error("TTS playback error:", err);
      // Fallback to browser speech synthesis if API TTS fails
      try {
        if ("speechSynthesis" in window) {
          const clean = text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/[#*_~`]/g, "").slice(0, 500);
          const utterance = new SpeechSynthesisUtterance(clean);
          utterance.rate = 1.0;
          utterance.lang = "en-US";
          utterance.onend = () => { setIsSpeaking(false); setVoiceState("idle"); onDone?.(); };
          utterance.onerror = () => { setIsSpeaking(false); setVoiceState("idle"); onDone?.(); };
          window.speechSynthesis.speak(utterance);
          return;
        }
      } catch {}
      setIsSpeaking(false);
      setVoiceState("idle");
      onDone?.();
    }
  }, [personality]);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setIsSpeaking(false);
    setVoiceState("idle");
  }, []);

  // Start listening (used by both manual mic button and voice mode loop)
  const startListening = useCallback((onResult: (transcript: string) => void) => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) return;

    const SpeechRecognition =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    const locale = getUserLocale();
    recognition.lang = LOCALE_TO_LANG[locale] || "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setVoiceState("idle");
    };
    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setVoiceState("listening");
  }, []);

  // Toggle mic for text mode
  const toggleVoice = useCallback(() => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    startListening((transcript) => {
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
    });
  }, [isListening, startListening]);

  // ─── Send Message ─────────────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string, isVoice = false) => {
      if (!content.trim() || isLoading) return;

      const userMessage: Message = { role: "user", content: content.trim() };
      analytics.useConcierge(content.trim());
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      setIsLoading(true);
      setLoadingLabel("Thinking...");
      if (isVoice) setVoiceState("thinking");

      try {
        const searchTimer = setTimeout(() => setLoadingLabel("Searching listings..."), 1500);

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
            context: buildContext(),
            personality,
            locale: getUserLocale(),
            voiceMode: isVoice || voiceModeRef.current,
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

        // Voice response: speak and then auto-listen again in voice mode
        if ((voiceEnabled || isVoice) && data.message) {
          speakText(data.message, () => {
            // After speaking, auto-listen if still in voice mode
            if (voiceModeRef.current) {
              setTimeout(() => {
                startListening((transcript) => {
                  setLastTranscript(transcript);
                  // Auto-send in voice mode
                  if (transcript.trim()) {
                    // We need to call sendMessage but can't recurse directly here
                    // Instead, set a flag that triggers send
                    voiceSend(transcript);
                  }
                });
              }, 500);
            }
          });
        }

        if (!isOpen) setHasUnread(true);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Sorry, I'm having trouble connecting right now. Please try again in a moment!",
          },
        ]);
        setVoiceState("idle");
      } finally {
        setIsLoading(false);
        setLoadingLabel(undefined);
      }
    },
    [messages, isLoading, isOpen, buildContext, voiceEnabled, speakText, personality, startListening, getUserLocale]
  );

  // Keep sendMessage ref in sync so voice callbacks can call it without stale closures
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  // Voice auto-send: call sendMessage directly via ref (no form hack)
  const voiceSend = useCallback((transcript: string) => {
    if (!transcript.trim()) return;
    setLastTranscript(transcript);
    // Use ref to avoid stale closure
    sendMessageRef.current?.(transcript, true);
  }, []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input, voiceMode);
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const navigateToListing = (url: string) => {
    router.push(url);
    setIsOpen(false);
  };

  const handleQuickAction = (action: string, msg: Message) => {
    if (action === "more" && msg.listings && msg.listings.length > 0) {
      const type = msg.listings[0].type;
      const island = msg.listings[0].island;
      sendMessage(`Show me more ${type} options in ${island}`);
    } else if (action === "compare" && msg.listings && msg.listings.length >= 2) {
      const names = msg.listings.slice(0, 3).map((l) => l.title).join(", ");
      sendMessage(`Compare these: ${names}`);
    }
  };

  // Enter voice mode with spoken welcome
  const enterVoiceMode = useCallback(() => {
    setVoiceMode(true);
    setVoiceEnabled(true);
    // Speak a welcome greeting, then start listening
    const welcome = WELCOME_MESSAGES[personality] || WELCOME_MESSAGES.coral;
    speakText(welcome, () => {
      // After welcome, start listening
      if (voiceModeRef.current) {
        setTimeout(() => {
          startListening((transcript) => {
            voiceSend(transcript);
          });
        }, 400);
      }
    });
  }, [startListening, speakText, personality, voiceSend]);

  // Exit voice mode
  const exitVoiceMode = useCallback(() => {
    setVoiceMode(false);
    setVoiceState("idle");
    stopSpeaking();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, [stopSpeaking]);

  const handlePersonalityChange = (id: string) => {
    // Stop any ongoing speech/listening before switching
    stopSpeaking();
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsListening(false);
    setIsSpeaking(false);
    setVoiceState("idle");
    // Switch personality
    setPersonality(id);
    savePersonality(id);
    setShowPersonalities(false);
    // Clear conversation when switching personality
    setMessages([]);
    sessionStorage.removeItem(SESSION_KEY);
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
          className="fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[420px] h-[600px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden animate-slide-up"
          style={{
            background: "linear-gradient(white, white) padding-box, linear-gradient(135deg, #c8912e, #2dd4bf, #c8912e) border-box",
            border: "2px solid transparent",
          }}
        >
          {/* Header */}
          <div className={`flex items-center justify-between px-5 py-3 bg-gradient-to-r ${currentPersonality.color} text-white`}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{currentPersonality.emoji}</span>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-[14px]">{currentPersonality.name}</span>
                  <span className="text-[9px] bg-white/20 px-1.5 py-0.5 rounded-full">AI</span>
                </div>
                <span className="text-[10px] text-white/70">{currentPersonality.desc}</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Personality picker */}
              <button
                onClick={() => setShowPersonalities(!showPersonalities)}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                aria-label="Change personality"
                title="Change personality"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </button>
              {/* Voice mode toggle */}
              {hasSpeechApi && (
                <button
                  onClick={() => voiceMode ? exitVoiceMode() : enterVoiceMode()}
                  className={`p-1.5 rounded-lg transition-colors ${voiceMode ? "bg-white/30" : "hover:bg-white/20"}`}
                  aria-label={voiceMode ? "Exit voice mode" : "Enter voice mode"}
                  title={voiceMode ? "Exit voice chat" : "Voice chat"}
                >
                  <PhoneIcon className="w-4 h-4" />
                </button>
              )}
              {/* Voice TTS toggle */}
              <button
                onClick={() => {
                  setVoiceEnabled((v) => {
                    if (v) stopSpeaking();
                    return !v;
                  });
                }}
                className={`p-1.5 rounded-lg transition-colors ${voiceEnabled ? "bg-white/30" : "hover:bg-white/20"}`}
                aria-label={voiceEnabled ? "Disable voice" : "Enable voice"}
                title={voiceEnabled ? "Voice ON" : "Voice OFF"}
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
                onClick={() => { setIsOpen(false); if (voiceMode) exitVoiceMode(); }}
                className="p-1 rounded-lg hover:bg-white/20 transition-colors"
                aria-label="Close chat"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Personality Picker Dropdown */}
          {showPersonalities && (
            <div className="absolute top-14 right-4 z-[60] w-64 bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.15)] border border-cream-200 p-2 animate-slide-up">
              <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-wider px-2 py-1">Choose Your Guide</p>
              {PERSONALITIES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handlePersonalityChange(p.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                    personality === p.id ? "bg-cream-100" : "hover:bg-cream-50"
                  }`}
                >
                  <span className={`w-9 h-9 rounded-full bg-gradient-to-br ${p.color} flex items-center justify-center text-lg shadow-sm`}>
                    {p.emoji}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-navy-700">{p.name}</div>
                    <div className="text-[11px] text-navy-400">{p.desc}</div>
                  </div>
                  {personality === p.id && (
                    <svg className="w-4 h-4 text-gold-500 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Voice Mode Overlay */}
          {voiceMode ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 bg-gradient-to-b from-cream-50 to-white">
              <VoiceVisualizer state={voiceState} personality={currentPersonality} />

              <div className="mt-6 text-center">
                <p className="text-lg font-semibold text-navy-700">
                  {voiceState === "listening" && "Listening..."}
                  {voiceState === "thinking" && `${currentPersonality.name} is thinking...`}
                  {voiceState === "speaking" && `${currentPersonality.name} is speaking...`}
                  {voiceState === "idle" && "Tap the mic to talk"}
                </p>
                {lastTranscript && (
                  <p className="mt-2 text-sm text-navy-400 italic max-w-xs">
                    &ldquo;{lastTranscript}&rdquo;
                  </p>
                )}
              </div>

              <div className="mt-8 flex items-center gap-4">
                {/* Mic button for voice mode */}
                <button
                  onClick={() => {
                    if (isListening && recognitionRef.current) {
                      recognitionRef.current.stop();
                      setIsListening(false);
                      setVoiceState("idle");
                    } else if (!isLoading && !isSpeaking) {
                      startListening((transcript) => {
                        setLastTranscript(transcript);
                        setInput(transcript);
                        setTimeout(() => {
                          const form = document.getElementById("concierge-form") as HTMLFormElement;
                          form?.requestSubmit();
                        }, 100);
                      });
                    }
                  }}
                  disabled={isLoading || isSpeaking}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
                    isListening
                      ? "bg-red-500 text-white scale-110 animate-pulse shadow-red-500/40"
                      : isLoading || isSpeaking
                      ? "bg-navy-200 text-navy-400 cursor-not-allowed"
                      : "bg-gold-700 text-white hover:bg-gold-800 hover:scale-105 shadow-gold-500/30"
                  }`}
                >
                  <MicIcon className="w-7 h-7" />
                </button>

                {/* Stop / End call button */}
                <button
                  onClick={exitVoiceMode}
                  className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                  title="End voice chat"
                >
                  <PhoneIcon className="w-5 h-5 rotate-[135deg]" />
                </button>
              </div>

              <p className="mt-4 text-[11px] text-navy-300">
                Voice chat with {currentPersonality.name}
              </p>
            </div>
          ) : (
            <>
              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {/* Welcome message */}
                <div className="flex gap-2 justify-start">
                  <div className={`flex-shrink-0 w-7 h-7 bg-gradient-to-br ${currentPersonality.color} rounded-full flex items-center justify-center mt-1`}>
                    <span className="text-xs">{currentPersonality.emoji}</span>
                  </div>
                  <div className="max-w-[85%] bg-cream-50 text-navy-700 rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed">
                    {WELCOME_MESSAGES[personality] || WELCOME_MESSAGES.coral}
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
                    <div className={`flex ${msg.role === "user" ? "justify-end" : "gap-2 justify-start"}`}>
                      {msg.role === "assistant" && (
                        <div className={`flex-shrink-0 w-7 h-7 bg-gradient-to-br ${currentPersonality.color} rounded-full flex items-center justify-center mt-1`}>
                          <span className="text-xs">{currentPersonality.emoji}</span>
                        </div>
                      )}
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-gold-700 text-white rounded-br-sm"
                            : "bg-cream-50 text-navy-700 rounded-bl-sm"
                        }`}
                      >
                        {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
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
                    <div className={`flex-shrink-0 w-7 h-7 bg-gradient-to-br ${currentPersonality.color} rounded-full flex items-center justify-center mt-1`}>
                      <span className="text-xs">{currentPersonality.emoji}</span>
                    </div>
                    <div className="bg-cream-50 text-navy-700 rounded-2xl rounded-bl-sm">
                      <TypingIndicator label={loadingLabel} />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </>
          )}

          {/* Footer: Input + Powered by (hidden in voice mode) */}
          <div className={`border-t border-cream-200 bg-white ${voiceMode ? "hidden" : ""}`}>
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
                    aria-label={isListening ? "Stop listening" : "Voice input"}
                  >
                    <MicIcon className="w-4 h-4" />
                  </button>
                )}
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isListening ? "Listening..." : `Ask ${currentPersonality.name}...`}
                  className="flex-1 text-sm px-4 py-2.5 rounded-xl bg-cream-50 focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent text-navy-700 placeholder:text-navy-300"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="p-2.5 rounded-xl bg-gold-700 text-white hover:bg-gold-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Send message"
                >
                  <SendIcon className="w-4 h-4" />
                </button>
              </div>
            </form>
            <div className="px-4 pb-2 flex items-center justify-center gap-1">
              <span className="text-[10px] text-navy-300">Powered by</span>
              <span className="text-[10px] font-semibold text-navy-400">Claude</span>
            </div>
          </div>

          {/* Voice mode no longer needs a hidden form — voiceSend calls sendMessage directly */}
        </div>
      )}

      {/* ── Floating Chat Button ─────────────────────────── */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`fixed bottom-6 right-4 sm:right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br ${currentPersonality.color} text-white shadow-[0_4px_20px_rgba(200,145,46,0.4)] hover:shadow-[0_6px_28px_rgba(200,145,46,0.5)] hover:scale-105 transition-all duration-200 flex items-center justify-center ${showPulse ? "animate-pulse" : ""}`}
        aria-label={isOpen ? "Close concierge chat" : "Open concierge chat"}
      >
        {isOpen ? (
          <CloseIcon className="w-6 h-6" />
        ) : (
          <span className="text-2xl">{currentPersonality.emoji}</span>
        )}

        {hasUnread && !isOpen && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white" />
        )}
      </button>
    </>
  );
}
