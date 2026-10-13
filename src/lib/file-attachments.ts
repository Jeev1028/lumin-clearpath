import type { FileUIPart } from "ai";

// Shared client-side attachment handling for chat -- used by the website's
// ChatWindow. Files are read straight into data URLs and sent as AI SDK
// FileUIParts; Gemini (via @ai-sdk/google) understands PDFs, images, plain
// text and JSON natively as inline file parts, so no server-side parsing is
// needed for any of these.
//
// The size cap keeps the base64-inflated request body comfortably under
// typical serverless function body-size limits (Vercel's default is
// 4.5MB) -- base64 adds ~33% overhead, so 4MB raw stays safely under that
// even with everything else in the request.
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
// The whole request (all files in ONE message, base64-inflated) must also fit
// the 4.5MB limit, so there is a combined cap per message as well.
export const MAX_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024;

/** Approximate raw size of a base64 data URL. */
export function dataUrlBytes(url: string): number {
  const comma = url.indexOf(",");
  return Math.floor(((url.length - comma - 1) * 3) / 4);
}
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

export async function filesToAttachmentParts(
  fileList: FileList | File[],
  alreadyAttachedBytes = 0,
): Promise<{ parts: FileUIPart[]; errors: string[] }> {
  const parts: FileUIPart[] = [];
  const errors: string[] = [];
  let total = alreadyAttachedBytes;
  for (const file of Array.from(fileList)) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      errors.push(`"${file.name}" is too large (max 4MB per file).`);
      continue;
    }
    if (total + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
      errors.push(
        `"${file.name}" wasn't added: Lumin can read about 3MB of files per message. Send the rest in your next message.`,
      );
      continue;
    }
    try {
      const url = await readFileAsDataUrl(file);
      total += file.size;
      parts.push({
        type: "file",
        mediaType: resolveAttachmentMediaType(file),
        url,
        filename: file.name,
      });
    } catch {
      errors.push(`Couldn't read "${file.name}".`);
    }
  }
  return { parts, errors };
}
