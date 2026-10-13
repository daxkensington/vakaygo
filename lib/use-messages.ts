"use client";

import { useState, useEffect, useRef, useCallback } from "react";
export type Message = { id: string; content: string; senderId: string; receiverId: string; senderName: string | null; senderAvatar: string | null;
  attachmentUrl: string | null; attachmentType: string | null; isRead: boolean; createdAt: string; listingId?: string | null; _optimistic?: boolean };
export type Conversation = { userId: string; name: string; lastMessage: string; lastDate: string; unread: number; listingId: string | null };
type SendOptions = { attachmentUrl?: string; attachmentType?: string; listingId?: string; bookingId?: string };

export function useMessages(userId: string | null, activeConvUserId: string | null) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(Boolean(userId));
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const identity = useRef(userId), active = useRef(activeConvUserId);
  identity.current = userId; active.current = activeConvUserId;
  const [dataIdentity, setDataIdentity] = useState(userId);
  const conversationRequest = useRef(0), threadRequest = useRef(0);
  const pendingConversations = useRef<number | null>(null);
  const pendingThread = useRef<{ sequence: number; userId: string; partnerId: string } | null>(null);
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const flight = useRef<{ signature: string; promise: Promise<void> } | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!userId) return;
    const sequence = ++conversationRequest.current;
    pendingConversations.current = sequence;
    try {
      const response = await fetch("/api/messages", { cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw Error(response.status === 401 ? "Sign in again to load your messages." : "Conversations could not be loaded. Please try again.");
      const data = await response.json();
      if (identity.current !== userId || sequence !== conversationRequest.current) return;
      setConversations(data.conversations || []); setDataIdentity(userId); setConversationError(null);
    } catch (error) {
      if (identity.current === userId && sequence === conversationRequest.current) setConversationError(error instanceof Error ? error.message : "Conversations could not be loaded. Please try again.");
    } finally {
      if (pendingConversations.current === sequence) pendingConversations.current = null;
      if (identity.current === userId && sequence === conversationRequest.current) setLoadingConversations(false);
    }
  }, [userId]);

  const fetchMessages = useCallback(async (partnerId: string) => {
    if (!userId) return;
    const sequence = ++threadRequest.current;
    pendingThread.current = { sequence, userId, partnerId };
    setLoadingMessages(true); setMessageError(null);
    const current = () => identity.current === userId && active.current === partnerId && sequence === threadRequest.current;
    try {
      const response = await fetch(`/api/messages?with=${encodeURIComponent(partnerId)}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw Error(response.status === 401 ? "Sign in again to load this conversation." : "This conversation could not be loaded. Please try again.");
      const data = await response.json();
      if (!current()) return;
      const rows: Message[] = data.messages || [];
      setMessages(rows); setDataIdentity(userId);
      const readIds = rows.filter(row => row.receiverId === userId && !row.isRead).map(row => row.id);
      if (readIds.length) {
        const acknowledged = await fetch("/api/messages", { method: "PATCH", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ with: partnerId, messageIds: readIds }) });
        if (!acknowledged.ok) throw Error("The conversation loaded, but its read status could not be updated. Please retry.");
        const ack = await acknowledged.json();
        if (!current()) return;
        setMessages(prev => prev.map(row => ack.readIds?.includes(row.id) ? { ...row, isRead: true } : row));
      }
      if (current() && pendingConversations.current === null) void fetchConversations();
    } catch (error) {
      if (current()) setMessageError(error instanceof Error ? error.message : "This conversation could not be loaded. Please try again.");
    } finally {
      if (pendingThread.current?.sequence === sequence) pendingThread.current = null;
      if (current()) setLoadingMessages(false);
    }
  }, [userId, fetchConversations]);

  const sendMessage = useCallback((receiverId: string, content: string, options?: SendOptions): Promise<void> => {
    if (!userId) return Promise.reject(Error("Sign in before sending a message."));
    const signature = JSON.stringify({ userId, receiverId, content: content.trim(), ...options });
    if (flight.current) return flight.current.signature === signature ? flight.current.promise : Promise.reject(Error("Wait for your current message to finish sending."));
    if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
    const clientMessageId = attempt.current.id;
    const promise = (async () => {
      const response = await fetch("/api/messages", { method: "POST", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiverId, content: content.trim(), ...options, clientMessageId }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.message?.id) throw Error(response.status === 401 ? "Your session expired. Sign in again to send your message." : data.error || "Your message could not be sent. Please try again.");
      if (identity.current !== userId) return;
      attempt.current = null;
      // The POST receipt confirms delivery. A background inbox refresh must not
      // keep the composer disabled or turn a delivered message into a failed send.
      if (active.current === receiverId) void fetchMessages(receiverId);
      else void fetchConversations();
    })().catch(error => { throw error instanceof TypeError ? Error("Your message could not be sent. Check your connection and try again.") : error; }).finally(() => { if (flight.current?.promise === promise) flight.current = null; });
    flight.current = { signature, promise };
    return promise;
  }, [userId, fetchMessages, fetchConversations]);

  useEffect(() => {
    setConversations([]); setMessages([]); setDataIdentity(userId); setConversationError(null); setMessageError(null);
    setLoadingConversations(Boolean(userId)); setLoadingMessages(false); attempt.current = null; flight.current = null;
    if (userId) void fetchConversations();
  }, [userId, fetchConversations]);
  useEffect(() => {
    setMessages([]); setMessageError(null);
    if (userId && activeConvUserId) void fetchMessages(activeConvUserId);
    else setLoadingMessages(false);
  }, [userId, activeConvUserId, fetchMessages]);
  useEffect(() => {
    if (!userId) { setIsConnected(false); return; }
    let disposed = false;
    const refresh = () => {
      if (disposed || identity.current !== userId) return;
      // Poll/focus/SSE recovery must let a bounded in-flight read settle rather
      // than repeatedly superseding its timeout and hiding the retry error.
      if (pendingConversations.current === null) void fetchConversations();
      if (active.current && (pendingThread.current?.userId !== userId || pendingThread.current?.partnerId !== active.current)) void fetchMessages(active.current);
    };
    const es = typeof EventSource === "function" ? new EventSource("/api/messages/stream") : null;
    es?.addEventListener("connected", () => { if (!disposed) { setIsConnected(true); refresh(); } });
    es?.addEventListener("message", (event: MessageEvent) => {
      if (disposed || identity.current !== userId) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "new_message" && data.message?.receiverId === userId) refresh();
        if (data.type === "message_read") setMessages(prev => prev.map(row => row.id === data.messageId && row.senderId === userId ? { ...row, isRead: true } : row));
      } catch { /* Invalid stream events cannot change the active thread. */ }
    });
    es?.addEventListener("reconnect", () => { es.close(); if (!disposed) setIsConnected(false); });
    if (es) es.onerror = () => { if (!disposed) setIsConnected(false); };
    // Refresh on reconnection/return and poll as a reliable fallback to SSE.
    const interval = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => { disposed = true; es?.close(); clearInterval(interval); window.removeEventListener("focus", refresh); setIsConnected(false); };
  }, [userId, fetchConversations, fetchMessages]);

  const visibleConversations = dataIdentity === userId ? conversations : [];
  const visibleMessages = dataIdentity === userId ? messages : [];
  const unreadCount = visibleConversations.reduce((sum, conversation) => sum + conversation.unread, 0);
  useEffect(() => { window.dispatchEvent(new CustomEvent("vakaygo:unread-messages", { detail: { count: unreadCount } })); }, [unreadCount]);
  return { conversations: visibleConversations, messages: visibleMessages, unreadCount, isConnected, loadingConversations, loadingMessages,
    conversationError, messageError, sendMessage, markAsRead: fetchMessages, fetchConversations, fetchMessages };
}
