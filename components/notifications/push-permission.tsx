"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";

type PushStatus = "unsupported" | "default" | "granted" | "denied" | "loading";

export function PushPermission() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus>("loading");
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    setStatus(Notification.permission as PushStatus);
  }, []);

  const subscribe = useCallback(async () => {
    if (!user) return;
    setSubscribing(true);

    try {
      const permission = await Notification.requestPermission();
      setStatus(permission as PushStatus);

      if (permission !== "granted") {
        setSubscribing(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        console.error("VAPID public key not configured");
        setSubscribing(false);
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      const subJson = subscription.toJSON();

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys?.p256dh,
            auth: subJson.keys?.auth,
          },
        }),
      });
    } catch (error) {
      console.error("Push subscription failed:", error);
    } finally {
      setSubscribing(false);
    }
  }, [user]);

  const unsubscribe = useCallback(async () => {
    setSubscribing(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setStatus("default");
    } catch (error) {
      console.error("Push unsubscribe failed:", error);
    } finally {
      setSubscribing(false);
    }
  }, []);

  if (!user || status === "unsupported" || status === "loading") return null;

  if (status === "denied") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 text-sm text-slate-400">
        <BellOffIcon />
        <span>Notifications blocked in browser settings</span>
      </div>
    );
  }

  if (status === "granted") {
    return (
      <button
        onClick={unsubscribe}
        disabled={subscribing}
        className="flex items-center gap-3 w-full px-4 py-3 text-sm text-slate-300 hover:bg-white/5 transition-colors disabled:opacity-50"
      >
        <BellIcon className="text-teal-400" />
        <span>{subscribing ? "Updating..." : "Push notifications enabled"}</span>
        <span className="ml-auto text-xs text-slate-500">Disable</span>
      </button>
    );
  }

  return (
    <button
      onClick={subscribe}
      disabled={subscribing}
      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-white hover:bg-white/5 transition-colors disabled:opacity-50"
    >
      <BellIcon className="text-slate-400" />
      <span>{subscribing ? "Enabling..." : "Enable push notifications"}</span>
    </button>
  );
}

function BellIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 ${className}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
    </svg>
  );
}

function BellOffIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.143 17.082a24.248 24.248 0 0 0 5.714 0m-5.714 0a3 3 0 1 0 5.714 0M3.124 3.124l17.752 17.752M6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31M18 9.75V9A6 6 0 0 0 7.635 5.255" />
    </svg>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
