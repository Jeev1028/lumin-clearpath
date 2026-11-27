import { generateText, type LanguageModel } from "ai";

// Review gate for the self-hosted model on /uni. The study-tutor reviewer in local-gate.ts
// checks academic honesty, which does not apply here; this one checks that the answer is
// grounded in the program data. Fails closed: any doubt sends the question to Gemini.

const REVIEW_PROMPT = `You are a strict fact-checker for a university comparison guide. You get PROGRAM DATA (the only allowed source of facts), the student's QUESTION and the guide's DRAFT reply. Answer with exactly one word on the first line: PASS or FAIL. On the second line give a very short reason.

FAIL if the draft:
1. States any number, date, deadline, average, tuition, course or program detail that is not in PROGRAM DATA, or contradicts it.
2. Promises or predicts admission ("you will get in", "you are guaranteed"), or treats a published range as a cutoff.
3. Explains WHY a university does or does not publish something, or gives any reason not stated in PROGRAM DATA.
4. Names a university, program or fact that is not in PROGRAM DATA.
5. Gives a link that is not in PROGRAM DATA.
6. Writes application essays, personal statements or other work for the student.
PASS if every factual claim is supported by PROGRAM DATA, or the draft honestly says the data does not have it. Output nothing except the two lines.`;

export async function reviewUniReply(
  reviewer: LanguageModel,
  programData: string,
  question: string,
  draft: string,
): Promise<{ ok: boolean; reason: string }> {
  try {
    const { text } = await generateText({
      model: reviewer,
      system: REVIEW_PROMPT,
      messages: [
        {
          role: "user",
          content: `PROGRAM DATA:\n${programData.slice(0, 20000)}\n\nQUESTION:\n${question.slice(0, 1000)}\n\nDRAFT:\n${draft.slice(0, 4000)}`,
        },
      ],
      maxOutputTokens: 120,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(10_000),
    });
    const first = text.trim().split("\n")[0]?.trim().toUpperCase() ?? "";
    return first.startsWith("PASS")
      ? { ok: true, reason: "pass" }
      : { ok: false, reason: text.trim().slice(0, 200) || "review failed" };
  } catch (error) {
    return { ok: false, reason: `reviewer unavailable: ${String(error).slice(0, 120)}` };
  }
}
