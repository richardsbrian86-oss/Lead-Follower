import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const GYM_BRAND_SYSTEM_PROMPT = `You are a friendly, enthusiastic gym membership advisor for FitLife Gym.
Your job is to write personalized follow-up messages to tour visitors who haven't yet signed up.
Tone: warm, encouraging, non-pushy, human. Never sound like a mass blast.
Keep emails under 150 words. Keep SMS under 160 characters.
Do not use placeholders like [GYM NAME] — always write "FitLife Gym".
Sign emails with "The FitLife Team". Do not sign SMS messages.
Always respond with valid JSON only — no markdown, no code fences, no explanation.`;

interface GenerateMessageOptions {
  leadName: string;
  visitDate: string;
  channel: "email" | "sms";
  stepNumber: number;
  toneInstruction: string;
}

interface GeneratedMessage {
  subject: string | null;
  body: string;
}

function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const braceStart = raw.indexOf("{");
  const braceEnd = raw.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd !== -1) return raw.slice(braceStart, braceEnd + 1);
  return raw.trim();
}

export async function generateMessage(opts: GenerateMessageOptions): Promise<GeneratedMessage> {
  const { leadName, visitDate, channel, stepNumber, toneInstruction } = opts;

  const userPrompt =
    channel === "email"
      ? `Write a follow-up email for ${leadName}, who visited FitLife Gym on ${visitDate}. This is touchpoint #${stepNumber + 1}. Goal/tone: ${toneInstruction}. Respond with JSON only: {"subject": "...", "body": "..."}`
      : `Write a follow-up SMS for ${leadName}, who visited FitLife Gym on ${visitDate}. This is touchpoint #${stepNumber + 1}. Goal/tone: ${toneInstruction}. Respond with JSON only: {"body": "..."} — max 160 chars for body.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 512,
    messages: [
      { role: "system", content: GYM_BRAND_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsed: { subject?: string; body?: string } = {};
  try {
    parsed = JSON.parse(extractJson(raw)) as { subject?: string; body?: string };
  } catch {
    parsed = { body: raw.trim() };
  }

  return {
    subject: channel === "email" ? (parsed.subject ?? `Following up from FitLife Gym`) : null,
    body: parsed.body ?? `Hi ${leadName}, just checking in from FitLife Gym!`,
  };
}
