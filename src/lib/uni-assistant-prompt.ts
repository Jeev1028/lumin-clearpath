export type UniProgramRow = {
  title: string;
  campus: string | null;
  degree_length_years: number | null;
  tuition_first_year_cad: number | null;
  tuition_basis: string | null;
  tuition_includes_fees: boolean | null;
  min_average_note: string | null;
  application_url: string;
  admission_range_text: string | null;
  avg_low: number | null;
  avg_high: number | null;
  avg_open_ended: boolean;
  application_deadline?: string | null;
  deadline_note?: string | null;
  prerequisites_text?: string | null;
  universities: { name: string; province: string };
  fact_sources: { source_url: string; verified: boolean; date_accessed: string }[];
};

// One compact line block per program, so the model answers only from what was
// actually collected and can say "not published" instead of guessing.
export function describePrograms(rows: UniProgramRow[]): string {
  return rows
    .map((p) => {
      const src = p.fact_sources[0];
      const range = p.admission_range_text
        ? `${p.admission_range_text} (our numeric reading: ${p.avg_low}-${
            p.avg_open_ended ? "100+" : p.avg_high
          }%)`
        : "none published for first-year entry";
      return [
        `${p.universities.name} (${p.universities.province}): ${p.title}`,
        `  campus: ${p.campus ?? "not confirmed"}; length: ${
          p.degree_length_years ? `${p.degree_length_years} years` : "not found"
        }`,
        `  first-year tuition: ${
          p.tuition_first_year_cad ? `$${p.tuition_first_year_cad}` : "not found"
        } (${p.tuition_includes_fees ? "includes fees" : "tuition only"}); basis: ${p.tuition_basis ?? "n/a"}`,
        `  published admission average: ${range}`,
        `  application deadline (Sept 2027 entry): ${
          p.application_deadline
            ? `${p.application_deadline}${p.deadline_note ? ` (${p.deadline_note})` : ""}`
            : "NOT COLLECTED YET, do not guess one"
        }`,
        `  required high school courses: ${p.prerequisites_text ?? "NOT COLLECTED YET, do not guess"}`,
        `  notes: ${p.min_average_note ?? "none"}`,
        `  verification: ${src?.verified ? "checked on two official pages" : "checked on one page only"}; collected ${
          src?.date_accessed ?? "unknown date"
        }`,
        `  apply: ${p.application_url}`,
      ].join("\n");
    })
    .join("\n\n");
}

export function buildUniPrompt(programData: string): string {
  return `You are the Lumin UNI guide, part of ClearPath. You help Grade 11 and 12 students in BC and Ontario compare computer science programs at six universities, using ONLY the collected data below.

RULES
- Answer only from the data below. If a fact is not in it, say it was not found or not published. Never invent or estimate numbers, deadlines, rankings, or admission chances.
- Never explain WHY a university does or does not publish something, or describe how its admissions or programs work, unless the data says so. Say only what the data says, e.g. "UBC publishes no first-year average; only post-first-year specialization cutoffs exist".
- Universities publish admission averages as bands such as "low 90s", not exact cutoffs. Treat them as soft guidance, never as a guarantee or a prediction of admission.
- Always mention what a tuition figure includes (fees or tuition only), because the figures are not directly comparable.
- Say plainly when a fact was checked on only one page, and when a value is unconfirmed (UVic campus and length, McMaster campus).
- Tell students to confirm on the university's own page before applying. Give the apply link when it helps.
- You are not the study tutor. If asked for homework help or anything unrelated to choosing a program, say that real tutoring happens with Lumin AI inside ClearPath after signing in, and steer back.
- Keep answers short: 2 to 5 sentences, or a short list when comparing. Plain, friendly language.

COLLECTED DATA (2026-27, Canadian students)
${programData}`;
}
