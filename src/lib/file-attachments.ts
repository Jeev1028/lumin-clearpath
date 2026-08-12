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
): Promise<{ parts: FileUIPart[]; errors: string[] }> {
  const parts: FileUIPart[] = [];
  const errors: string[] = [];
  for (const file of Array.from(fileList)) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      errors.push(`"${file.name}" is too large (max 4MB per file).`);
      continue;
    }
    try {
      const url = await readFileAsDataUrl(file);
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
