import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useDraftLeadMessage,
  useGetLead,
  useGetLeadMessages,
  useSendLeadMessage,
  useUpdateLead,
} from "@workspace/api-client-react";
import type {
  LeadStatus,
  OutboundMessage,
  SendMessageInputChannel,
} from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";

function statusColor(status: LeadStatus, primary: string): string {
  switch (status) {
    case "new": return primary;
    case "contacted": return "#f5a623";
    case "interested": return "#7ecb4a";
    case "won": return "#00d08a";
    case "lost": return "#e83a52";
    default: return "#7a9ab8";
  }
}

function MessageBubble({ msg }: { msg: OutboundMessage }) {
  const colors = useColors();
  const date = new Date(msg.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const isSent = msg.status === "sent";
  const chanColor = msg.channel === "sms" ? colors.primary : "#7ecb4a";

  return (
    <View style={styles.bubble}>
      <View style={[styles.bubbleContent, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <View style={styles.bubbleHeader}>
          <View style={[styles.channelTag, { backgroundColor: chanColor + "20" }]}>
            <Feather
              name={msg.channel === "sms" ? "message-square" : "mail"}
              size={10}
              color={chanColor}
            />
            <Text style={[styles.channelText, { color: chanColor, fontFamily: "Inter_500Medium" }]}>
              {msg.channel.toUpperCase()}
            </Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: isSent ? "#00d08a" : "#e83a52" }]} />
        </View>
        <Text style={[styles.bubbleBody, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
          {msg.body}
        </Text>
        <Text style={[styles.bubbleDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {date}
        </Text>
      </View>
    </View>
  );
}

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const leadId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [channel, setChannel] = useState<SendMessageInputChannel>("sms");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");

  const { data: lead, isLoading: leadLoading } = useGetLead(leadId);
  const { data: messages, refetch: refetchMessages } = useGetLeadMessages(leadId);
  const sendMutation = useSendLeadMessage();
  const draftMutation = useDraftLeadMessage();
  const updateMutation = useUpdateLead();

  const isLoading = leadLoading;
  const isSending = sendMutation.isPending;
  const isDrafting = draftMutation.isPending;

  const color = lead ? statusColor(lead.status, colors.primary) : colors.primary;
  const initials = lead?.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?";

  async function handleDraft() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await draftMutation.mutateAsync({ id: leadId, data: { channel } });
    setBody(result.body);
    if (result.subject) setSubject(result.subject);
  }

  async function handleSend() {
    if (!body.trim()) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await sendMutation.mutateAsync({
      id: leadId,
      data: {
        channel,
        body: body.trim(),
        ...(channel === "email" && subject ? { subject } : {}),
      },
    });
    setBody("");
    setSubject("");
    refetchMessages();
  }

  async function handleStatusChange(newStatus: LeadStatus) {
    await updateMutation.mutateAsync({ id: leadId, data: { status: newStatus } });
  }

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!lead) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
        <Text style={[styles.errorText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Lead not found
        </Text>
      </View>
    );
  }

  const STATUS_OPTIONS: LeadStatus[] = ["new", "contacted", "interested", "won", "lost"];

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View style={[styles.topBar, { paddingTop: topPad + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable
          testID="back-button"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.topBarInfo}>
          <View style={[styles.miniAvatar, { backgroundColor: color + "20" }]}>
            <Text style={[styles.miniInitials, { color, fontFamily: "Inter_700Bold" }]}>
              {initials}
            </Text>
          </View>
          <View>
            <Text style={[styles.topName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
              {lead.name}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: color + "15", borderColor: color + "30" }]}>
              <Text style={[styles.statusText, { color, fontFamily: "Inter_500Medium" }]}>
                {lead.status}
              </Text>
            </View>
          </View>
        </View>
        <Text style={[styles.scoreChip, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
          {lead.score}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 180 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={styles.infoRow}>
            <Feather name="mail" size={14} color={colors.mutedForeground} />
            <Text style={[styles.infoText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
              {lead.email}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Feather name="phone" size={14} color={colors.mutedForeground} />
            <Text style={[styles.infoText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
              {lead.phone}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Feather name="calendar" size={14} color={colors.mutedForeground} />
            <Text style={[styles.infoText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Visited {new Date(lead.visitDate).toLocaleDateString()}
            </Text>
          </View>
          {lead.notes && (
            <View style={styles.infoRow}>
              <Feather name="file-text" size={14} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={3}>
                {lead.notes}
              </Text>
            </View>
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          STATUS
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusRow}>
          {STATUS_OPTIONS.map((s) => {
            const c = statusColor(s, colors.primary);
            const active = lead.status === s;
            return (
              <Pressable
                key={s}
                testID={`status-${s}`}
                onPress={() => !active && handleStatusChange(s)}
                style={[
                  styles.statusOption,
                  {
                    backgroundColor: active ? c + "25" : colors.card,
                    borderColor: active ? c : colors.border,
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <Text style={[styles.statusOptionText, { color: active ? c : colors.mutedForeground, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                  {s}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          MESSAGE HISTORY
        </Text>
        {!messages || messages.length === 0 ? (
          <View style={[styles.emptyHistory, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Feather name="message-circle" size={20} color={colors.mutedForeground} />
            <Text style={[styles.emptyHistoryText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              No messages sent yet
            </Text>
          </View>
        ) : (
          <View style={styles.messageList}>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.composer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomPad + 8 }]}>
        <View style={styles.composerTop}>
          <View style={[styles.channelToggle, { backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius }]}>
            {(["sms", "email"] as SendMessageInputChannel[]).map((ch) => (
              <Pressable
                key={ch}
                testID={`channel-${ch}`}
                onPress={() => setChannel(ch)}
                style={[
                  styles.channelBtn,
                  {
                    backgroundColor: channel === ch ? colors.primary : "transparent",
                    borderRadius: colors.radius - 2,
                  },
                ]}
              >
                <Feather
                  name={ch === "sms" ? "message-square" : "mail"}
                  size={14}
                  color={channel === ch ? colors.primaryForeground : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.channelBtnText,
                    {
                      color: channel === ch ? colors.primaryForeground : colors.mutedForeground,
                      fontFamily: channel === ch ? "Inter_600SemiBold" : "Inter_400Regular",
                    },
                  ]}
                >
                  {ch.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            testID="draft-button"
            onPress={handleDraft}
            disabled={isDrafting}
            style={[styles.draftBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}
          >
            {isDrafting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Feather name="cpu" size={14} color={colors.primary} />
                <Text style={[styles.draftBtnText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                  AI Draft
                </Text>
              </>
            )}
          </Pressable>
        </View>

        {channel === "email" && (
          <TextInput
            testID="subject-input"
            style={[styles.subjectInput, { color: colors.foreground, borderColor: colors.border, fontFamily: "Inter_400Regular" }]}
            placeholder="Subject..."
            placeholderTextColor={colors.mutedForeground}
            value={subject}
            onChangeText={setSubject}
          />
        )}

        <View style={styles.composerBottom}>
          <TextInput
            testID="message-input"
            style={[styles.messageInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, fontFamily: "Inter_400Regular", borderRadius: colors.radius }]}
            placeholder={`Write a ${channel === "sms" ? "text message" : "email"}...`}
            placeholderTextColor={colors.mutedForeground}
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={channel === "sms" ? 160 : 2000}
          />
          <Pressable
            testID="send-button"
            onPress={handleSend}
            disabled={!body.trim() || isSending}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor: body.trim() && !isSending ? colors.primary : colors.secondary,
                borderRadius: colors.radius,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather name="send" size={18} color={body.trim() ? colors.primaryForeground : colors.mutedForeground} />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorText: {
    fontSize: 15,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
  },
  topBarInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  miniAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  miniInitials: {
    fontSize: 14,
  },
  topName: {
    fontSize: 16,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 2,
  },
  statusText: {
    fontSize: 10,
  },
  scoreChip: {
    fontSize: 22,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  infoCard: {
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 4,
  },
  statusRow: {
    gap: 8,
    paddingRight: 16,
  },
  statusOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  statusOptionText: {
    fontSize: 13,
  },
  messageList: {
    gap: 8,
  },
  bubble: {},
  bubbleContent: {
    padding: 12,
    borderWidth: 1,
    gap: 6,
  },
  bubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  channelTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  channelText: {
    fontSize: 9,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bubbleBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleDate: {
    fontSize: 11,
  },
  emptyHistory: {
    padding: 20,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  emptyHistoryText: {
    fontSize: 13,
  },
  composer: {
    padding: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  composerTop: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  channelToggle: {
    flexDirection: "row",
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  channelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  channelBtnText: {
    fontSize: 11,
  },
  draftBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  draftBtnText: {
    fontSize: 13,
  },
  subjectInput: {
    borderBottomWidth: 1,
    paddingBottom: 6,
    fontSize: 14,
  },
  composerBottom: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end",
  },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
    minHeight: 44,
  },
  sendBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
