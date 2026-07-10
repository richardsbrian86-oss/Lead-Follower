import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as storage from "@/utils/storage";

export const TOKEN_KEY = "gym_lead_session_token";

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string; code?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async (sessionToken: string): Promise<boolean> => {
    try {
      const resp = await fetch(`${BASE_URL}/api/auth/user`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.user) {
          setUser(data.user);
          return true;
        }
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  useEffect(() => {
    async function loadToken() {
      try {
        const saved = await storage.getItem(TOKEN_KEY);
        if (saved) {
          const ok = await fetchUser(saved);
          if (ok) {
            setToken(saved);
          } else {
            await storage.deleteItem(TOKEN_KEY);
          }
        }
      } finally {
        setIsLoading(false);
      }
    }
    loadToken();
  }, [fetchUser]);

  const login = useCallback(async (email: string, password: string): Promise<{ error?: string; code?: string }> => {
    try {
      const resp = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await resp.json();
      if (resp.ok && data.token) {
        await storage.setItem(TOKEN_KEY, data.token);
        setToken(data.token);
        setUser(data.user);
        return {};
      }
      return { error: data.error || "Sign in failed.", code: data.code };
    } catch {
      return { error: "Network error. Please try again." };
    }
  }, []);

  const logout = useCallback(async () => {
    const currentToken = token;
    setToken(null);
    setUser(null);
    await storage.deleteItem(TOKEN_KEY);
    if (currentToken) {
      try {
        await fetch(`${BASE_URL}/api/logout`, {
          headers: { Authorization: `Bearer ${currentToken}` },
        });
      } catch {
        // ignore
      }
    }
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
