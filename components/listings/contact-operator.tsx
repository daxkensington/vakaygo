"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { MessageCircle, Send, Loader2, X } from "lucide-react";

type ContactOperatorProps = {
  operatorId: string;
  operatorName: string;
  listingId: string;
  listingTitle: string;
};

export function ContactOperator({ operatorId, operatorName, listingId, listingTitle }: ContactOperatorProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || !user) return;
    setSending(true);

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: operatorId,
          content: message,
          listingId,
        }),
      });

      if (res.ok) {
        setSent(true);
        setMessage("");
      }
    } catch {
      // handle error
    } finally {
      setSending(false);
    }
  }

  if (!user) {
    return (
      <a
        href="/auth/signin"
        className="flex items-center gap-2 bg-white hover:bg-cream-50 text-navy-600 px-5 py-3 rounded-xl font-semibold shadow-[var(--shadow-card)] transition-colors w-full justify-center"
      >
        <MessageCircle size={18} />
        Sign in to message operator
      </a>
    );
  }

  if (sent) {
    return (
      <div className="bg-teal-50 text-teal-700 px-5 py-3 rounded-xl text-sm font-medium text-center">
        Message sent to {operatorName}! They&apos;ll reply in your inbox.
      </div>
    );
  }

  return (
    <div>
      {!open ? (
        <button
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
            <button onClick={() => setOpen(false)} className="text-navy-300 hover:text-navy-500">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleSend}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Hi, I have a question about this listing..."
              className="w-full px-3 py-2.5 rounded-lg bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none text-sm resize-none focus:ring-2 focus:ring-gold-500/50"
            />
            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="mt-2 w-full bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-white py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send Message
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
