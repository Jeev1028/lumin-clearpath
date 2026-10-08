import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// Ordered best -> lightest list of models Lumin can answer with. Every chat
// message starts at the top and walks down until one responds, so students
// move back up as soon as better models recover.
//
// The goal is to stay on free tiers: each provider/model has its own separate
// quota, so more entries means more free headroom. A provider is only used if
// its API key is set in the environment, so adding a key (in Vercel ->
// Environment Variables) switches that provider on with no code change.
//
// Non-Gemini providers are reached through their OpenAI-compatible endpoints.
// Model IDs for third parties change over time; a retired ID just fails fast
// and the chain moves on, so fix the ID here if one stops working.

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

const GEMINI_TOP = ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.5-flash"];
const GEMINI_TAIL = [
  "gemini-3.7-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite-preview",
];

type OpenAICompatibleProvider = {
  name: string;
  keyEnv: string;
  baseURL: (env: Env) => string | null;
  models: string[];
};

const OPENAI_COMPATIBLE: OpenAICompatibleProvider[] = [
  {
    name: "groq",
    keyEnv: "GROQ_API_KEY",
    baseURL: () => "https://api.groq.com/openai/v1",
    models: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
  },
  {
    name: "cerebras",
    keyEnv: "CEREBRAS_API_KEY",
    baseURL: () => "https://api.cerebras.ai/v1",
    models: ["gpt-oss-120b", "qwen-3-235b-a22b-instruct-2507"],
  },
  {
    name: "openrouter",
    keyEnv: "OPENROUTER_API_KEY",
    baseURL: () => "https://openrouter.ai/api/v1",
    models: [
      "nvidia/nemotron-3-super-120b-a12b:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "google/gemma-4-31b-it:free",
      // OpenRouter's own router: picks whichever free model is up.
      "openrouter/free",
    ],
  },
  {
    name: "mistral",
    keyEnv: "MISTRAL_API_KEY",
    baseURL: () => "https://api.mistral.ai/v1",
    models: ["mistral-medium-latest", "mistral-small-latest", "ministral-14b-latest"],
  },
  {
    name: "github-models",
    keyEnv: "GITHUB_MODELS_TOKEN",
    baseURL: () => "https://models.github.ai/inference",
    models: ["openai/gpt-4.1", "openai/gpt-4.1-mini"],
  },
  {
    name: "nvidia",
    keyEnv: "NVIDIA_API_KEY",
    baseURL: () => "https://integrate.api.nvidia.com/v1",
    models: ["meta/llama-3.3-70b-instruct"],
  },
  {
    name: "cloudflare",
    keyEnv: "CLOUDFLARE_API_TOKEN",
    baseURL: (env) =>
      env["CLOUDFLARE_ACCOUNT_ID"]
        ? `https://api.cloudflare.com/client/v4/accounts/${env["CLOUDFLARE_ACCOUNT_ID"]}/ai/v1`
        : null,
    models: ["@cf/openai/gpt-oss-120b", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"],
  },
];

/**
 * Builds the model chain for one request. When the conversation contains
 * attachments, text-only providers are left out so the file isn't dropped.
 */
export function buildModelChain(env: Env, hasAttachments: boolean): ChatModelCandidate[] {
  const chain: ChatModelCandidate[] = [];

  const geminiKey = env["GEMINI_API_KEY"];
  const google = geminiKey ? createGoogleGenerativeAI({ apiKey: geminiKey }) : null;
  const gemini = (id: string): ChatModelCandidate => ({
    label: `gemini/${id}`,
    model: google!(id),
    isGemini: true,
    multimodal: true,
  });

  if (google) chain.push(...GEMINI_TOP.map(gemini));

  if (!hasAttachments) {
    for (const provider of OPENAI_COMPATIBLE) {
      const apiKey = env[provider.keyEnv];
      const baseURL = provider.baseURL(env);
      if (!apiKey || !baseURL) continue;
      const client = createOpenAI({ apiKey, baseURL, name: provider.name });
      for (const id of provider.models) {
        chain.push({
          label: `${provider.name}/${id}`,
          model: client.chat(id),
          isGemini: false,
          multimodal: false,
        });
      }
    }
  }

  if (google) chain.push(...GEMINI_TAIL.map(gemini));

  return chain;
}
