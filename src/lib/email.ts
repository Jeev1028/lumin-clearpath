// Thin wrapper around Resend's HTTP API (no SDK dependency needed). Server-only.

export async function sendEmail(options: { to: string; subject: string; html: string }) {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  const from = process.env["RESEND_FROM_EMAIL"] || "ClearPath <notifications@luminclearpath.ca>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: options.to, subject: options.subject, html: options.html }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend API error (${res.status}): ${text}`);
  }
  return (await res.json()) as { id: string };
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
