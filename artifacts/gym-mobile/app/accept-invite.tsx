import { Feather } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import {
  customFetch,
  getGetCurrentUserQueryKey,
  getGetInviteDetailsQueryKey,
  useGetInviteDetails,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { setPendingInvite } from "@/lib/pendingInvite";

// Reached via the "gym-mobile://accept-invite?token=..." deep link sent in
// staff invite emails (see artifacts/api-server/src/lib/email.ts). Mirrors
// the web app's /accept-invite page: validates the token, then either routes
// an already-signed-in user straight into the gym, or hands a signed-out
// user off to the login screen with the invite context attached.
export default function AcceptInviteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { token: rawToken } = useLocalSearchParams<{ token?: string }>();
  const token = typeof rawToken === "string" ? rawToken : "";

  // retry: false — an invalid/expired invite token is a deterministic 404,
  // not a transient failure, so retrying just delays the error state the
  // user needs to see by another second or two for no benefit.
  const {
    data: info,
    isLoading,
    error,
  } = useGetInviteDetails(token, {
    query: {
      enabled: token.length > 0,
      queryKey: getGetInviteDetailsQueryKey(token),
      retry: false,
    },
  });

  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  // Already signed in (e.g. an existing staff member tapped the link on a
  // device where they're still logged in): consume the invite immediately
  // instead of showing the create-account / sign-in choice.
  useEffect(() => {
    if (!authLoaded || !isSignedIn || !info || joining) return;

    let cancelled = false;
    setJoining(true);
    (async () => {
      try {
        await customFetch("/api/auth/consume-invite", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        await qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        if (!cancelled) router.replace("/");
      } catch (err: unknown) {
        if (cancelled) return;
        setJoinError(
          err instanceof Error ? err.message : "Failed to join the gym. Please try again.",
        );
        setJoining(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoaded, isSignedIn, info, token]);

  async function goToAuth(mode: "sign-in" | "sign-up") {
    if (!info) return;
    await setPendingInvite({ token, email: info.email });
    router.replace({
      pathname: "/login",
      params: { inviteEmail: info.email, mode },
    });
  }

  // Only wait on the network query when there's actually a token to check —
  // a missing token should fall straight through to the error state below,
  // not spin forever (the query is never enabled without one).
  const showLoading = !authLoaded || (!!token && isLoading) || (isSignedIn && joining);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 },
      ]}
    >
      {showLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.statusText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {isSignedIn ? "Joining gym…" : "Checking your invite…"}
          </Text>
        </View>
      )}

      {!showLoading && (error || !token || !info) && (
        <View style={styles.center}>
          <View
            style={[
              styles.errorBox,
              { backgroundColor: "#ff4d4f20", borderColor: "#ff4d4f50" },
            ]}
          >
            <Feather name="alert-triangle" size={22} color="#ff6b6b" style={{ marginBottom: 8 }} />
            <Text style={[styles.errorTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              Invite link invalid
            </Text>
            <Text style={[styles.errorText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              This invite link is invalid or has expired.
            </Text>
            <Text style={[styles.errorText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Contact your gym owner for a new invite.
            </Text>
          </View>
        </View>
      )}

      {!showLoading && !error && info && !isSignedIn && (
        <View style={styles.center}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              Join {info.gymName}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              You've been invited to join as a staff member.
            </Text>
            <View style={[styles.emailBox, { backgroundColor: colors.primary + "20", borderColor: colors.primary + "40" }]}>
              <Text style={[styles.emailText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                Sign up with: <Text style={{ fontFamily: "Inter_600SemiBold" }}>{info.email}</Text>
              </Text>
            </View>
            {!!joinError && (
              <Text style={[styles.errorText, { color: "#ff6b6b", fontFamily: "Inter_400Regular" }]}>
                {joinError}
              </Text>
            )}
            <Pressable
              onPress={() => goToAuth("sign-up")}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1, borderRadius: colors.radius },
              ]}
            >
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                Create account
              </Text>
            </Pressable>
            <Pressable onPress={() => goToAuth("sign-in")} style={styles.linkButton}>
              <Text style={[styles.linkText, { color: colors.primary, fontFamily: "Inter_400Regular" }]}>
                Already have an account? Sign in
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 28 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  statusText: { fontSize: 14 },
  errorBox: { borderWidth: 1, borderRadius: 12, padding: 20, alignItems: "center", gap: 4, width: "100%" },
  errorTitle: { fontSize: 16 },
  errorText: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  card: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 14, width: "100%" },
  title: { fontSize: 20, textAlign: "center" },
  subtitle: { fontSize: 14, textAlign: "center" },
  emailBox: { borderWidth: 1, borderRadius: 10, padding: 12 },
  emailText: { fontSize: 14 },
  primaryButton: { paddingVertical: 14, alignItems: "center" },
  primaryButtonText: { fontSize: 16 },
  linkButton: { alignItems: "center", marginTop: 2 },
  linkText: { fontSize: 13 },
});
