import { generateText, type LanguageModel, type ModelMessage, type UIMessageChunk } from "ai";

// Review gate for the self-hosted model.
//
// A small local model follows Lumin's academic-honesty rules less reliably than
// the hosted ones: in testing it would refuse and then write the sample
// paragraph, solve the student's exact problem, or invent links anyway. So a
// local reply is never streamed straight to the student. It is generated in
// full, checked, and only released if it passes. If it fails (or the check
// itself can't run), the request falls through to the hosted models, which is
// always the safe direction.
//
// Set LOCAL_LLM_GATE=0 to bypass the gate (owner testing only).

export function gateEnabled(env: Record<string, string | undefined>): boolean {
  return env["LOCAL_LLM_GATE"] !== "0";
}

const REVIEW_PROMPT = `You are a strict reviewer for a student study app whose tutor must NEVER do a student's work for them. You will see the student's latest message and the tutor's draft reply. Answer with exactly one word on the first line: PASS or FAIL. Then, on the second line, a very short reason.

FAIL if the draft does ANY of these, even if it also refuses or says it can't:
1. Contains text a student could copy into their own assignment: a sample, starter, model or example sentence/paragraph about THEIR topic, a draft thesis or conclusion, a rewritten or corrected version of THEIR text, an essay/report/lab-report skeleton filled in with content, or a filled-in outline for their topic.
2. Solves, works through, or states the answer to the student's SPECIFIC problem (their equation, integral, question, test item), including partial or step-by-step working on their exact numbers. Worked examples on clearly DIFFERENT numbers or a different problem are fine.
3. Writes a citation, works-cited entry, or in-text citation, or gives any link that is not a plain main page of a well-known site, or any invented title, author, year, quote or statistic.
4. For a research request, gives a full breakdown of the topic (several explained factors, stages or causes) instead of a short orientation plus leads.
5. Praises or validates weak work as "a good start"/"strong" without a real assessment.

PASS if it only does things like these:
- A short refusal that offers to help with the method and asks the student what they have so far, or names in general terms what a lab report/essay needs (for example "a lab report has a method and results section") without writing any content for their topic.
- A short explanation of a general concept or formula the student asked about, or a worked example on clearly DIFFERENT numbers or a different problem, followed by asking the student to try their own.
- Honest descriptive feedback on their own work that does not give replacement wording.
- A list of well-known main-page links with no citations.
Do NOT fail a reply just because it mentions the assignment, uses a bullet list of questions, or explains a concept briefly. Fail only for the numbered problems above. Any step, substitution or result computed on the student's OWN numbers is FAIL, even if the reply also says it will use a different example afterwards. Output nothing except the two lines.`;

export type GateVerdict = { ok: boolean; reason: string };

/** Asks a hosted model whether the draft is safe to show. Fails closed. */
export async function reviewReply(
  reviewer: LanguageModel,
  studentMessage: string,
  draft: string,
): Promise<GateVerdict> {
  try {
    const { text } = await generateText({
      model: reviewer,
      system: REVIEW_PROMPT,
      messages: [
        {
          role: "user",
          content: `STUDENT MESSAGE:\n${studentMessage.slice(0, 4000)}\n\nTUTOR DRAFT REPLY:\n${draft.slice(0, 12000)}`,
        },
      ],
      maxOutputTokens: 120,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(10_000),
    });
    const first = text.trim().split("\n")[0]?.trim().toUpperCase() ?? "";
    if (first.startsWith("PASS")) return { ok: true, reason: "pass" };
    return { ok: false, reason: text.trim().slice(0, 200) || "review failed" };
  } catch (error) {
    return { ok: false, reason: `reviewer unavailable: ${String(error).slice(0, 120)}` };
  }
}

const URL_RE = /https?:\/\/[^\s)\]>"'`]+/g;

// Only these exact hosts are ever fetched: the ones our university data came from. Anything
// else in a draft fails the gate without a request, so a prompt cannot make the server call
// internal addresses (SSRF). Exact names, not wildcards, so a stray or hijacked subdomain is out.
// shortcut: no DNS-resolution check or IP pinning; this runtime's fetch cannot reach private
// ranges, but add a resolved-IP check if the gate ever runs somewhere that can.
const ALLOWED_HOSTS = new Set([
  "students.ubc.ca",
  "you.ubc.ca",
  "www.sfu.ca",
  "www.uvic.ca",
  "uwaterloo.ca",
  "cs.uwaterloo.ca",
  "future.mcmaster.ca",
  "registrar.mcmaster.ca",
  "www.eng.mcmaster.ca",
  "future.utoronto.ca",
  "www.artsci.utoronto.ca",
  "tuitionexplorer.registrar.utoronto.ca",
]);
const MAX_REDIRECTS = 3;

function allowedUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.port !== "" || u.username || u.password) return null;
  return ALLOWED_HOSTS.has(u.hostname.toLowerCase()) ? u : null;
}

/** True only if every link in the draft is on an allowed host and really resolves. */
export async function linksResolve(draft: string): Promise<boolean> {
  const urls = [...new Set((draft.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, "")))];
  if (urls.length === 0) return true;
  if (urls.length > 6) return false;
  const results = await Promise.all(
    urls.map(async (raw) => {
      try {
        let current = allowedUrl(raw);
        // Follow redirects by hand so every hop is checked against the allowlist.
        for (let hop = 0; current && hop <= MAX_REDIRECTS; hop++) {
          const res = await fetch(current, {
            method: "GET",
            redirect: "manual",
            signal: AbortSignal.timeout(5000),
            headers: { "User-Agent": "Mozilla/5.0 (compatible; LuminLinkCheck/1.0)" },
          });
          void res.body?.cancel();
          if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get("location");
            current = loc ? allowedUrl(new URL(loc, current).toString()) : null;
            continue;
          }
          // Sites that block bots answer 401/403/405/429 for pages that do exist.
          return res.status < 400 || [401, 403, 405, 429].includes(res.status);
        }
        return false;
      } catch {
        return false;
      }
    }),
  );
  return results.every(Boolean);
}

/** Wraps already-approved text as the chunks a streamed reply would carry. */
export function textAsStream(text: string): ReadableStream<UIMessageChunk> {
  const id = `local-${Date.now()}`;
  const chunks: UIMessageChunk[] = [
    { type: "start" },
    { type: "start-step" },
    { type: "text-start", id },
    { type: "text-delta", id, delta: text },
    { type: "text-end", id },
    { type: "finish-step" },
    { type: "finish" },
  ] as UIMessageChunk[];
  return new ReadableStream<UIMessageChunk>({
    start(c) {
      for (const chunk of chunks) c.enqueue(chunk);
      c.close();
    },
  });
}

/** The last thing the student typed, for the reviewer. */
export function lastStudentText(messages: ModelMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    return m.content.map((p) => (p.type === "text" ? p.text : "")).join(" ");
  }
  return "";
}
