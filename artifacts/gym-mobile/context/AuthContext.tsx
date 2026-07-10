import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as storage from "@/utils/storage";

WebBrowser.maybeCompleteAuthSession();

export const TOKEN_KEY = "gym_lead_session_token";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const REPL_ID = process.env.EXPO_PUBLIC_REPL_ID ?? "";
const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
const BASE_URL = `https://${DOMAIN}`;

export const redirectUri = AuthSession.makeRedirectUri({ scheme: "gym-mobile" });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const exchangedRef = useRef(false);

  const discovery = AuthSession.useAutoDiscovery("https://replit.com/oidc");

  const [request, result, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: REPL_ID,
      scopes: ["openid", "email", "profile", "offline_access"],
      redirectUri,
      usePKCE: true,
      responseType: AuthSession.ResponseType.Code,
    },
    discovery,
  );

  const fetchUser = useCallback(async (sessionToken: string) => {
    try {
      const resp = await fetch(`${BASE_URL}/api/auth/user`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.user) setUser(data.user);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    async function loadToken() {
      try {
        const saved = await storage.getItem(TOKEN_KEY);
        if (saved) {
          setToken(saved);
          await fetchUser(saved);
        }
      } finally {
        setIsLoading(false);
      }
    }
    loadToken();
  }, [fetchUser]);

  useEffect(() => {
    if (
      result?.type === "success" &&
      request?.codeVerifier &&
      !exchangedRef.current
    ) {
      exchangedRef.current = true;
      handleTokenExchange(
        result.params.code,
        request.codeVerifier,
        result.params.state,
        request.nonce,
      );
    }
  }, [result]);

  async function handleTokenExchange(
    code: string,
    codeVerifier: string,
    state: string,
    nonce?: string,
  ) {
    try {
      const resp = await fetch(`${BASE_URL}/api/mobile-auth/token-exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
          state,
          nonce,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const newToken: string = data.token;
        await storage.setItem(TOKEN_KEY, newToken);
        setToken(newToken);
        await fetchUser(newToken);
      }
    } catch (e) {
      console.error("Token exchange failed", e);
    } finally {
      exchangedRef.current = false;
    }
  }

  const login = useCallback(async () => {
    await promptAsync();
  }, [promptAsync]);

  const logout = useCallback(async () => {
    const currentToken = token;
    setToken(null);
    setUser(null);
    await storage.deleteItem(TOKEN_KEY);
    if (currentToken) {
      try {
        await fetch(`${BASE_URL}/api/mobile-auth/logout`, {
          method: "POST",
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
        isAuthenticated: !!token,
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
