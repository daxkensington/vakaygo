"use client";

import { useEffect, useRef, useState } from "react";
import { Header } from "@/components/layout/header";
import { useAuth } from "@/lib/auth-context";
import { useMessages, type Message } from "@/lib/use-messages";
import Link from "next/link";
import Image from "next/image";
import {
  MessageCircle,
  Send,
  Loader2,
  ArrowLeft,
  Paperclip,
  Check,
  CheckCheck,
  Image as ImageIcon,
  File,
  X,
  Wifi,
  WifiOff,
  Globe,
  FileText,
  ChevronDown,
} from "lucide-react";

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) return formatTime(dateStr);
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentType, setAttachmentType] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; title: string; content: string }[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    conversations,
    messages,
    unreadCount,
    isConnected,
    loadingConversations,
    loadingMessages,
    sendMessage,
    markAsRead,
  } = useMessages(user?.id || null, activeConv);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [newMessage]);

  // Mark as read when switching conversation
  useEffect(() => {
    if (activeConv) {
      markAsRead(activeConv);
    }
  }, [activeConv, markAsRead]);

  // Poll typing indicator
  useEffect(() => {
    if (!activeConv) return;
    let cancelled = false;

    async function pollTyping() {
      try {
        const res = await fetch(`/api/messages/typing?conversationWith=${activeConv}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPartnerTyping(!!data.isTyping);
      } catch {
        // silently fail
      }
    }

    pollTyping();
    const interval = setInterval(pollTyping, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeConv]);

  // Fetch operator templates (only if user is an operator)
  useEffect(() => {
    if (templatesLoaded) return;
    fetch("/api/operator/message-templates")
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data?.templates) {
          setTemplates(data.templates);
        }
        setTemplatesLoaded(true);
      })
      .catch(() => setTemplatesLoaded(true));
  }, [templatesLoaded]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if ((!newMessage.trim() && !attachmentUrl) || !activeConv) return;
    setSending(true);

    try {
      await sendMessage(activeConv, newMessage, {
        attachmentUrl: attachmentUrl || undefined,
        attachmentType: attachmentType || undefined,
      });
      setNewMessage("");
      setAttachmentUrl(null);
      setAttachmentType(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } finally {
      setSending(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      setAttachmentUrl(data.url);
      setAttachmentType(file.type.startsWith("image/") ? "image" : "file");
    } catch {
      // Upload failed silently
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
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
          <h1 className="text-2xl font-bold text-navy-700">
            Sign in to view messages
          </h1>
          <Link
            href="/auth/signin"
            className="mt-6 bg-gold-700 text-white px-6 py-3 rounded-xl font-semibold"
          >
            Sign In
          </Link>
        </div>
      </>
    );
  }

  const activeConvData = conversations.find((c) => c.userId === activeConv);

  return (
    <>
      <Header />
      <div className="pt-20 bg-cream-50 min-h-screen">
        <div className="mx-auto max-w-5xl px-4 md:px-6 py-6 md:py-8">
          {/* Header row */}
          <div className="flex items-center justify-between mb-6">
            <h1
              className="text-2xl font-bold text-navy-700"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Messages
            </h1>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <Wifi size={12} />
                  Live
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-navy-300">
                  <WifiOff size={12} />
                  Offline
                </span>
              )}
              {unreadCount > 0 && (
                <span className="bg-gold-700 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>
          </div>

          <div
            className="bg-white rounded-2xl shadow-[var(--shadow-card)] overflow-hidden"
            style={{ minHeight: "560px" }}
          >
            <div className="flex h-full" style={{ minHeight: "560px" }}>
              {/* Conversation List (left sidebar) */}
              <div
                className={`w-full md:w-80 border-r border-cream-200 flex flex-col ${
                  activeConv ? "hidden md:flex" : "flex"
                }`}
              >
                <div className="p-4 border-b border-cream-100">
                  <p className="text-xs font-medium text-navy-400 uppercase tracking-wide">
                    Conversations
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {loadingConversations ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2
                        size={24}
                        className="animate-spin text-gold-500"
                      />
                    </div>
                  ) : conversations.length === 0 ? (
                    <div className="p-8 text-center">
                      <MessageCircle
                        size={32}
                        className="text-navy-200 mx-auto mb-3"
                      />
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
                            activeConv === conv.userId
                              ? "bg-gold-50/50"
                              : ""
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gold-100 rounded-full flex items-center justify-center text-gold-700 font-bold text-sm shrink-0">
                              {conv.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p
                                  className={`text-sm truncate ${
                                    conv.unread > 0
                                      ? "font-bold text-navy-700"
                                      : "font-semibold text-navy-700"
                                  }`}
                                >
                                  {conv.name}
                                </p>
                                <span className="text-[10px] text-navy-300 shrink-0 ml-2">
                                  {formatDate(conv.lastDate)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between mt-0.5">
                                <p
                                  className={`text-xs truncate ${
                                    conv.unread > 0
                                      ? "text-navy-600 font-medium"
                                      : "text-navy-400"
                                  }`}
                                >
                                  {conv.lastMessage}
                                </p>
                                {conv.unread > 0 && (
                                  <span className="w-5 h-5 bg-gold-700 text-white text-[10px] rounded-full flex items-center justify-center shrink-0 ml-2">
                                    {conv.unread}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Message Thread (right panel) */}
              <div
                className={`flex-1 flex flex-col ${
                  !activeConv ? "hidden md:flex" : "flex"
                }`}
              >
                {activeConv ? (
                  <>
                    {/* Thread Header */}
                    <div className="p-4 border-b border-cream-200 flex items-center gap-3">
                      <button
                        onClick={() => setActiveConv(null)}
                        className="md:hidden text-navy-400 hover:text-navy-600 transition-colors"
                      >
                        <ArrowLeft size={20} />
                      </button>
                      <div className="w-9 h-9 bg-gold-100 rounded-full flex items-center justify-center text-gold-700 font-bold text-xs shrink-0">
                        {activeConvData?.name?.charAt(0) || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-navy-700 text-sm truncate">
                          {activeConvData?.name || "User"}
                        </p>
                        {partnerTyping && (
                          <p className="text-[11px] text-teal-600 flex items-center gap-1">
                            <span className="flex gap-0.5">
                              <span className="w-1 h-1 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="w-1 h-1 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                              <span className="w-1 h-1 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                            </span>
                            is typing
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 p-4 overflow-y-auto space-y-3">
                      {loadingMessages ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2
                            size={24}
                            className="animate-spin text-gold-500"
                          />
                        </div>
                      ) : messages.length === 0 ? (
                        <div className="flex items-center justify-center py-12 text-center">
                          <div>
                            <MessageCircle
                              size={32}
                              className="text-navy-200 mx-auto mb-2"
                            />
                            <p className="text-navy-400 text-sm">
                              No messages yet
                            </p>
                            <p className="text-navy-300 text-xs">
                              Send a message to start the conversation
                            </p>
                          </div>
                        </div>
                      ) : (
                        messages.map((msg) => (
                          <MessageBubble
                            key={msg.id}
                            msg={msg}
                            isOwn={msg.senderId === user.id}
                          />
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Attachment preview */}
                    {attachmentUrl && (
                      <div className="px-4 py-2 border-t border-cream-100 bg-cream-50/50">
                        <div className="flex items-center gap-2">
                          {attachmentType === "image" ? (
                            <div className="relative w-16 h-16 rounded-lg overflow-hidden">
                              <Image
                                src={attachmentUrl}
                                alt="Attachment"
                                fill
                                className="object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-navy-500">
                              <File size={16} />
                              <span className="truncate max-w-[200px]">
                                File attached
                              </span>
                            </div>
                          )}
                          <button
                            onClick={() => {
                              setAttachmentUrl(null);
                              setAttachmentType(null);
                            }}
                            className="ml-auto text-navy-400 hover:text-red-500 transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Input Area */}
                    {/* Typing indicator in messages area */}
                    {partnerTyping && (
                      <div className="px-4 pb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-gold-100 rounded-full flex items-center justify-center text-gold-700 font-bold text-[10px] shrink-0">
                            {activeConvData?.name?.charAt(0) || "?"}
                          </div>
                          <div className="bg-cream-100 rounded-2xl rounded-bl-sm px-4 py-2.5">
                            <div className="flex gap-1">
                              <span className="w-1.5 h-1.5 bg-navy-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="w-1.5 h-1.5 bg-navy-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                              <span className="w-1.5 h-1.5 bg-navy-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <form
                      onSubmit={handleSend}
                      className="p-4 border-t border-cream-200"
                    >
                      {/* Template Picker */}
                      {templates.length > 0 && showTemplates && (
                        <div className="mb-3 bg-cream-50 rounded-xl p-2 max-h-40 overflow-y-auto">
                          <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-wide px-2 py-1">
                            Quick Replies
                          </p>
                          {templates.map((tpl) => (
                            <button
                              key={tpl.id}
                              type="button"
                              onClick={() => {
                                setNewMessage(tpl.content);
                                setShowTemplates(false);
                                textareaRef.current?.focus();
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-cream-100 rounded-lg transition-colors"
                            >
                              <p className="text-xs font-semibold text-navy-700">{tpl.title}</p>
                              <p className="text-xs text-navy-400 truncate">{tpl.content}</p>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex items-end gap-2">
                        {/* Template button (operators only) */}
                        {templates.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowTemplates(!showTemplates)}
                            className={`p-2.5 transition-colors shrink-0 ${
                              showTemplates
                                ? "text-gold-500"
                                : "text-navy-400 hover:text-gold-500"
                            }`}
                            aria-label="Message templates"
                          >
                            <FileText size={18} />
                          </button>
                        )}

                        {/* Attach button */}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          className="p-2.5 text-navy-400 hover:text-gold-500 transition-colors shrink-0 disabled:opacity-40"
                          aria-label="Attach file"
                        >
                          {uploading ? (
                            <Loader2
                              size={18}
                              className="animate-spin"
                            />
                          ) : (
                            <Paperclip size={18} />
                          )}
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,.pdf,.doc,.docx"
                          onChange={handleFileUpload}
                          className="hidden"
                        />

                        {/* Textarea */}
                        <div className="flex-1 relative">
                          <textarea
                            ref={textareaRef}
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Type a message..."
                            rows={1}
                            maxLength={2000}
                            className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none text-sm resize-none overflow-hidden"
                            style={{ minHeight: "44px", maxHeight: "120px" }}
                          />
                          {/* Character count */}
                          {newMessage.length > 1500 && (
                            <span
                              className={`absolute bottom-1 right-2 text-[10px] ${
                                newMessage.length > 1900
                                  ? "text-red-400"
                                  : "text-navy-300"
                              }`}
                            >
                              {newMessage.length}/2000
                            </span>
                          )}
                        </div>

                        {/* Send button */}
                        <button
                          type="submit"
                          disabled={
                            sending ||
                            (!newMessage.trim() && !attachmentUrl)
                          }
                          className="bg-gold-700 hover:bg-gold-800 disabled:opacity-40 text-white p-3 rounded-xl transition-colors shrink-0"
                        >
                          <Send size={18} />
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-center p-8">
                    <div>
                      <MessageCircle
                        size={40}
                        className="text-navy-200 mx-auto mb-3"
                      />
                      <p className="text-navy-400">Select a conversation</p>
                      <p className="text-navy-300 text-xs mt-1">
                        Choose from your conversations to start chatting
                      </p>
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

function MessageBubble({ msg, isOwn }: { msg: Message; isOwn: boolean }) {
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  async function handleTranslate() {
    if (translatedText) {
      setTranslatedText(null);
      return;
    }
    if (!msg.content) return;
    setTranslating(true);
    try {
      const res = await fetch("/api/messages/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: msg.id, text: msg.content }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setTranslatedText(data.translatedText || null);
    } catch {
      // silently fail
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} group`}>
      {/* Avatar for received messages */}
      {!isOwn && (
        <div className="w-7 h-7 bg-gold-100 rounded-full flex items-center justify-center text-gold-700 font-bold text-[10px] shrink-0 mt-1 mr-2">
          {msg.senderName?.charAt(0) || "?"}
        </div>
      )}

      <div className="max-w-[75%]">
        {/* Attachment */}
        {msg.attachmentUrl && (
          <div className="mb-1">
            {msg.attachmentType === "image" ? (
              <div className="relative rounded-xl overflow-hidden max-w-[280px]">
                <Image
                  src={msg.attachmentUrl}
                  alt="Shared image"
                  width={280}
                  height={200}
                  className="object-cover rounded-xl"
                />
              </div>
            ) : (
              <a
                href={msg.attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs ${
                  isOwn
                    ? "bg-gold-600 text-white/90"
                    : "bg-cream-200 text-navy-600"
                }`}
              >
                <File size={14} />
                <span>View attachment</span>
              </a>
            )}
          </div>
        )}

        {/* Message text */}
        {msg.content && (
          <div className="relative">
            <div
              className={`px-4 py-2.5 rounded-2xl text-sm ${
                isOwn
                  ? "bg-gold-700 text-white rounded-br-sm"
                  : "bg-cream-100 text-navy-700 rounded-bl-sm"
              } ${msg._optimistic ? "opacity-70" : ""}`}
            >
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
            </div>

            {/* Translate button */}
            <button
              onClick={handleTranslate}
              disabled={translating}
              className={`absolute -bottom-1 ${isOwn ? "left-0 -translate-x-full mr-1" : "right-0 translate-x-full ml-1"} opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-cream-100 text-navy-300 hover:text-teal-600 disabled:opacity-40`}
              title={translatedText ? "Hide translation" : "Translate"}
            >
              {translating ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Globe size={12} />
              )}
            </button>

            {/* Translated text */}
            {translatedText && (
              <div
                className={`mt-1 px-4 py-2 rounded-xl text-xs italic ${
                  isOwn
                    ? "bg-gold-400/50 text-white/90"
                    : "bg-teal-50 text-teal-700"
                }`}
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <Globe size={10} />
                  <span className="font-semibold text-[10px] not-italic">Translated</span>
                </div>
                <p className="whitespace-pre-wrap break-words">{translatedText}</p>
              </div>
            )}
          </div>
        )}

        {/* Timestamp + read status */}
        <div
          className={`flex items-center gap-1 mt-1 ${
            isOwn ? "justify-end" : "justify-start"
          }`}
        >
          <span
            className={`text-[10px] ${
              isOwn ? "text-navy-300" : "text-navy-300"
            }`}
          >
            {formatTime(msg.createdAt)}
          </span>
          {isOwn && (
            <span className="text-navy-300">
              {msg.isRead ? (
                <CheckCheck size={12} className="text-gold-500" />
              ) : (
                <Check size={12} />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
