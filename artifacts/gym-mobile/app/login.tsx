import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type AuthView = "login" | "forgot" | "forgot-sent";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [view, setView] = useState<AuthView>("login");

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#0a2040", "#0d1b2a"]} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: topInset + 32, paddingBottom: bottomInset + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.top}>
            <View
              style={[
                styles.iconWrapper,
                { backgroundColor: colors.primary + "20", borderColor: colors.primary + "40" },
              ]}
            >
              <Feather name="zap" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.appName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Flow State
            </Text>
            <Text style={[styles.tagline, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Gym Lead CRM
            </Text>
          </View>

          <View style={styles.formContainer}>
            {view === "login" && (
              <LoginForm
                colors={colors}
                onLogin={login}
                onForgot={() => setView("forgot")}
              />
            )}
            {view === "forgot" && (
              <ForgotForm
                colors={colors}
                onBack={() => setView("login")}
                onSent={() => setView("forgot-sent")}
              />
            )}
            {view === "forgot-sent" && (
              <ForgotSentMessage colors={colors} onBack={() => setView("login")} />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function LoginForm({
  colors,
  onLogin,
  onForgot,
}: {
  colors: ReturnType<typeof useColors>;
  onLogin: (email: string, password: string) => Promise<{ error?: string; code?: string }>;
  onForgot: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsVerify, setNeedsVerify] = useState(false);
  const [loading, setLoading] = useState(false);

  const scale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  async function handleSubmit() {
    if (!email.trim() || !password) { setError("Please enter your email and password."); return; }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSpring(0.96, {}, () => { scale.value = withSpring(1); });
    setError("");
    setNeedsVerify(false);
    setLoading(true);
    try {
      const result = await onLogin(email.trim().toLowerCase(), password);
      if (result.error) {
        setError(result.error);
        if (result.code === "EMAIL_NOT_VERIFIED") setNeedsVerify(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.form}>
      <Text style={[styles.formTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
        Welcome back
      </Text>
      {!!error && (
        <View style={[styles.errorBox, { backgroundColor: "#ff4d4f20", borderColor: "#ff4d4f50" }]}>
          <Text style={[styles.errorText, { color: "#ff6b6b", fontFamily: "Inter_400Regular" }]}>
            {error}
            {needsVerify ? "\nCheck your inbox for the verification link." : ""}
          </Text>
        </View>
      )}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Email</Text>
        <TextInput
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary + "60", fontFamily: "Inter_400Regular" }]}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.mutedForeground + "80"}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Password</Text>
        <TextInput
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary + "60", fontFamily: "Inter_400Regular" }]}
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          placeholderTextColor={colors.mutedForeground + "80"}
          secureTextEntry
          autoComplete="password"
          onSubmitEditing={handleSubmit}
          returnKeyType="go"
        />
      </View>
      <Pressable onPress={onForgot} style={styles.forgotLink}>
        <Text style={[styles.forgotText, { color: colors.primary, fontFamily: "Inter_400Regular" }]}>
          Forgot password?
        </Text>
      </Pressable>
      <Animated.View style={btnStyle}>
        <Pressable
          testID="login-button"
          onPress={handleSubmit}
          disabled={loading}
          style={({ pressed }) => [
            styles.submitButton,
            { backgroundColor: colors.primary, opacity: pressed || loading ? 0.8 : 1, borderRadius: colors.radius },
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Feather name="log-in" size={18} color={colors.primaryForeground} />
              <Text style={[styles.submitText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                Sign in
              </Text>
            </>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

function ForgotForm({
  colors,
  onBack,
  onSent,
}: {
  colors: ReturnType<typeof useColors>;
  onBack: () => void;
  onSent: () => void;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`;

  async function handleSubmit() {
    if (!email.includes("@")) { setError("Please enter a valid email."); return; }
    setError("");
    setLoading(true);
    try {
      await fetch(`${BASE_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      onSent();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.form}>
      <Text style={[styles.formTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
        Reset password
      </Text>
      {!!error && (
        <View style={[styles.errorBox, { backgroundColor: "#ff4d4f20", borderColor: "#ff4d4f50" }]}>
          <Text style={[styles.errorText, { color: "#ff6b6b", fontFamily: "Inter_400Regular" }]}>{error}</Text>
        </View>
      )}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Email</Text>
        <TextInput
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary + "60", fontFamily: "Inter_400Regular" }]}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.mutedForeground + "80"}
          keyboardType="email-address"
          autoCapitalize="none"
          onSubmitEditing={handleSubmit}
          returnKeyType="send"
        />
      </View>
      <Pressable
        onPress={handleSubmit}
        disabled={loading}
        style={({ pressed }) => [
          styles.submitButton,
          { backgroundColor: colors.primary, opacity: pressed || loading ? 0.8 : 1, borderRadius: colors.radius },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={[styles.submitText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
            Send reset link
          </Text>
        )}
      </Pressable>
      <Pressable onPress={onBack} style={styles.backLink}>
        <Feather name="arrow-left" size={14} color={colors.primary} />
        <Text style={[styles.backText, { color: colors.primary, fontFamily: "Inter_400Regular" }]}>
          Back to sign in
        </Text>
      </Pressable>
    </View>
  );
}

function ForgotSentMessage({ colors, onBack }: { colors: ReturnType<typeof useColors>; onBack: () => void }) {
  return (
    <View style={styles.form}>
      <View style={[styles.infoBox, { backgroundColor: colors.primary + "20", borderColor: colors.primary + "50" }]}>
        <Feather name="mail" size={24} color={colors.primary} style={{ marginBottom: 8 }} />
        <Text style={[styles.infoTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Check your inbox</Text>
        <Text style={[styles.infoText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          If an account exists, you'll receive a reset link shortly.
        </Text>
      </View>
      <Pressable onPress={onBack} style={styles.backLink}>
        <Feather name="arrow-left" size={14} color={colors.primary} />
        <Text style={[styles.backText, { color: colors.primary, fontFamily: "Inter_400Regular" }]}>
          Back to sign in
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 28, gap: 32 },
  top: { alignItems: "center", gap: 10 },
  iconWrapper: {
    width: 80, height: 80, borderRadius: 22,
    borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  appName: { fontSize: 32, letterSpacing: -1 },
  tagline: { fontSize: 15 },
  formContainer: {},
  form: { gap: 16 },
  formTitle: { fontSize: 20, marginBottom: 4, textAlign: "center" },
  errorBox: { borderWidth: 1, borderRadius: 10, padding: 12 },
  errorText: { fontSize: 13, lineHeight: 18 },
  field: { gap: 6 },
  label: { fontSize: 13 },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15,
  },
  forgotLink: { alignSelf: "flex-end", marginTop: -8 },
  forgotText: { fontSize: 13 },
  submitButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 15, marginTop: 4,
  },
  submitText: { fontSize: 16 },
  backLink: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 4 },
  backText: { fontSize: 13 },
  infoBox: { borderWidth: 1, borderRadius: 12, padding: 20, alignItems: "center", gap: 4 },
  infoTitle: { fontSize: 16 },
  infoText: { fontSize: 13, textAlign: "center", lineHeight: 18 },
});
