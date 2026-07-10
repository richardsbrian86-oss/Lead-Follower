import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);

  const scale = useSharedValue(1);
  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  async function handleLogin() {
    if (loading) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSpring(0.95, {}, () => {
      scale.value = withSpring(1);
    });
    setLoading(true);
    try {
      await login();
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#0a2040", "#0d1b2a"]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, { paddingTop: topInset + 40, paddingBottom: bottomInset + 40 }]}>
        <View style={styles.top}>
          <View style={[styles.iconWrapper, { backgroundColor: colors.primary + "20", borderColor: colors.primary + "40" }]}>
            <Feather name="zap" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.appName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Gym Leads
          </Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Manage leads on the go
          </Text>
        </View>

        <View style={styles.mid}>
          <View style={[styles.featureRow]}>
            {[
              { icon: "users" as const, label: "Hot lead tracking" },
              { icon: "message-square" as const, label: "Quick SMS & email" },
              { icon: "list" as const, label: "Daily action queue" },
            ].map((f) => (
              <View key={f.label} style={styles.featureItem}>
                <View style={[styles.featureIcon, { backgroundColor: colors.secondary }]}>
                  <Feather name={f.icon} size={16} color={colors.primary} />
                </View>
                <Text style={[styles.featureLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {f.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.bottom}>
          <Animated.View style={buttonStyle}>
            <Pressable
              testID="login-button"
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => [
                styles.loginButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1, borderRadius: colors.radius },
              ]}
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Feather name="log-in" size={18} color={colors.primaryForeground} />
                  <Text style={[styles.loginText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                    Sign in with Replit
                  </Text>
                </>
              )}
            </Pressable>
          </Animated.View>

          <Text style={[styles.disclaimer, { color: colors.mutedForeground + "80", fontFamily: "Inter_400Regular" }]}>
            Secure sign-in via Replit
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: "space-between",
  },
  top: {
    alignItems: "center",
    gap: 12,
  },
  iconWrapper: {
    width: 88,
    height: 88,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  appName: {
    fontSize: 36,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
  },
  mid: {
    alignItems: "center",
  },
  featureRow: {
    gap: 16,
    width: "100%",
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  featureLabel: {
    fontSize: 15,
  },
  bottom: {
    gap: 12,
    alignItems: "center",
  },
  loginButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 40,
    width: "100%",
    minWidth: 280,
  },
  loginText: {
    fontSize: 16,
  },
  disclaimer: {
    fontSize: 12,
  },
});
