"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type Message = {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  senderName: string | null;
  senderAvatar: string | null;
  attachmentUrl: string | null;
  attachmentType: string | null;
  isRead: boolean;
  createdAt: string;
  // Optimistic flag
  _optimistic?: boolean;
};

export type Conversation = {
  userId: string;
  name: string;
  lastMessage: string;
  lastDate: string;
  unread: number;
  listingId: string | null;
};

// Notification sound as a short beep data URI
const NOTIFICATION_SOUND =
  "data:audio/wav;base64,UklGRl9vT19teleWQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU" +
  "tvT19" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function playNotificationSound() {
  try {
    // Use AudioContext for a reliable short beep
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = 800;
    oscillator.type = "sine";
    gain.gain.value = 0.15;
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio not available
  }
}

function showBrowserNotification(senderName: string, preview: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification(`New message from ${senderName}`, {
      body: preview.length > 80 ? preview.slice(0, 80) + "..." : preview,
      icon: "/icon-192.png",
      tag: "vakaygo-message",
    });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission();
  }
}

export function useMessages(userId: string | null, activeConvUserId: string | null) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const useSseRef = useRef(true);
  const activeConvRef = useRef(activeConvUserId);

  // Keep ref in sync
  activeConvRef.current = activeConvUserId;

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/messages");
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations || []);
      const total = (data.conversations || []).reduce(
        (sum: number, c: Conversation) => sum + c.unread,
        0
      );
      setUnreadCount(total);
    } catch {
      // silent
    } finally {
      setLoadingConversations(false);
    }
  }, [userId]);

  // Fetch messages for active conversation
  const fetchMessages = useCallback(
    async (withUserId: string) => {
      if (!userId) return;
      setLoadingMessages(true);
      try {
        const res = await fetch(`/api/messages?with=${withUserId}`);
        if (!res.ok) return;
        const data = await res.json();
        setMessages(data.messages || []);
      } catch {
        // silent
      } finally {
        setLoadingMessages(false);
      }
    },
    [userId]
  );

  // Send a message (optimistic)
  const sendMessage = useCallback(
    async (
      receiverId: string,
      content: string,
      opts?: { attachmentUrl?: string; attachmentType?: string; listingId?: string; bookingId?: string }
    ) => {
      if (!userId) return;

      const optimisticId = `opt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const optimisticMsg: Message = {
        id: optimisticId,
        content,
        senderId: userId,
        receiverId,
        senderName: null,
        senderAvatar: null,
        attachmentUrl: opts?.attachmentUrl || null,
        attachmentType: opts?.attachmentType || null,
        isRead: false,
        createdAt: new Date().toISOString(),
        _optimistic: true,
      };

      // Optimistic update
      setMessages((prev) => [...prev, optimisticMsg]);

      // Update conversation list preview
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.userId === receiverId
            ? { ...c, lastMessage: content, lastDate: new Date().toISOString() }
            : c
        );
        updated.sort(
          (a, b) =>
            new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()
        );
        return updated;
      });

      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receiverId,
            content,
            listingId: opts?.listingId,
            bookingId: opts?.bookingId,
            attachmentUrl: opts?.attachmentUrl,
            attachmentType: opts?.attachmentType,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          // Replace optimistic message with confirmed one
          setMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticId
                ? { ...m, id: data.message.id, _optimistic: false }
                : m
            )
          );
        } else {
          // Remove failed optimistic message
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        }
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
    },
    [userId]
  );

  // Mark messages as read
  const markAsRead = useCallback(
    async (withUserId: string) => {
      if (!userId) return;
      try {
        // Fetching messages with a specific user auto-marks as read on the server
        await fetch(`/api/messages?with=${withUserId}`);
        // Update local unread counts
        setConversations((prev) =>
          prev.map((c) => (c.userId === withUserId ? { ...c, unread: 0 } : c))
        );
        setUnreadCount((prev) => {
          const conv = conversations.find((c) => c.userId === withUserId);
          return Math.max(0, prev - (conv?.unread || 0));
        });
      } catch {
        // silent
      }
    },
    [userId, conversations]
  );

  // SSE connection
  const connectSSE = useCallback(() => {
    if (!userId || !useSseRef.current) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource("/api/messages/stream");
    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    });

    es.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "new_message") {
          const msg = data.message as Message;

          // Update messages if this conversation is active
          if (
            activeConvRef.current === msg.senderId ||
            activeConvRef.current === msg.receiverId
          ) {
            setMessages((prev) => {
              // Avoid duplicates
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }

          // Update conversation list
          setConversations((prev) => {
            const existingIdx = prev.findIndex(
              (c) => c.userId === msg.senderId
            );
            if (existingIdx >= 0) {
              const updated = [...prev];
              updated[existingIdx] = {
                ...updated[existingIdx],
                lastMessage: msg.content,
                lastDate: msg.createdAt,
                unread:
                  activeConvRef.current === msg.senderId
                    ? updated[existingIdx].unread
                    : updated[existingIdx].unread + 1,
              };
              updated.sort(
                (a, b) =>
                  new Date(b.lastDate).getTime() -
                  new Date(a.lastDate).getTime()
              );
              return updated;
            }
            // New conversation
            return [
              {
                userId: msg.senderId,
                name: msg.senderName || "User",
                lastMessage: msg.content,
                lastDate: msg.createdAt,
                unread: activeConvRef.current === msg.senderId ? 0 : 1,
                listingId: null,
              },
              ...prev,
            ];
          });

          // Update unread count (only if not viewing that conversation)
          if (activeConvRef.current !== msg.senderId) {
            setUnreadCount((prev) => prev + 1);
          }

          // Browser notification + sound (only for messages from others)
          if (msg.senderId !== userId) {
            playNotificationSound();
            showBrowserNotification(
              msg.senderName || "Someone",
              msg.content
            );
          }
        } else if (data.type === "message_read") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === data.messageId ? { ...m, isRead: true } : m
            )
          );
        }
      } catch {
        // parse error
      }
    });

    es.addEventListener("heartbeat", () => {
      // Keep-alive, no action needed
    });

    es.addEventListener("reconnect", () => {
      es.close();
      // Reconnect immediately on server-side timeout
      setTimeout(connectSSE, 500);
    });

    es.onerror = () => {
      setIsConnected(false);
      es.close();

      // Exponential backoff
      const attempt = reconnectAttemptsRef.current++;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);

      // After 5 failed attempts, fall back to polling
      if (attempt >= 5) {
        useSseRef.current = false;
        startPolling();
        return;
      }

      reconnectTimeoutRef.current = setTimeout(connectSSE, delay);
    };
  }, [userId]);

  // Polling fallback
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return;
    pollIntervalRef.current = setInterval(() => {
      fetchConversations();
      if (activeConvRef.current) {
        fetchMessages(activeConvRef.current);
      }
    }, 5000);
  }, [fetchConversations, fetchMessages]);

  // Initial data load
  useEffect(() => {
    if (!userId) return;
    fetchConversations();
  }, [userId, fetchConversations]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConvUserId) {
      setMessages([]);
      return;
    }
    fetchMessages(activeConvUserId);
    markAsRead(activeConvUserId);
  }, [activeConvUserId, fetchMessages, markAsRead]);

  // SSE connection lifecycle
  useEffect(() => {
    if (!userId) return;

    connectSSE();

    // Request notification permission
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [userId, connectSSE]);

  return {
    conversations,
    messages,
    unreadCount,
    isConnected,
    loadingConversations,
    loadingMessages,
    sendMessage,
    markAsRead,
    fetchConversations,
    fetchMessages,
  };
}
