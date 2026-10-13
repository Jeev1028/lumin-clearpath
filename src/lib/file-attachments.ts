import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileUIPart } from "ai";

// Shared client-side attachment handling for the website's chat.
//
// Files are uploaded straight to the private "chat-attachments" Supabase
// bucket from the browser, and the chat message only carries a small
// "supabase-storage://" reference. The chat API downloads them with the
// student's own token. That keeps requests tiny (the host rejects bodies
// over ~4.5MB) and lets students attach far more -- Gemini accepts about
// 20MB of inline files per request.
//
// If an upload fails (offline, bucket not set up yet), small files fall
// back to being inlined as data URLs under the old, tighter limits.
export const ATTACHMENT_BUCKET = "chat-attachments";
export const STORAGE_URL_PREFIX = `supabase-storage://${ATTACHMENT_BUCKET}/`;

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 18 * 1024 * 1024;
// Inline fallback: the whole request body must stay under ~4.5MB.
export const MAX_INLINE_TOTAL_BYTES = 3 * 1024 * 1024;

export const ACCEPTED_ATTACHMENT_TYPES =
  ".pdf,application/pdf,image/*,.json,application/json,.txt,text/plain";

export function resolveAttachmentMediaType(file: File): string {
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

/** Approximate raw size of a base64 data URL. */
export function dataUrlBytes(url: string): number {
  const comma = url.indexOf(",");
  return Math.floor(((url.length - comma - 1) * 3) / 4);
}

/**
 * Turns picked files into message parts. `sizes` tracks bytes already
 * attached (by part URL) so the combined cap holds across several picks.
 */
export async function filesToAttachmentParts(
  fileList: FileList | File[],
  opts: { supabase: SupabaseClient; userId: string; alreadyAttachedBytes: number },
): Promise<{ parts: FileUIPart[]; sizes: number[]; errors: string[] }> {
  const parts: FileUIPart[] = [];
  const sizes: number[] = [];
  const errors: string[] = [];
  let total = opts.alreadyAttachedBytes;
  let inlineTotal = 0;
  for (const file of Array.from(fileList)) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      errors.push(`"${file.name}" is too large (max 15MB per file).`);
      continue;
    }
    if (total + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
      errors.push(
        `"${file.name}" wasn't added: Lumin can read about 18MB of files per message. Send the rest in your next message.`,
      );
      continue;
    }
    const mediaType = resolveAttachmentMediaType(file);
    const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-80);
    const path = `${opts.userId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await opts.supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, file, { contentType: mediaType, upsert: false });
    if (!uploadError) {
      parts.push({
        type: "file",
        mediaType,
        url: `${STORAGE_URL_PREFIX}${path}`,
        filename: file.name,
      });
      sizes.push(file.size);
      total += file.size;
      continue;
    }
    console.error("[attachments] upload failed, falling back to inline", uploadError);
    if (inlineTotal + file.size > MAX_INLINE_TOTAL_BYTES) {
      errors.push(`Couldn't upload "${file.name}". Please try again.`);
      continue;
    }
    try {
      const url = await readFileAsDataUrl(file);
      parts.push({ type: "file", mediaType, url, filename: file.name });
      sizes.push(file.size);
      total += file.size;
      inlineTotal += file.size;
    } catch {
      errors.push(`Couldn't read "${file.name}".`);
    }
  }
  return { parts, sizes, errors };
}
