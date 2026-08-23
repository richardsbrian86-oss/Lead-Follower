import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, conversations as conversationsTable, messages as messagesTable } from "@workspace/db";
import {
  CreateAnthropicConversationBody,
  SendAnthropicMessageBody,
  GetAnthropicConversationParams,
  DeleteAnthropicConversationParams,
  ListAnthropicMessagesParams,
  SendAnthropicMessageParams,
} from "@workspace/api-zod";
import { logger } from "../../lib/logger.js";

const router: IRouter = Router();

// AI conversations are gym-scoped. Users who have not completed gym setup
// cannot access this feature because there is no tenant to scope it to.
router.use((req, res, next): void => {
  if (!req.dbUser?.gymId) {
    res.status(403).json({ error: "A gym is required to use AI conversations" });
    return;
  }
  next();
});

router.get("/anthropic/conversations", async (req, res): Promise<void> => {
  try {
    const conversations = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.gymId, req.dbUser!.gymId!))
      .orderBy(desc(conversationsTable.createdAt));
    res.json(
      conversations.map((c) => ({
        ...c,
        createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      }))
    );
  } catch (err) {
    logger.error({ err }, "Failed to list conversations");
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

router.post("/anthropic/conversations", async (req, res): Promise<void> => {
  const parsed = CreateAnthropicConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [conv] = await db
      .insert(conversationsTable)
      .values({ title: parsed.data.title, gymId: req.dbUser!.gymId! })
      .returning();
    res.status(201).json({
      ...conv,
      createdAt: conv.createdAt instanceof Date ? conv.createdAt.toISOString() : conv.createdAt,
    });
  } catch (err) {
    logger.error({ err }, "Failed to create conversation");
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

router.get("/anthropic/conversations/:id", async (req, res): Promise<void> => {
  const params = GetAnthropicConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, params.data.id),
          eq(conversationsTable.gymId, req.dbUser!.gymId!),
        ),
      );
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const msgs = await db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.conversationId, conv.id),
          eq(messagesTable.gymId, req.dbUser!.gymId!),
        ),
      )
      .orderBy(messagesTable.createdAt);

    const serialize = (d: Date | string) => (d instanceof Date ? d.toISOString() : d);
    res.json({
      ...conv,
      createdAt: serialize(conv.createdAt),
      messages: msgs.map((m) => ({ ...m, createdAt: serialize(m.createdAt) })),
    });
  } catch (err) {
    logger.error({ err }, "Failed to get conversation");
    res.status(500).json({ error: "Failed to get conversation" });
  }
});

router.delete("/anthropic/conversations/:id", async (req, res): Promise<void> => {
  const params = DeleteAnthropicConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const [deleted] = await db
      .delete(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, params.data.id),
          eq(conversationsTable.gymId, req.dbUser!.gymId!),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.sendStatus(204);
  } catch (err) {
    logger.error({ err }, "Failed to delete conversation");
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

router.get("/anthropic/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = ListAnthropicMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, params.data.id),
          eq(conversationsTable.gymId, req.dbUser!.gymId!),
        ),
      );
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const msgs = await db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.conversationId, conversation.id),
          eq(messagesTable.gymId, req.dbUser!.gymId!),
        ),
      )
      .orderBy(messagesTable.createdAt);
    res.json(
      msgs.map((m) => ({
        ...m,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
      }))
    );
  } catch (err) {
    logger.error({ err }, "Failed to list messages");
    res.status(500).json({ error: "Failed to list messages" });
  }
});

router.post("/anthropic/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = SendAnthropicMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SendAnthropicMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, params.data.id),
        eq(conversationsTable.gymId, req.dbUser!.gymId!),
      ),
    );
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  await db.insert(messagesTable).values({
    gymId: req.dbUser!.gymId!,
    conversationId: conv.id,
    role: "user",
    content: parsed.data.content,
  });

  const history = await db
    .select()
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, conv.id),
        eq(messagesTable.gymId, req.dbUser!.gymId!),
      ),
    )
    .orderBy(messagesTable.createdAt);

  const chatMessages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  try {
    const { anthropic } = await import("@workspace/integrations-anthropic-ai");
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system:
        "You are an expert gym sales coach helping managers analyze their lead pipeline and improve conversion rates. Be concise, data-driven, and actionable.",
      messages: chatMessages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullResponse += event.delta.text;
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    await db.insert(messagesTable).values({
      gymId: req.dbUser!.gymId!,
      conversationId: conv.id,
      role: "assistant",
      content: fullResponse,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    logger.error({ err }, "Anthropic streaming error");
    res.write(`data: ${JSON.stringify({ error: "AI response failed" })}\n\n`);
    res.end();
  }
});

export default router;
