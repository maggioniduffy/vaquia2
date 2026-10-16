import "server-only";
import { env } from "@/lib/env";

type Email = { to: string; subject: string; text: string };

// Resend over HTTP when configured; otherwise log (local dev, CI).
export async function sendEmail({ to, subject, text }: Email): Promise<void> {
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
