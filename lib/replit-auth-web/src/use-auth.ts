import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from "react";
import { createElement } from "react";

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  gymId?: string | null;
  gymName?: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  refetch: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetch("/api/auth/user", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data.user ?? null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const logout = useCallback(async () => {
    await fetch("/api/logout", { credentials: "include" });
    setUser(null);
  }, []);

  const refetch = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return createElement(AuthContext.Provider, {
    value: { user, isLoading, isAuthenticated: !!user, logout, refetch },
    children,
  });
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>. Wrap your app in <AuthProvider>.");
  }
  return ctx;
}
