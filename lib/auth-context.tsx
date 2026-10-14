"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";

type User = {
  id: string;
  email: string;
  name: string | null;
  role: "traveler" | "operator" | "admin";
  avatarUrl: string | null;
  businessName: string | null;
  emailVerified: boolean | null;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const activeRefresh = useRef<AbortController | null>(null);
  const signingOut = useRef(false);

  const refresh = useCallback(async () => {
    if (signingOut.current) return;
    const request = ++generation.current;
    activeRefresh.current?.abort();
    const controller = new AbortController();
    activeRefresh.current = controller;
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error("Session unavailable");
      const data = await res.json();
      if (data.user !== null && (!data.user || typeof data.user.id !== "string" || typeof data.user.email !== "string" || !["traveler", "operator", "admin"].includes(data.user.role))) throw new Error("Invalid session response");
      if (request === generation.current && !controller.signal.aborted) setUser(data.user);
    } catch {
      if (request === generation.current && !controller.signal.aborted) setUser(null);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    const request = ++generation.current;
    activeRefresh.current?.abort();
    try {
      const response = await fetch("/api/auth/signout", { method: "POST" });
      if (!response.ok) throw new Error("Sign-out could not be confirmed. Please try again.");
      if (request === generation.current) {
        setUser(null);
        setLoading(false);
      }
    } finally { signingOut.current = false; }
  }, []);

  useEffect(() => {
    refresh();
    return () => { generation.current += 1; activeRefresh.current?.abort(); };
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
