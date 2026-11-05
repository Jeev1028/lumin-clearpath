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
  /** Reply length cap. Some free tiers count it against a per-minute budget. */
  maxOutputTokens: number;
  /** The owner's own server (PC / Raspberry Pi). Not part of the quality tiers. */
  local?: boolean;
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

// ---- Owner-only local model (Ollama behind the Pi gateway, see pi/README.md)
//
// Set LOCAL_LLM_BASE_URL (OpenAI-compatible, ending in /v1), LOCAL_LLM_MODEL and
// LOCAL_LLM_USER_IDS (comma-separated Supabase user ids allowed to use it) to
// switch it on. Only those accounts ever reach your hardware; everyone else
// keeps using the hosted chain. LOCAL_LLM_KEY is sent as a Bearer token.
// LOCAL_LLM_VISION=1 lets it take image/PDF attachments.
export function localEnabledFor(env: Env, userId: string | undefined): boolean {
  if (!userId || !env["LOCAL_LLM_BASE_URL"] || !env["LOCAL_LLM_MODEL"]) return false;
  const allowed = (env["LOCAL_LLM_USER_IDS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(userId);
}

let probeCache: { at: number; ok: boolean } | null = null;

/** Quick "is the server up?" check so a sleeping PC costs ~1s, not a long wait. */
export async function probeLocal(env: Env): Promise<boolean> {
  if (probeCache && Date.now() - probeCache.at < 15_000) return probeCache.ok;
  let ok = false;
  try {
    const key = env["LOCAL_LLM_KEY"];
    const res = await fetch(`${env["LOCAL_LLM_BASE_URL"]}/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(2500),
    });
    ok = res.ok;
  } catch {
    ok = false;
  }
  probeCache = { at: Date.now(), ok };
  return ok;
}

/**
 * Builds the model chain for one request. When the conversation contains
 * attachments, text-only providers are left out so the file isn't dropped.
 */
export function buildModelChain(
  env: Env,
  hasAttachments: boolean,
  longOutput = false,
  useLocal = false,
): ChatModelCandidate[] {
  const geminiKey = env["GEMINI_API_KEY"];
  const google = geminiKey ? createGoogleGenerativeAI({ apiKey: geminiKey }) : null;

  const clients = new Map<string, ReturnType<typeof createOpenAI>>();
  for (const [name, cfg] of Object.entries(OPENAI_COMPATIBLE)) {
    const apiKey = env[cfg.keyEnv];
    if (apiKey) clients.set(name, createOpenAI({ apiKey, baseURL: cfg.baseURL, name }));
  }

  const chain: ChatModelCandidate[] = [];
  if (useLocal && (!hasAttachments || env["LOCAL_LLM_VISION"] === "1")) {
    const client = createOpenAI({
      apiKey: env["LOCAL_LLM_KEY"] || "local",
      baseURL: env["LOCAL_LLM_BASE_URL"]!,
      name: "local",
    });
    chain.push({
      label: `local/${env["LOCAL_LLM_MODEL"]}`,
      model: client.chat(env["LOCAL_LLM_MODEL"]!),
      isGemini: false,
      multimodal: env["LOCAL_LLM_VISION"] === "1",
      maxOutputTokens: 8000,
      local: true,
    });
  }
  for (const [provider, id] of RANKED) {
    if (provider === "gemini") {
      if (!google) continue;
      chain.push({
        label: `gemini/${id}`,
        model: google(id),
        isGemini: true,
        multimodal: true,
        // Gemini Flash models can write far more; documents need the room.
        maxOutputTokens: 24000,
      });
      continue;
    }
    if (hasAttachments) continue;
    // Groq's free tier caps prompt + reply too tightly for long documents
    // (a cut-off PDF is worse than using a different model).
    if (longOutput && provider === "groq") continue;
    const client = clients.get(provider);
    if (!client) continue;
    chain.push({
      label: `${provider}/${id}`,
      model: client.chat(id),
      isGemini: false,
      multimodal: false,
      // Groq's free tier rejects a request when prompt + max output exceeds
      // its per-minute token budget, so keep its cap lower.
      maxOutputTokens: provider === "groq" ? 3000 : 12000,
    });
  }
  return chain;
}
