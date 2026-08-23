import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import {
  customFetch,
  getGetCurrentUserQueryKey,
  setAuthTokenGetter,
  setBaseUrl,
} from "@workspace/api-client-react";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Redirect, Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { clearPendingInvite, getPendingInvite } from "@/lib/pendingInvite";

const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (domain) setBaseUrl(`https://${domain}`);

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

// AuthGate: conditionally mounts the login screen or the authenticated stack
// based on Clerk's auth state. Using synchronous conditional rendering (not
// an effect) ensures the authenticated routes never mount while signed out.
function AuthGate() {
  const segments = useSegments();
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const qc = useQueryClient();

  // Wire the API client to the current auth state. Cleared to null on sign-out
  // or component unmount so stale Bearer tokens never leak.
  useEffect(() => {
    if (isSignedIn) {
      setAuthTokenGetter(() => getToken());
    } else {
      setAuthTokenGetter(() => Promise.resolve(null));
    }
    return () => {
      setAuthTokenGetter(() => Promise.resolve(null));
    };
  }, [isSignedIn, getToken]);

  // When sign-in/sign-up completes after a staff member came from an invite
  // link (see app/accept-invite.tsx), claim the invite exactly once here —
  // this fires regardless of whether they created a new account or signed
  // into an existing one. Tried once, then cleared either way so a stale or
  // already-consumed token doesn't retry forever.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      const pending = await getPendingInvite();
      if (!pending || cancelled) return;
      try {
        await customFetch("/api/auth/consume-invite", {
          method: "POST",
          body: JSON.stringify({ token: pending.token }),
        });
        await qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      } catch (err) {
        console.warn("Failed to consume pending invite:", err);
      } finally {
        if (!cancelled) await clearPendingInvite();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, qc]);

  // Wait for Clerk to resolve auth state (ClerkLoaded parent guarantees this,
  // but guard defensively so we never render the wrong branch).
  if (!isLoaded) return null;

  const inLoginRoute = segments[0] === "login";
  // Reachable from the invite-email deep link before the user has an
  // account or session, so it must be allowed through while signed out too.
  const inAcceptInviteRoute = segments[0] === "accept-invite";

  // Not signed in and trying to access an authenticated route: redirect to
  // login synchronously so the tabs Stack never mounts.
  if (!isSignedIn && !inLoginRoute && !inAcceptInviteRoute) {
    return <Redirect href="/login" />;
  }

  // Signed in but on the login screen: redirect to tabs synchronously.
  // (accept-invite handles its own signed-in redirect after it consumes the
  // invite, so it's excluded here.)
  if (isSignedIn && inLoginRoute) {
    return <Redirect href="/" />;
  }

  // Correct auth state for the current route — render the full navigator.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="accept-invite" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="lead/[id]"
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ClerkProvider
          publishableKey={publishableKey}
          tokenCache={tokenCache}
          proxyUrl={proxyUrl}
        >
          <ClerkLoaded>
            <QueryClientProvider client={queryClient}>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <AuthGate />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </QueryClientProvider>
          </ClerkLoaded>
        </ClerkProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
