import { t } from "@/i18n/es-AR";

type EmailContent = { subject: string; text: string; html: string };

const C = {
  teal: "#00d1c7",
  tealText: "#0a7671",
  logoArrow: "#0e9f9a",
  ink: "#1f2d3a",
  body: "#4a5a6a",
  muted: "#7a8896",
  border: "#d6dee5",
  page: "#eef2f5",
  box: "#f3f6f8",
  onTeal: "#0d1820",
};
const SANS = "Helvetica, Arial, sans-serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Courier New', monospace";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(opts: {
  preheader: string;
  eyebrow: string;
  title: string;
  content: string; // trusted HTML (callers escape user input)
  footer: readonly string[];
}): string {
  const footer = opts.footer.map((line) => escapeHtml(line)).join("<br>");
  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td style="padding:0 0 20px 4px;font-family:${MONO};font-size:22px;font-weight:bold;"><span style="color:${C.logoArrow};">&gt;</span> <span style="color:${C.ink};">vaquia</span></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${C.border};border-top:4px solid ${C.teal};border-radius:12px;padding:48px;">
<div style="font-family:${MONO};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.tealText};padding-bottom:16px;">${escapeHtml(opts.eyebrow)}</div>
<h1 style="margin:0 0 24px 0;font-family:${SANS};font-size:34px;line-height:1.2;font-weight:bold;color:${C.ink};">${escapeHtml(opts.title)}</h1>
${opts.content}
</td></tr>
<tr><td align="center" style="padding:24px 16px 0 16px;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.muted};">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 20px 0;font-family:${SANS};font-size:17px;line-height:1.6;color:${C.body};">${html}</p>`;
}

function strong(value: string): string {
  return `<b style="color:${C.ink};">${escapeHtml(value)}</b>`;
}

export function invitationEmail(input: {
  personName: string;
  companyName: string;
  url: string;
}): EmailContent {
  const { personName, companyName, url } = input;
  const i = t.access.invite;
  const href = escapeHtml(url);
  const content = [
    paragraph(escapeHtml(i.greeting)),
    paragraph(i.intro(strong(personName), strong(companyName))),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;"><tr><td align="center" bgcolor="${C.teal}" style="background:${C.teal};border-radius:8px;"><a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:17px;font-weight:bold;color:${C.onTeal};text-decoration:none;border-radius:8px;">${escapeHtml(i.cta)}</a></td></tr></table>`,
    paragraph(escapeHtml(i.helper)),
    `<div style="border-top:1px solid ${C.border};margin:8px 0 20px 0;font-size:0;line-height:0;">&nbsp;</div>`,
    `<p style="margin:0 0 8px 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.muted};">${escapeHtml(i.fallback)}</p>`,
    `<p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;word-break:break-all;"><a href="${href}" style="color:${C.tealText};text-decoration:underline;">${href}</a></p>`,
  ].join("\n");
  return {
    subject: i.subject(companyName),
    text: `${i.greeting}\n\n${i.intro(personName, companyName)}\n\n${i.helper}\n${url}\n\n${i.footer.join("\n")}\n`,
    html: layout({
      preheader: i.preheader(companyName),
      eyebrow: i.eyebrow,
      title: i.title(companyName),
      content,
      footer: i.footer,
    }),
  };
}

export function otpEmail({ code }: { code: string }): EmailContent {
  const e = t.email;
  const content = [
    paragraph(escapeHtml(e.otpBody)),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;"><tr><td align="center" bgcolor="${C.box}" style="background:${C.box};border:1px solid ${C.border};border-radius:8px;padding:18px 28px;font-family:${MONO};font-size:36px;font-weight:bold;letter-spacing:8px;color:${C.ink};">${escapeHtml(code)}</td></tr></table>`,
    `<p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.6;color:${C.body};">${escapeHtml(e.otpValidity)}</p>`,
  ].join("\n");
  return {
    subject: e.otpSubject,
    text: `${e.otpBody} ${code}\n\n${e.otpValidity}\n${e.otpFooter[1]}\n`,
    html: layout({
      preheader: e.otpPreheader(code),
      eyebrow: e.otpEyebrow,
      title: e.otpTitle,
      content,
      footer: e.otpFooter,
    }),
  };
}
