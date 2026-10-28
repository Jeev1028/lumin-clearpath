import { createFileRoute } from "@tanstack/react-router";

import { requireUser } from "@/lib/api-auth";

// Natural read-aloud voice via ElevenLabs. The API key lives only in the
// ELEVENLABS_API_KEY environment variable on the server; the browser and the
// repo never see it. The free plan only has ~10k characters a month, so the
// request size and per-user daily total are capped, and the client falls back
// to the browser's own voice whenever this route says no.

const MAX_CHARS_PER_REQUEST = 1500;
const MAX_CHARS_PER_USER_PER_DAY = 4000;
const MODEL_ID = "eleven_flash_v2_5";

type Kind = "female" | "male";

// ElevenLabs' ready-made voices (usable on the free plan). The ids are only a
// fallback: the voice is looked up by name in the account first, so a changed
// id does not break anything.
const VOICES: Record<Kind, { name: string; fallbackId: string; envKey: string }> = {
  female: { name: "Sarah", fallbackId: "EXAVITQu4vr4xnSDxMaL", envKey: "ELEVENLABS_VOICE_FEMALE" },
  male: { name: "Brian", fallbackId: "nPczCjzI2devNBz1zQrb", envKey: "ELEVENLABS_VOICE_MALE" },
};

const voiceIdCache = new Map<Kind, string>();

async function resolveVoiceId(kind: Kind, apiKey: string): Promise<string> {
  const spec = VOICES[kind];
  const override = process.env[spec.envKey];
  if (override) return override;
  const cached = voiceIdCache.get(kind);
  if (cached) return cached;
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as { voices?: { voice_id: string; name: string }[] };
      const match = data.voices?.find((v) =>
        v.name.toLowerCase().startsWith(spec.name.toLowerCase()),
      );
      if (match) {
        voiceIdCache.set(kind, match.voice_id);
        return match.voice_id;
      }
    }
  } catch {
    // fall through to the built-in id
  }
  return spec.fallbackId;
}

// Best-effort per-user daily budget (resets when the server instance restarts).
const usage = new Map<string, { day: string; chars: number }>();

function takeBudget(userId: string, chars: number): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const entry = usage.get(userId);
  const used = entry && entry.day === day ? entry.chars : 0;
  if (used + chars > MAX_CHARS_PER_USER_PER_DAY) return false;
  usage.set(userId, { day, chars: used + chars });
  return true;
}

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const apiKey = process.env["ELEVENLABS_API_KEY"];
        if (!apiKey) return new Response("Voice is not configured", { status: 503 });

        const body = (await request.json().catch(() => null)) as {
          text?: unknown;
          voice?: unknown;
        } | null;
        const text =
          typeof body?.text === "string" ? body.text.trim().slice(0, MAX_CHARS_PER_REQUEST) : "";
        if (!text) return new Response("Nothing to read", { status: 400 });
        const kind: Kind = body?.voice === "male" ? "male" : "female";

        if (!takeBudget(auth.userId, text.length)) {
          return new Response("Daily natural-voice limit reached", { status: 429 });
        }

        const voiceId = await resolveVoiceId(kind, apiKey);
        let upstream: Response;
        try {
          upstream = await fetch(
            "https://api.elevenlabs.io/v1/text-to-speech/" +
              encodeURIComponent(voiceId) +
              "?output_format=mp3_44100_64",
            {
              method: "POST",
              headers: {
                "xi-api-key": apiKey,
                "Content-Type": "application/json",
                Accept: "audio/mpeg",
              },
              body: JSON.stringify({ text, model_id: MODEL_ID }),
              signal: AbortSignal.timeout(25_000),
            },
          );
        } catch (err) {
          console.error("[tts] request failed", err instanceof Error ? err.name : "error");
          return new Response("Voice is unavailable right now", { status: 502 });
        }
        if (!upstream.ok || !upstream.body) {
          // Status only: never log the key or the response body.
          console.error("[tts] ElevenLabs returned", upstream.status);
          return new Response("Voice is unavailable right now", { status: 502 });
        }
        return new Response(upstream.body, {
          headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store" },
        });
      },
    },
  },
});
