"use client";

import { useState, useEffect, useCallback } from "react";
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

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/messages");
      if (!res.ok) return;
      const data = await res.json();
      const total = (data.conversations || []).reduce(
        (sum: number, c: { unread: number }) => sum + c.unread,
        0
      );
      setUnreadCount(total);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

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
