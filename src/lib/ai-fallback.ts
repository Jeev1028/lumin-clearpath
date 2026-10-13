// One-shot AI calls (flashcards, knowledge map, practice, level check, study
// plan) used to depend on a single Gemini model, so they all broke whenever it
// was overloaded. These helpers walk the same quality-ranked model chain that
// chat uses and return the first model that answers successfully.

import { generateObject, generateText } from "ai";
import type { z } from "zod";

import { buildModelChain } from "@/lib/chat-models";

const PER_MODEL_MS = 25_000;
const MAX_ATTEMPTS = 8;

export async function generateObjectWithFallback<T extends z.ZodTypeAny>(opts: {
  schema: T;
  system: string;
  prompt: string;
}): Promise<z.infer<T>> {
  const chain = buildModelChain(process.env, false).slice(0, MAX_ATTEMPTS);
  let lastError: unknown = new Error("no AI models are configured");
  for (const candidate of chain) {
    try {
      const { object } = await generateObject({
        model: candidate.model,
        schema: opts.schema,
        system: opts.system,
        prompt: opts.prompt,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(PER_MODEL_MS),
        ...(candidate.isGemini
          ? { providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" as const } } } }
          : {}),
      });
      return object as z.infer<T>;
    } catch (error) {
      lastError = error;
      console.warn(`[ai-fallback] ${candidate.label} failed, trying the next model`);
    }
  }
  throw lastError;
}

export async function generateTextWithFallback(opts: {
  system: string;
  prompt: string;
  maxOutputTokens: number;
}): Promise<string> {
  const chain = buildModelChain(process.env, false).slice(0, MAX_ATTEMPTS);
  let lastError: unknown = new Error("no AI models are configured");
  for (const candidate of chain) {
    try {
      const { text } = await generateText({
        model: candidate.model,
        system: opts.system,
        prompt: opts.prompt,
        maxOutputTokens: Math.max(opts.maxOutputTokens, candidate.isGemini ? 4000 : 0),
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(PER_MODEL_MS * 2),
        ...(candidate.isGemini
          ? { providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" as const } } } }
          : {}),
      });
      if (text.trim()) return text;
      throw new Error("empty response");
    } catch (error) {
      lastError = error;
      console.warn(`[ai-fallback] ${candidate.label} failed, trying the next model`);
    }
  }
  throw lastError;
}
