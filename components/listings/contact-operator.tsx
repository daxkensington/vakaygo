"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { safeAuthNext } from "@/lib/auth-return";
import { MAX_MESSAGE_LENGTH } from "@/lib/message-input";
import { MessageCircle, Send, Loader2, X } from "lucide-react";

type ContactOperatorProps = {
  operatorId: string;
  operatorName: string;
  listingId: string;
  listingTitle: string;
  listingPath?: string;
};

export function ContactOperator({ operatorId, operatorName, listingId, listingTitle, listingPath }: ContactOperatorProps) {
  const { user } = useAuth();
  return <ContactOperatorForm key={`${user?.id || "guest"}:${operatorId}:${listingId}`} {...{ operatorId, operatorName, listingId, listingTitle, listingPath }} />;
}

function ContactOperatorForm({ operatorId, operatorName, listingId, listingTitle, listingPath }: ContactOperatorProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const messageId = useId();
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const attempt = useRef<{ content: string; id: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const returnPath = safeAuthNext(listingPath);
  const signInHref = returnPath
    ? `/auth/signin?next=${encodeURIComponent(returnPath)}`
    : "/auth/signin";

  useEffect(() => {
    if (open) messageInput.current?.focus();
  }, [open]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || message.trim().length > MAX_MESSAGE_LENGTH || !user || pending.current) return;
    pending.current = true;
    if (attempt.current?.content !== message.trim()) attempt.current = { content: message.trim(), id: crypto.randomUUID() };
    controller.current = new AbortController();
    setSending(true);
    setError(null);
    setAuthExpired(false);

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(20000)]),
        body: JSON.stringify({
          receiverId: operatorId,
          content: message.trim(),
          listingId,
          clientMessageId: attempt.current.id,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!mounted.current) return;
      if (res.ok && data.message?.id) {
        setSent(true);
        setMessage("");
      } else {
        setAuthExpired(res.status === 401);
        setError(res.status === 401
          ? "Your session has expired. Sign in again to send your message."
          : res.status === 429
            ? "Too many messages. Please wait a moment and try again."
            : data.error || "Your message could not be sent. Please try again.");
      }
    } catch {
      if (mounted.current) setError("Your message could not be sent. Check your connection and try again.");
    } finally {
      pending.current = false;
      if (mounted.current) setSending(false);
    }
  }

  if (!user) {
    return (
      <Link
        href={signInHref}
        className="flex items-center gap-2 bg-white hover:bg-cream-50 text-navy-600 px-5 py-3 rounded-xl font-semibold shadow-[var(--shadow-card)] transition-colors w-full justify-center"
      >
        <MessageCircle size={18} />
        Sign in to message operator
      </Link>
    );
  }

  if (user.id === operatorId) return <Link href="/messages" className="font-semibold text-gold-700 underline">Open your business inbox</Link>;
  if (user.emailVerified === false) return <p className="text-sm text-navy-600"><Link href={`/auth/verify-email${returnPath ? `?next=${encodeURIComponent(returnPath)}` : ""}`} className="font-semibold text-gold-700 underline">Verify your email</Link> before messaging this business.</p>;

  if (sent) {
    return (
      <div role="status" className="bg-teal-50 text-teal-700 px-5 py-3 rounded-xl text-sm font-medium text-center">
        Message sent to {operatorName}.{" "}
        <Link href={`/messages?with=${encodeURIComponent(operatorId)}`} className="font-semibold underline">Check your inbox for replies</Link>.
      </div>
    );
  }

  return (
    <div>
      {!open ? (
        <button
          ref={openButton}
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 bg-white hover:bg-cream-50 text-navy-600 px-5 py-3 rounded-xl font-semibold shadow-[var(--shadow-card)] transition-colors w-full justify-center"
        >
          <MessageCircle size={18} />
          Message {operatorName}
        </button>
      ) : (
        <div className="bg-white rounded-xl shadow-[var(--shadow-card)] p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-navy-700">
              Message about {listingTitle}
            </p>
            <button type="button" aria-label="Close message form" disabled={sending} onClick={() => {
              setOpen(false);
              requestAnimationFrame(() => openButton.current?.focus());
            }} className="text-navy-300 hover:text-navy-500 disabled:opacity-50">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleSend}>
            <label htmlFor={messageId} className="block mb-2 text-sm font-medium text-navy-600">Your message</label>
            <textarea
              ref={messageInput}
              id={messageId}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={sending}
              aria-describedby={`${messageId}-notice${error ? ` ${messageId}-error` : ""}`}
              placeholder="Hi, I have a question about this listing..."
              className="w-full px-3 py-2.5 rounded-lg bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none text-sm resize-none focus:ring-2 focus:ring-gold-500/50"
            />
            <p id={`${messageId}-notice`} className="mt-2 text-xs text-navy-400">
              Sending a message does not reserve anything or create a booking. For your safety, phone numbers, emails, and external links are hidden until a booking is confirmed.
            </p>
            {error && <p id={`${messageId}-error`} role="alert" className="mt-2 text-sm text-red-600">{error}{authExpired && <> <Link href={signInHref} className="font-semibold underline">Sign in</Link></>}</p>}
            <button
              type="submit"
              disabled={sending || !message.trim() || message.trim().length > MAX_MESSAGE_LENGTH}
              className="mt-2 w-full bg-gold-700 hover:bg-gold-800 disabled:opacity-50 text-white py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {sending ? "Sending message..." : "Send Message"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
