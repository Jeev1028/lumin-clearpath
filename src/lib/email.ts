// Thin wrapper around SendGrid's HTTP API (no SDK dependency needed).
// Server-only. SendGrid was chosen over Resend because its domain
// verification only needs CNAME/TXT records — Wix's DNS panel can't add
// the subdomain MX record Resend's setup requires.

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  replyTo?: { email: string; name?: string };
}) {
  const apiKey = process.env["SENDGRID_API_KEY"];
  if (!apiKey) throw new Error("SENDGRID_API_KEY is not configured");
  const fromEmail = process.env["SENDGRID_FROM_EMAIL"] || "notifications@luminclearpath.ca";
  const fromName = process.env["SENDGRID_FROM_NAME"] || "ClearPath";

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: options.to }] }],
      from: { email: fromEmail, name: fromName },
      ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      subject: options.subject,
      content: [{ type: "text/html", value: options.html }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SendGrid API error (${res.status}): ${text}`);
  }
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
