import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// One ranked list of every model Lumin can answer with, best first, mixing
// providers. Every chat message starts at the top and walks down until one
// responds, so a failure only ever costs a small step in quality (not "the
// worst model of provider A, then the best of provider B"), and students
// move back up as soon as better models recover.
//
// The goal is to stay on free tiers: each model has its own separate quota,
// so more entries means more free headroom. A provider is only used if its
// API key is set in the environment (Vercel -> Environment Variables), so
// adding a key switches that provider on with no code change.
//
// The ranking below is a judgment call based on model size/capability and
// how closely each follows Lumin's long instructions. Reorder freely.
//
// Non-Gemini providers are reached through OpenAI-compatible endpoints.
// Third-party model IDs change over time; a retired ID just fails fast and
// the chain moves on, so fix the ID here if one stops working.

export type ChatModelCandidate = {
  /** For logs only, e.g. "groq/openai/gpt-oss-120b". */
  label: string;
  model: LanguageModel;
  /** Only Gemini gets the thinking-level option. */
  isGemini: boolean;
  /** Can read attached images/PDFs. Others are text-only. */
  multimodal: boolean;
};

type Env = Record<string, string | undefined>;

type Provider = "gemini" | "groq" | "openrouter" | "mistral";

const RANKED: Array<[Provider, string]> = [
  ["gemini", "gemini-3.6-flash"],
  ["gemini", "gemini-3.8-flash"],
  ["openrouter", "nvidia/nemotron-3-ultra-550b-a55b:free"],
  ["gemini", "gemini-3.5-flash"],
  ["groq", "openai/gpt-oss-120b"],
  ["openrouter", "nvidia/nemotron-3-super-120b-a12b:free"],
  ["mistral", "mistral-medium-latest"],
  ["groq", "qwen/qwen3.8-27b"],
  ["gemini", "gemini-3.7-flash"],
  ["gemini", "gemini-3-flash-preview"],
  ["openrouter", "google/gemma-4-31b-it:free"],
  ["mistral", "mistral-small-latest"],
  ["groq", "openai/gpt-oss-20b"],
  ["gemini", "gemini-3.1-flash-lite"],
  ["mistral", "ministral-14b-latest"],
  // OpenRouter's own router: picks whichever free model is up right now.
  ["openrouter", "openrouter/free"],
  ["gemini", "gemini-3.5-flash-lite"],
  ["gemini", "gemini-3.1-flash-lite-preview"],
];

const OPENAI_COMPATIBLE: Record<
  Exclude<Provider, "gemini">,
  { keyEnv: string; baseURL: string }
> = {
  groq: { keyEnv: "GROQ_API_KEY", baseURL: "https://api.groq.com/openai/v1" },
  openrouter: { keyEnv: "OPENROUTER_API_KEY", baseURL: "https://openrouter.ai/api/v1" },
  mistral: { keyEnv: "MISTRAL_API_KEY", baseURL: "https://api.mistral.ai/v1" },
};

/**
 * Builds the model chain for one request. When the conversation contains
 * attachments, text-only providers are left out so the file isn't dropped.
 */
export function buildModelChain(env: Env, hasAttachments: boolean): ChatModelCandidate[] {
  const geminiKey = env["GEMINI_API_KEY"];
  const google = geminiKey ? createGoogleGenerativeAI({ apiKey: geminiKey }) : null;

  const clients = new Map<string, ReturnType<typeof createOpenAI>>();
  for (const [name, cfg] of Object.entries(OPENAI_COMPATIBLE)) {
    const apiKey = env[cfg.keyEnv];
    if (apiKey) clients.set(name, createOpenAI({ apiKey, baseURL: cfg.baseURL, name }));
  }

  const chain: ChatModelCandidate[] = [];
  for (const [provider, id] of RANKED) {
    if (provider === "gemini") {
      if (!google) continue;
      chain.push({
        label: `gemini/${id}`,
        model: google(id),
        isGemini: true,
        multimodal: true,
      });
      continue;
    }
    if (hasAttachments) continue;
    const client = clients.get(provider);
    if (!client) continue;
    chain.push({
      label: `${provider}/${id}`,
      model: client.chat(id),
      isGemini: false,
      multimodal: false,
    });
  }
  return chain;
}
