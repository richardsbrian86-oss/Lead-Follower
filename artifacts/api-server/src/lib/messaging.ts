import { Resend } from "resend";
import twilio from "twilio";
import { db, outboundMessagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const FROM_EMAIL = "FitLife Gym <onboarding@resend.dev>";
const FROM_PHONE = process.env.TWILIO_PHONE_NUMBER ?? "";

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  try {
    return new Resend(process.env.RESEND_API_KEY);
  } catch {
    return null;
  }
}

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  try {
    return twilio(sid, token);
  } catch {
    return null;
  }
}

export async function sendEmail(opts: {
  messageId: number;
  toEmail: string;
  subject: string;
  body: string;
}): Promise<void> {
  const { messageId, toEmail, subject, body } = opts;
  const resend = getResend();

  if (!resend) {
    console.log(`[MOCK EMAIL — no RESEND_API_KEY] To: ${toEmail} | Subject: ${subject} | Body: ${body}`);
    await db
      .update(outboundMessagesTable)
      .set({ status: "failed", errorMessage: "RESEND_API_KEY not configured" })
      .where(eq(outboundMessagesTable.id, messageId));
    return;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject,
      text: body,
    });
    await db
      .update(outboundMessagesTable)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(outboundMessagesTable.id, messageId));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[EMAIL ERROR] messageId=${messageId}:`, errorMessage);
    await db
      .update(outboundMessagesTable)
      .set({ status: "failed", errorMessage })
      .where(eq(outboundMessagesTable.id, messageId));
  }
}

export async function sendSms(opts: {
  messageId: number;
  toPhone: string;
  body: string;
}): Promise<void> {
  const { messageId, toPhone, body } = opts;
  const twilioClient = getTwilioClient();

  if (!twilioClient) {
    console.log(`[MOCK SMS — no Twilio credentials] To: ${toPhone} | Body: ${body}`);
    await db
      .update(outboundMessagesTable)
      .set({ status: "failed", errorMessage: "Twilio credentials not configured" })
      .where(eq(outboundMessagesTable.id, messageId));
    return;
  }

  try {
    await twilioClient.messages.create({
      from: FROM_PHONE,
      to: toPhone,
      body,
    });
    await db
      .update(outboundMessagesTable)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(outboundMessagesTable.id, messageId));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[SMS ERROR] messageId=${messageId}:`, errorMessage);
    await db
      .update(outboundMessagesTable)
      .set({ status: "failed", errorMessage })
      .where(eq(outboundMessagesTable.id, messageId));
  }
}
