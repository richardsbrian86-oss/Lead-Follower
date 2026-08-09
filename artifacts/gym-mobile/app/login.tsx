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

import { useSignIn, useSignUp } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";

type AuthView = "sign-in" | "sign-up" | "verify-email";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<AuthView>("sign-in");

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
            {view === "sign-in" && (
              <SignInForm colors={colors} onSignUp={() => setView("sign-up")} />
            )}
            {view === "sign-up" && (
              <SignUpForm
                colors={colors}
                onSignIn={() => setView("sign-in")}
                onVerify={() => setView("verify-email")}
              />
            )}
            {view === "verify-email" && (
              <VerifyEmailForm colors={colors} onBack={() => setView("sign-up")} />
            )}
          </View>

          {/* Required for Clerk bot protection */}
          <View nativeID="clerk-captcha" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function SignInForm({
  colors,
  onSignUp,
}: {
  colors: ReturnType<typeof useColors>;
  onSignUp: () => void;
}) {
  const { signIn, fetchStatus } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const scale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  async function handleSubmit() {
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSpring(0.96, {}, () => { scale.value = withSpring(1); });
    setError("");

    const { error: signInError } = await signIn.password({
      emailAddress: email.trim().toLowerCase(),
      password,
    });

    if (signInError) {
      setError(
        signInError.message ??
          "Invalid email or password. Please try again.",
      );
      return;
    }

    if (signIn.status === "complete") {
      await signIn.finalize({ navigate: () => { router.replace("/"); } });
    }
  }

  const loading = fetchStatus === "fetching";

  return (
    <View style={styles.form}>
      <Text style={[styles.formTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
        Welcome back
      </Text>
      {!!error && (
        <View style={[styles.errorBox, { backgroundColor: "#ff4d4f20", borderColor: "#ff4d4f50" }]}>
          <Text style={[styles.errorText, { color: "#ff6b6b", fontFamily: "Inter_400Regular" }]}>
            {error}
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
      <Pressable onPress={onSignUp} style={styles.switchLink}>
        <Text style={[styles.switchText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          No account?{" "}
          <Text style={{ color: colors.primary }}>Create one</Text>
        </Text>
      </Pressable>
    </View>
  );
}

function SignUpForm({
  colors,
  onSignIn,
  onVerify,
}: {
  colors: ReturnType<typeof useColors>;
  onSignIn: () => void;
  onVerify: () => void;
}) {
  const { signUp, fetchStatus } = useSignUp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!email.trim() || password.length < 8) {
      setError("A valid email and password (8+ chars) are required.");
      return;
    }
    setError("");

    const { error: signUpError } = await signUp.password({
      emailAddress: email.trim().toLowerCase(),
      password,
    });

    if (signUpError) {
      setError(signUpError.message ?? "Sign-up failed. Please try again.");
      return;
    }

    await signUp.verifications.sendEmailCode();
    onVerify();
  }

  const loading = fetchStatus === "fetching";

  return (
    <View style={styles.form}>
      <Text style={[styles.formTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
        Create account
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
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Password</Text>
        <TextInput
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary + "60", fontFamily: "Inter_400Regular" }]}
          value={password}
          onChangeText={setPassword}
          placeholder="8+ characters"
          placeholderTextColor={colors.mutedForeground + "80"}
          secureTextEntry
          onSubmitEditing={handleSubmit}
          returnKeyType="go"
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
            Create account
          </Text>
        )}
      </Pressable>
      <Pressable onPress={onSignIn} style={styles.switchLink}>
        <Text style={[styles.switchText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Already have one?{" "}
          <Text style={{ color: colors.primary }}>Sign in</Text>
        </Text>
      </Pressable>
    </View>
  );
}

function VerifyEmailForm({
  colors,
  onBack,
}: {
  colors: ReturnType<typeof useColors>;
  onBack: () => void;
}) {
  const { signUp, fetchStatus } = useSignUp();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function handleVerify() {
    if (!code.trim()) { setError("Please enter the verification code."); return; }
    setError("");

    await signUp.verifications.verifyEmailCode({ code });

    if (signUp.status === "complete") {
      await signUp.finalize({ navigate: () => { router.replace("/"); } });
    } else {
      setError("Verification failed. Please check the code and try again.");
    }
  }

  const loading = fetchStatus === "fetching";

  return (
    <View style={styles.form}>
      <View style={[styles.infoBox, { backgroundColor: colors.primary + "20", borderColor: colors.primary + "50" }]}>
        <Feather name="mail" size={24} color={colors.primary} style={{ marginBottom: 8 }} />
        <Text style={[styles.infoTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Check your inbox
        </Text>
        <Text style={[styles.infoText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          We sent a verification code to your email. Enter it below to continue.
        </Text>
      </View>
      {!!error && (
        <View style={[styles.errorBox, { backgroundColor: "#ff4d4f20", borderColor: "#ff4d4f50" }]}>
          <Text style={[styles.errorText, { color: "#ff6b6b", fontFamily: "Inter_400Regular" }]}>{error}</Text>
        </View>
      )}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Verification code</Text>
        <TextInput
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary + "60", fontFamily: "Inter_400Regular" }]}
          value={code}
          onChangeText={setCode}
          placeholder="Enter code"
          placeholderTextColor={colors.mutedForeground + "80"}
          keyboardType="number-pad"
          onSubmitEditing={handleVerify}
          returnKeyType="go"
        />
      </View>
      <Pressable
        onPress={handleVerify}
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
            Verify email
          </Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => signUp.verifications.sendEmailCode()}
        style={styles.switchLink}
      >
        <Text style={[styles.switchText, { color: colors.primary, fontFamily: "Inter_400Regular" }]}>
          Resend code
        </Text>
      </Pressable>
      <Pressable onPress={onBack} style={styles.backLink}>
        <Feather name="arrow-left" size={14} color={colors.primary} />
        <Text style={[styles.backText, { color: colors.primary, fontFamily: "Inter_400Regular" }]}>
          Back
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
  infoBox: { borderWidth: 1, borderRadius: 12, padding: 20, alignItems: "center", gap: 4 },
  infoTitle: { fontSize: 16 },
  infoText: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  field: { gap: 6 },
  label: { fontSize: 13 },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15,
  },
  submitButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 15, marginTop: 4,
  },
  submitText: { fontSize: 16 },
  switchLink: { alignItems: "center", marginTop: 4 },
  switchText: { fontSize: 13 },
  backLink: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 4 },
  backText: { fontSize: 13 },
});
