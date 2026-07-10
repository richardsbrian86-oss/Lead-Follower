import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useGetAnalyticsPulse,
  useGetDashboardActionQueue,
  useGetDashboardSummary,
} from "@workspace/api-client-react";
import type { ActionItem } from "@workspace/api-client-react";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

function MetricCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentProps<typeof Feather>["name"];
  accent?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.metricCard,
        {
          backgroundColor: colors.card,
          borderColor: accent ? colors.primary + "40" : colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={[styles.metricIcon, { backgroundColor: accent ? colors.primary + "20" : colors.secondary }]}>
        <Feather name={icon} size={16} color={accent ? colors.primary : colors.mutedForeground} />
      </View>
      <Text style={[styles.metricValue, { color: accent ? colors.primary : colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {value}
      </Text>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {label}
      </Text>
    </View>
  );
}

function QueueItemRow({ item }: { item: ActionItem }) {
  const colors = useColors();
  const router = useRouter();

  const scoreColor =
    item.score >= 70 ? colors.primary : item.score >= 40 ? "#f5a623" : colors.mutedForeground;

  return (
    <Pressable
      testID={`queue-item-${item.leadId}`}
      onPress={() => router.push(`/lead/${item.leadId}`)}
      style={({ pressed }) => [
        styles.queueRow,
        {
          backgroundColor: pressed ? colors.secondary : colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={[styles.scoreChip, { backgroundColor: scoreColor + "20" }]}>
        <Text style={[styles.scoreText, { color: scoreColor, fontFamily: "Inter_700Bold" }]}>
          {item.score}
        </Text>
      </View>
      <View style={styles.queueInfo}>
        <Text style={[styles.queueName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.queueReason, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={1}>
          {item.primaryReason}
        </Text>
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: pulse, isLoading: pulseLoading, refetch: refetchPulse } = useGetAnalyticsPulse();
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useGetDashboardSummary();
  const { data: queue, isLoading: queueLoading, refetch: refetchQueue } = useGetDashboardActionQueue();

  const isLoading = pulseLoading || summaryLoading || queueLoading;

  const firstName = user?.firstName ?? user?.email?.split("@")[0] ?? "there";

  function handleRefresh() {
    refetchPulse();
    refetchSummary();
    refetchQueue();
  }

  const topActions = queue?.actions?.slice(0, 3) ?? [];

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: 120 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Good day,
          </Text>
          <Text style={[styles.name, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {firstName}
          </Text>
        </View>
        <View style={[styles.avatar, { backgroundColor: colors.primary + "20", borderColor: colors.primary + "40" }]}>
          <Feather name="zap" size={18} color={colors.primary} />
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        PIPELINE PULSE
      </Text>

      {isLoading && !pulse ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <View style={styles.metricsGrid}>
          <MetricCard
            label="Active leads"
            value={pulse?.totalActiveLeads ?? summary?.totalLeads ?? "—"}
            icon="users"
          />
          <MetricCard
            label="Hot leads"
            value={summary?.hotLeads?.length ?? "—"}
            icon="zap"
            accent
          />
          <MetricCard
            label="7d conversion"
            value={pulse ? `${(pulse.avgConversionRate7d * 100).toFixed(1)}%` : "—"}
            icon="trending-up"
          />
          <MetricCard
            label="Follow-ups due"
            value={summary?.followUpsDueToday ?? "—"}
            icon="clock"
          />
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          TODAY'S QUEUE
        </Text>
        <Text style={[styles.sectionCount, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
          {queue?.actions?.length ?? 0} leads
        </Text>
      </View>

      {queueLoading && !queue ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : topActions.length === 0 ? (
        <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Feather name="check-circle" size={24} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Queue is clear
          </Text>
        </View>
      ) : (
        <View style={styles.queueList}>
          {topActions.map((item) => (
            <QueueItemRow key={item.leadId} item={item} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  greeting: {
    fontSize: 14,
  },
  name: {
    fontSize: 28,
    letterSpacing: -0.5,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  sectionCount: {
    fontSize: 12,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    minWidth: "45%",
    padding: 14,
    borderWidth: 1,
    gap: 6,
  },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: {
    fontSize: 24,
    letterSpacing: -0.5,
  },
  metricLabel: {
    fontSize: 12,
  },
  queueList: {
    gap: 8,
  },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
    borderWidth: 1,
  },
  scoreChip: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: {
    fontSize: 15,
  },
  queueInfo: {
    flex: 1,
    gap: 2,
  },
  queueName: {
    fontSize: 15,
  },
  queueReason: {
    fontSize: 12,
  },
  loadingRow: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyBox: {
    padding: 24,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  emptyText: {
    fontSize: 14,
  },
});
