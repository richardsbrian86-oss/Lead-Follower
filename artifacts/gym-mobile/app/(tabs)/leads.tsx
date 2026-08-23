import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useListLeads } from "@workspace/api-client-react";
import type { Lead, LeadStatus } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";

const STATUS_FILTERS: Array<{ label: string; value: LeadStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "New", value: "new" },
  { label: "Contacted", value: "contacted" },
  { label: "Interested", value: "interested" },
  { label: "Won", value: "won" },
  { label: "Lost", value: "lost" },
];

function statusColor(status: LeadStatus, primary: string): string {
  switch (status) {
    case "new":
      return primary;
    case "contacted":
      return "#f5a623";
    case "interested":
      return "#7ecb4a";
    case "won":
      return "#00d08a";
    case "lost":
      return "#e83a52";
    default:
      return "#7a9ab8";
  }
}

function LeadCard({ lead }: { lead: Lead }) {
  const colors = useColors();
  const router = useRouter();
  const color = statusColor(lead.status, colors.primary);
  const initials = lead.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Pressable
      testID={`lead-card-${lead.id}`}
      onPress={() => {
        if (Platform.OS !== "web") Haptics.selectionAsync();
        router.push(`/lead/${lead.id}`);
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
      <View style={[styles.avatar, { backgroundColor: color + "20" }]}>
        <Text style={[styles.avatarText, { color, fontFamily: "Inter_700Bold" }]}>
          {initials}
        </Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.leadName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
          {lead.name}
        </Text>
        <Text style={[styles.leadSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={1}>
          {lead.email}
        </Text>
      </View>
      <View style={styles.right}>
        <View style={[styles.statusBadge, { backgroundColor: color + "15", borderColor: color + "30" }]}>
          <Text style={[styles.statusText, { color, fontFamily: "Inter_500Medium" }]}>
            {lead.status}
          </Text>
        </View>
        <Text style={[styles.scoreText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {lead.score}
        </Text>
      </View>
    </Pressable>
  );
}

export default function LeadsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data, isLoading, refetch } = useListLeads(
    statusFilter !== "all" || search
      ? {
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
          ...(search ? { search } : {}),
          limit: 25,
        }
      : { limit: 25 },
  );
  const leads = data?.items;

  const renderItem = useCallback(({ item }: { item: Lead }) => (
    <LeadCard lead={item} />
  ), []);

  const keyExtractor = useCallback((item: Lead) => String(item.id), []);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Leads
        </Text>

        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            testID="leads-search"
            style={[styles.searchInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            placeholder="Search leads..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        <FlatList
          data={STATUS_FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(f) => f.value}
          renderItem={({ item: f }) => {
            const active = statusFilter === f.value;
            return (
              <Pressable
                onPress={() => setStatusFilter(f.value)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                    borderRadius: 20,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    {
                      color: active ? colors.primaryForeground : colors.mutedForeground,
                      fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                    },
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          }}
          contentContainerStyle={styles.filterRow}
        />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={leads ?? []}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Platform.OS === "web" ? 100 : insets.bottom + 100 },
          ]}
          scrollEnabled={!!(leads && leads.length > 0)}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Feather name="users" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                No leads found
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    gap: 10,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    letterSpacing: -0.5,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  filterRow: {
    gap: 8,
    paddingRight: 16,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 13,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
    borderWidth: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 15,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  leadName: {
    fontSize: 15,
  },
  leadSub: {
    fontSize: 13,
  },
  right: {
    alignItems: "flex-end",
    gap: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
  },
  scoreText: {
    fontSize: 12,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
  },
});
