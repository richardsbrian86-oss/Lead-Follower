import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useClerk } from "@clerk/expo";

import { useColors } from "@/hooks/useColors";
import {
  useGetCurrentUser,
  useCreateGym,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// ─── Gym Setup Screen ─────────────────────────────────────────────────────────
// Shown when the signed-in user has no gym yet (new owner onboarding).
function GymSetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useClerk();
  const qc = useQueryClient();
  const { mutateAsync: createGym, isPending } = useCreateGym();
  const [gymName, setGymName] = useState("");
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!gymName.trim()) {
      setError("Gym name is required.");
      return;
    }
    setError("");
    try {
      // Use the authenticated API client — it attaches the Clerk Bearer token
      // and uses the configured base URL, so this works on native Expo builds.
      await createGym({ data: { gymName: gymName.trim() } });
      // Invalidate the cached current-user query so the tabs layout refetches
      // gymId and transitions to the real tabs automatically.
      await qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to create gym. Please try again.";
      setError(msg);
    }
  }

  return (
    <View
      style={[
        styles.setupContainer,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <View style={[styles.setupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.setupTitle, { color: colors.foreground }]}>Set up your gym</Text>
        <Text style={[styles.setupSubtitle, { color: colors.mutedForeground }]}>
          Create your gym to start tracking leads and managing your team.
        </Text>

        {!!error && (
          <View style={[styles.errorBox, { backgroundColor: "#ff4d4f20", borderColor: "#ff4d4f50" }]}>
            <Text style={[styles.errorText, { color: "#ff6b6b" }]}>{error}</Text>
          </View>
        )}

        <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Gym name</Text>
        <TextInput
          style={[
            styles.input,
            {
              color: colors.foreground,
              borderColor: colors.border,
              backgroundColor: colors.secondary + "60",
            },
          ]}
          value={gymName}
          onChangeText={setGymName}
          placeholder="CrossFit Central"
          placeholderTextColor={colors.mutedForeground + "80"}
          autoCapitalize="words"
          autoComplete="off"
          returnKeyType="done"
          onSubmitEditing={handleCreate}
        />

        <TouchableOpacity
          onPress={handleCreate}
          disabled={isPending}
          style={[
            styles.createButton,
            {
              backgroundColor: colors.primary,
              opacity: isPending ? 0.7 : 1,
              borderRadius: colors.radius,
            },
          ]}
          activeOpacity={0.85}
        >
          {isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.createButtonText, { color: colors.primaryForeground }]}>
              Create gym
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => signOut()}
          style={styles.signOutLink}
          activeOpacity={0.7}
        >
          <Text style={[styles.signOutText, { color: colors.mutedForeground }]}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Tab Layouts ──────────────────────────────────────────────────────────────
function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} />
        <Label>Dashboard</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="leads">
        <Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
        <Label>Leads</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="queue">
        <Icon sf={{ default: "list.bullet.clipboard", selected: "list.bullet.clipboard.fill" }} />
        <Label>Queue</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint={isDark ? "dark" : "dark"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.background },
              ]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="chart.bar.fill" tintColor={color} size={22} />
            ) : (
              <Feather name="bar-chart-2" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="leads"
        options={{
          title: "Leads",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person.2.fill" tintColor={color} size={22} />
            ) : (
              <Feather name="users" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: "Queue",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="list.bullet.clipboard" tintColor={color} size={22} />
            ) : (
              <Feather name="list" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────
// Checks gym assignment before rendering tabs. New owners who haven't yet
// set up a gym (gymId = null) see the GymSetupScreen instead.
export default function TabLayout() {
  const colors = useColors();
  const { data, isLoading } = useGetCurrentUser();

  // Loading state — show a minimal spinner while we check gym assignment
  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // No gym assigned yet — show onboarding instead of the business tabs
  if (!data?.user?.gymId) {
    return <GymSetupScreen />;
  }

  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  setupContainer: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  setupCard: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  setupTitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  setupSubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 4,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  createButton: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  errorBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  errorText: {
    fontSize: 13,
    textAlign: "center",
  },
  signOutLink: {
    marginTop: 8,
    alignItems: "center",
  },
  signOutText: {
    fontSize: 13,
  },
});
