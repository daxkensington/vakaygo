"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import {
  MessageCircle,
  Send,
  Loader2,
  ArrowLeft,
  User,
} from "lucide-react";

type Conversation = {
  userId: string;
  name: string;
  lastMessage: string;
  lastDate: string;
  unread: number;
  listingId: string | null;
};

type Message = {
  id: string;
  content: string;
  senderId: string;
  senderName: string | null;
  isRead: boolean;
  createdAt: string;
};

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch("/api/messages")
      .then((r) => r.json())
      .then((data) => setConversations(data.conversations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!activeConv) return;
    fetch(`/api/messages?with=${activeConv}`)
      .then((r) => r.json())
      .then((data) => setMessages(data.messages || []))
      .catch(() => {});
  }, [activeConv]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !activeConv) return;
    setSending(true);

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId: activeConv, content: newMessage }),
      });
      if (res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            content: newMessage,
            senderId: user!.id,
            senderName: user!.name,
            isRead: false,
            createdAt: new Date().toISOString(),
          },
        ]);
        setNewMessage("");
      }
    } catch {
      // handle error
    } finally {
      setSending(false);
    }
  }

  if (authLoading) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center bg-cream-50">
          <Loader2 size={32} className="animate-spin text-gold-500" />
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex flex-col items-center justify-center bg-cream-50 px-6 pt-20">
          <MessageCircle size={48} className="text-navy-200 mb-6" />
          <h1 className="text-2xl font-bold text-navy-700">Sign in to view messages</h1>
          <Link href="/auth/signin" className="mt-6 bg-gold-500 text-white px-6 py-3 rounded-xl font-semibold">
            Sign In
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="pt-20 bg-cream-50 min-h-screen">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <h1 className="text-2xl font-bold text-navy-700 mb-6" style={{ fontFamily: "var(--font-display)" }}>
            Messages
          </h1>

          <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] overflow-hidden" style={{ minHeight: "500px" }}>
            <div className="flex h-full" style={{ minHeight: "500px" }}>
              {/* Conversation List */}
              <div className={`w-full md:w-80 border-r border-cream-200 ${activeConv ? "hidden md:block" : ""}`}>
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 size={24} className="animate-spin text-gold-500" />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="p-8 text-center">
                    <MessageCircle size={32} className="text-navy-200 mx-auto mb-3" />
                    <p className="text-navy-400 text-sm">No messages yet</p>
                    <p className="text-navy-300 text-xs mt-1">
                      Messages with operators will appear here
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-cream-100">
                    {conversations.map((conv) => (
                      <button
                        key={conv.userId}
                        onClick={() => setActiveConv(conv.userId)}
                        className={`w-full p-4 text-left hover:bg-cream-50 transition-colors ${
                          activeConv === conv.userId ? "bg-cream-50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gold-100 rounded-full flex items-center justify-center text-gold-600 font-bold text-sm shrink-0">
                            {conv.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="font-semibold text-navy-700 text-sm truncate">
                                {conv.name}
                              </p>
                              {conv.unread > 0 && (
                                <span className="w-5 h-5 bg-gold-500 text-white text-xs rounded-full flex items-center justify-center shrink-0">
                                  {conv.unread}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-navy-400 truncate mt-0.5">
                              {conv.lastMessage}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Message Thread */}
              <div className={`flex-1 flex flex-col ${!activeConv ? "hidden md:flex" : "flex"}`}>
                {activeConv ? (
                  <>
                    {/* Thread Header */}
                    <div className="p-4 border-b border-cream-200 flex items-center gap-3">
                      <button
                        onClick={() => setActiveConv(null)}
                        className="md:hidden text-navy-400"
                      >
                        <ArrowLeft size={20} />
                      </button>
                      <div className="w-8 h-8 bg-gold-100 rounded-full flex items-center justify-center text-gold-600 font-bold text-xs">
                        {conversations.find((c) => c.userId === activeConv)?.name?.charAt(0) || "?"}
                      </div>
                      <p className="font-semibold text-navy-700 text-sm">
                        {conversations.find((c) => c.userId === activeConv)?.name || "User"}
                      </p>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 p-4 overflow-y-auto space-y-3">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.senderId === user.id ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                              msg.senderId === user.id
                                ? "bg-gold-500 text-white rounded-br-sm"
                                : "bg-cream-100 text-navy-700 rounded-bl-sm"
                            }`}
                          >
                            <p>{msg.content}</p>
                            <p
                              className={`text-[10px] mt-1 ${
                                msg.senderId === user.id ? "text-white/60" : "text-navy-300"
                              }`}
                            >
                              {new Date(msg.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Input */}
                    <form onSubmit={handleSend} className="p-4 border-t border-cream-200">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder="Type a message..."
                          className="flex-1 px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none text-sm"
                        />
                        <button
                          type="submit"
                          disabled={sending || !newMessage.trim()}
                          className="bg-gold-500 hover:bg-gold-600 disabled:opacity-40 text-white px-4 py-3 rounded-xl transition-colors"
                        >
                          <Send size={18} />
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-center p-8">
                    <div>
                      <MessageCircle size={40} className="text-navy-200 mx-auto mb-3" />
                      <p className="text-navy-400">Select a conversation</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
