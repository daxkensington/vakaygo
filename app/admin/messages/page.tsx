"use client";

import { useEffect, useState } from "react";
import {
  MessageSquare,
  Mail,
  MailOpen,
  CalendarClock,
  MessagesSquare,
  Loader2,
  Search,
} from "lucide-react";

type Message = {
  id: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  senderName: string | null;
  senderEmail: string;
  receiverName: string | null;
  receiverEmail: string;
  listingId: string | null;
  listingTitle: string | null;
};

type Stats = {
  total: number;
  unread: number;
  today: number;
  activeConversations: number;
};

type MessagesResponse = {
  stats: Stats;
  messages: Message[];
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / (1000 * 60 * 60);

  if (diffH < 1) {
    const mins = Math.floor(diffMs / (1000 * 60));
    return `${mins}m ago`;
  }
  if (diffH < 24) {
    return `${Math.floor(diffH)}h ago`;
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function truncate(str: string, len: number) {
  if (str.length <= len) return str;
  return str.slice(0, len) + "...";
}

const statCards = [
  {
    label: "Total Messages",
    key: "total" as const,
    icon: MessageSquare,
    color: "text-navy-600",
    bg: "bg-navy-50",
  },
  {
    label: "Unread",
    key: "unread" as const,
    icon: Mail,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    label: "Today",
    key: "today" as const,
    icon: CalendarClock,
    color: "text-green-600",
    bg: "bg-green-50",
  },
  {
    label: "Active Conversations",
    key: "activeConversations" as const,
    icon: MessagesSquare,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
];

export default function AdminMessagesPage() {
  const [data, setData] = useState<MessagesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/messages")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <MessageSquare className="h-7 w-7 text-gold-500" />
        <h1
          className="text-3xl font-bold text-navy-700"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Messages
        </h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
        </div>
      ) : !data ? (
        <div className="py-20 text-center">
          <Search className="mx-auto mb-3 h-10 w-10 text-navy-200" />
          <p className="text-navy-400">Failed to load messages</p>
        </div>
      ) : (
        <>
          {/* Stats Row */}
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {statCards.map((card) => (
              <div
                key={card.key}
                className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.bg}`}
                  >
                    <card.icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-navy-700">
                  {data.stats[card.key].toLocaleString()}
                </p>
                <p className="text-sm text-navy-400 mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Messages Table */}
          <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
            <div className="px-6 py-4 border-b border-cream-200">
              <h2
                className="text-lg font-bold text-navy-700"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Recent Messages
              </h2>
            </div>

            {data.messages.length === 0 ? (
              <div className="py-20 text-center">
                <MailOpen className="mx-auto mb-3 h-10 w-10 text-navy-200" />
                <p className="text-navy-400">No messages yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-200 bg-cream-50">
                      <th className="px-4 py-3 text-left font-semibold text-navy-500">
                        From
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-navy-500">
                        To
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-navy-500">
                        Message
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-navy-500">
                        Listing
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-navy-500">
                        Read
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-navy-500">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.messages.map((msg) => (
                      <tr
                        key={msg.id}
                        className="border-b border-cream-100 transition-colors hover:bg-cream-50"
                      >
                        <td className="px-4 py-3">
                          <div className="text-navy-700 font-medium">
                            {msg.senderName ?? "--"}
                          </div>
                          <div className="text-xs text-navy-400">
                            {msg.senderEmail}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-navy-700 font-medium">
                            {msg.receiverName ?? "--"}
                          </div>
                          <div className="text-xs text-navy-400">
                            {msg.receiverEmail}
                          </div>
                        </td>
                        <td className="max-w-[260px] px-4 py-3 text-navy-600">
                          {truncate(msg.content, 60)}
                        </td>
                        <td className="max-w-[180px] truncate px-4 py-3 text-navy-500">
                          {msg.listingTitle ?? (
                            <span className="text-navy-300">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full ${
                              msg.isRead ? "bg-green-500" : "bg-amber-500"
                            }`}
                            title={msg.isRead ? "Read" : "Unread"}
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-navy-400">
                          {formatTime(msg.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
