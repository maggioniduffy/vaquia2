import "server-only";
import { appendFile } from "node:fs/promises";
import { env } from "@/lib/env";

type Email = { to: string; subject: string; text: string };

// Resend over HTTP when configured; otherwise log (local dev, CI).
export async function sendEmail({ to, subject, text }: Email): Promise<void> {
  // Test outbox: e2e runs `next start` (NODE_ENV=production), so gate on "not on Vercel"
  // rather than NODE_ENV. Never active in a real deployment.
  const outbox = env.emailOutboxFile;
  if (outbox && !process.env.VERCEL) {
    await appendFile(
      outbox,
      `${JSON.stringify({ to, subject, text, at: new Date().toISOString() })}\n`,
    );
    return;
  }
  const apiKey = env.resendApiKey;
  if (!apiKey) {
    console.info(`[email] to=${to} subject="${subject}"\n${text}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.emailFrom, to, subject, text }),
  });
  if (!response.ok) {
    throw new Error(`Resend failed: ${response.status} ${await response.text()}`);
  }
}
