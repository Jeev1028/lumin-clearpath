import { createHmac, randomBytes } from "node:crypto";

// Excludes visually-ambiguous characters (0/O, 1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CHARS_PER_CODE = 10;
const GROUP_SIZE = 5;

function randomCode(): string {
  const bytes = randomBytes(CHARS_PER_CODE);
  let raw = "";
  for (let i = 0; i < bytes.length; i++) {
    raw += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += GROUP_SIZE) {
    groups.push(raw.slice(i, i + GROUP_SIZE));
  }
  return groups.join("-");
}

/** Generates a batch of unique, human-typeable one-time backup codes. */
export function generateBackupCodes(count = 10): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(randomCode());
  return [...codes];
}

/** Strips formatting/whitespace so codes match regardless of how a user types them. */
export function normalizeBackupCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Deterministic keyed hash so we can look codes up by exact match without
 * ever storing them in plaintext. Codes are server-generated, high-entropy,
 * single-use, so a fast keyed hash (HMAC-SHA256) is appropriate here.
 */
export function hashBackupCode(code: string): string {
  const key = process.env["TOKEN_ENCRYPTION_KEY"];
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  return createHmac("sha256", key).update(normalizeBackupCode(code)).digest("hex");
}
