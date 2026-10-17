import "server-only";
import { appendFile } from "node:fs/promises";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";

type Email = { to: string; subject: string; text: string };

// Delivery order: test outbox → Resend (needs a verified domain) → SMTP (e.g. Gmail) → log.
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
  if (apiKey) {
    await sendWithResend(apiKey, { to, subject, text });
    return;
  }
  const smtp = env.smtp;
  if (smtp) {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.password },
    });
    await transport.sendMail({ from: env.emailFrom, to, subject, text });
    return;
  }
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error("No email provider configured");
  }
  console.info(`[email] to=${to} subject="${subject}"\n${text}`);
}

async function sendWithResend(apiKey: string, { to, subject, text }: Email): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.emailFrom, to, subject, text }),
  });
  if (!response.ok) {
    throw new Error(`Resend failed: ${response.status} ${await response.text()}`);
  }
}
