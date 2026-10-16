"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";

export function MessageBadge({
  scrolled,
  isLanding,
}: {
  scrolled: boolean;
  isLanding: boolean;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const refresh = () => {
      fetch("/api/messages", { signal: controller.signal })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!current || !data) return;
          const total = (data.conversations || []).reduce((sum: number, conversation: { unread: number }) => sum + conversation.unread, 0);
          setUnreadCount(total);
        }).catch(() => {});
    };
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => { current = false; controller.abort(); clearInterval(interval); };
  }, []);

  // Listen for SSE-driven unread updates
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setUnreadCount(e.detail.count);
    };
    window.addEventListener(
      "vakaygo:unread-messages" as string,
      handler as EventListener
    );
    return () =>
      window.removeEventListener(
        "vakaygo:unread-messages" as string,
        handler as EventListener
      );
  }, []);

  return (
    <button
      onClick={() => router.push("/messages")}
      className={`relative p-2 rounded-full transition-colors hover:bg-gold-50 ${
        scrolled || !isLanding ? "text-navy-500" : "text-white/80"
      }`}
      aria-label={`Messages${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
    >
      <Mail size={20} />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-gold-700 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
