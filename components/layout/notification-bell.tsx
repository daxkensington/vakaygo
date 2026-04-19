"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarCheck,
  Star,
  MessageSquare,
  Info,
} from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

const typeConfig: Record<
  string,
  { icon: typeof Bell; color: string; bg: string }
> = {
  booking: { icon: CalendarCheck, color: "text-gold-700", bg: "bg-gold-50" },
  review: { icon: Star, color: "text-gold-700", bg: "bg-gold-50" },
  message: { icon: MessageSquare, color: "text-teal-500", bg: "bg-teal-50" },
  system: { icon: Info, color: "text-navy-500", bg: "bg-navy-50" },
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell({ scrolled, isLanding }: { scrolled: boolean; isLanding: boolean }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close dropdown on Escape key
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  async function markAllRead() {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  }

  async function handleClick(notification: Notification) {
    // Mark as read
    if (!notification.isRead) {
      fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [notification.id] }),
      }).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (notification.link) {
      router.push(notification.link);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`relative p-2 rounded-full transition-colors hover:bg-gold-50 ${
          scrolled || !isLanding ? "text-navy-500" : "text-white/80"
        }`}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] max-h-96 overflow-hidden z-50 border border-cream-100">
          <div className="flex items-center justify-between px-4 py-3 border-b border-cream-100">
            <span className="text-sm font-semibold text-navy-700">
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-gold-700 hover:text-gold-600 font-medium transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="overflow-y-auto max-h-[calc(24rem-3rem)]">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-navy-400">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => {
                const config = typeConfig[n.type] || typeConfig.system;
                const Icon = config.icon;
                return (
                  <button
                    key={n.id}
                    role="menuitem"
                    onClick={() => handleClick(n)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-cream-50 transition-colors ${
                      !n.isRead ? "bg-gold-50/30" : ""
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${config.bg}`}
                    >
                      <Icon size={16} className={config.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm truncate ${
                            !n.isRead
                              ? "font-semibold text-navy-700"
                              : "font-medium text-navy-600"
                          }`}
                        >
                          {n.title}
                        </span>
                        {!n.isRead && (
                          <span className="flex-shrink-0 w-2 h-2 bg-gold-500 rounded-full" />
                        )}
                      </div>
                      {n.body && (
                        <p className="text-xs text-navy-400 mt-0.5 truncate">
                          {n.body}
                        </p>
                      )}
                      <span className="text-[11px] text-navy-300 mt-1 block">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
