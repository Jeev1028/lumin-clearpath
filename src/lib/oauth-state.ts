import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signs a small payload (e.g. { userId }) into an opaque "state" string to
 * pass through a third-party OAuth redirect. Since the callback is a plain
 * browser GET request (no Authorization header available), this is how we
 * know which ClearPath user the callback belongs to, without trusting the
 * client to tell us directly. Server-only.
 */

function getSecret(): string {
  const secret = process.env["OAUTH_STATE_SECRET"];
  if (!secret) throw new Error("OAUTH_STATE_SECRET is not configured");
  return secret;
}

export function createSignedState(payload: Record<string, string>): string {
  const json = JSON.stringify({ ...payload, ts: Date.now() });
  const body = Buffer.from(json, "utf8").toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySignedState(
  state: string,
  maxAgeMs = 10 * 60 * 1000,
): Record<string, string> | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;

  const expected = createHmac("sha256", getSecret()).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (typeof payload["ts"] !== "number" || Date.now() - payload["ts"] > maxAgeMs) return null;
    return payload as Record<string, string>;
  } catch {
    return null;
  }
}
