import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useGetDashboardActionQueue } from "@workspace/api-client-react";
import type { ActionItem } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";

function urgencyLabel(score: number): string {
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function urgencyColor(score: number, primary: string): string {
  if (score >= 80) return "#e83a52";
  if (score >= 60) return "#f5a623";
  if (score >= 40) return primary;
  return "#7a9ab8";
}

function QueueCard({ item, rank }: { item: ActionItem; rank: number }) {
  const colors = useColors();
  const router = useRouter();
  const uColor = urgencyColor(item.urgencyScore, colors.primary);
  const initials = item.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Pressable
      testID={`queue-card-${item.leadId}`}
      onPress={() => {
        if (Platform.OS !== "web") Haptics.selectionAsync();
        router.push(`/lead/${item.leadId}`);
      }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.secondary : colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={[styles.rankBadge, { backgroundColor: colors.background }]}>
        <Text style={[styles.rankText, { color: colors.mutedForeground, fontFamily: "Inter_700Bold" }]}>
          {rank}
        </Text>
      </View>

      <View style={[styles.avatar, { backgroundColor: uColor + "15" }]}>
        <Text style={[styles.avatarText, { color: uColor, fontFamily: "Inter_700Bold" }]}>
          {initials}
        </Text>
      </View>

      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.reason, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={1}>
          {item.primaryReason}
        </Text>
        {item.secondaryReasons?.length > 0 && (
          <Text style={[styles.secondary, { color: colors.mutedForeground + "80", fontFamily: "Inter_400Regular" }]} numberOfLines={1}>
            {item.secondaryReasons[0]}
          </Text>
        )}
      </View>

      <View style={styles.rightCol}>
        <View style={[styles.urgencyBadge, { backgroundColor: uColor + "20", borderColor: uColor + "40" }]}>
          <Text style={[styles.urgencyText, { color: uColor, fontFamily: "Inter_600SemiBold" }]}>
            {urgencyLabel(item.urgencyScore)}
          </Text>
        </View>
        <Text style={[styles.scoreText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          score {item.score}
        </Text>
      </View>
    </Pressable>
  );
}

export default function QueueScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: queue, isLoading, refetch } = useGetDashboardActionQueue();
  const actions = queue?.actions ?? [];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.headerBar, { paddingTop: topPad + 12, backgroundColor: colors.background }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Action Queue
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {actions.length} leads to reach today
          </Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: colors.primary + "20", borderColor: colors.primary + "30" }]}>
          <Text style={[styles.countText, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
            {actions.length}
          </Text>
        </View>
      </View>

      {isLoading && actions.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={actions}
          keyExtractor={(item) => String(item.leadId)}
          renderItem={({ item, index }) => <QueueCard item={item} rank={index + 1} />}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Platform.OS === "web" ? 100 : insets.bottom + 100 },
          ]}
          scrollEnabled={!!actions.length}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="check" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                All clear!
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                No leads need attention today
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerBar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  countBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontSize: 18,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
    borderWidth: 1,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    fontSize: 11,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 14,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
  },
  reason: {
    fontSize: 12,
  },
  secondary: {
    fontSize: 11,
  },
  rightCol: {
    alignItems: "flex-end",
    gap: 4,
  },
  urgencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  urgencyText: {
    fontSize: 11,
  },
  scoreText: {
    fontSize: 11,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingTop: 80,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 20,
  },
  emptySubtitle: {
    fontSize: 14,
  },
});
