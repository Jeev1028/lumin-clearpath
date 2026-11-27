import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { SiteHeader } from "@/components/lumin/SiteHeader";
import { UniChat } from "@/components/lumin/UniChat";
import { supabase } from "@/integrations/supabase/client";
import type { UniProgramRow } from "@/lib/uni-assistant-prompt";
import { cn } from "@/lib/utils";

const TITLE = "Lumin UNI — Compare computer science in BC and Ontario";
const DESC =
  "Compare first-year tuition, degree length and published admission averages for computer science at six universities in BC and Ontario, with a source for every fact.";

export const Route = createFileRoute("/uni")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
    ],
  }),
  component: UniPage,
  // A crash here must stay on /uni and never take down the rest of the app.
  errorComponent: () => (
    <div className="min-h-screen bg-deep">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="font-display text-3xl font-semibold">Lumin UNI hit a problem</h1>
        <p className="mt-3 text-muted-foreground">
          Reload the page to try again. The rest of ClearPath is not affected.
        </p>
      </main>
    </div>
  ),
});

type Row = UniProgramRow & { id: number };

const MIN = 75;
const MAX = 100;
const pct = (v: number) => Math.min(100, Math.max(0, ((v - MIN) / (MAX - MIN)) * 100));
const money = (n: number) =>
  "$" +
  n.toLocaleString("en-CA", {
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });

async function fetchPrograms(): Promise<Row[]> {
  // The uni tables are not in the generated Database types, so query untyped.
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (s: string) => { order: (c: string) => Promise<{ data: Row[] | null; error: unknown }> };
    };
  })
    .from("programs")
    .select("*,universities(name,province),fact_sources(source_url,verified,date_accessed)")
    .order("id");
  if (error || !data) throw new Error("Could not load programs");
  return data;
}

function UniPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["uni-programs"], queryFn: fetchPrograms });
  const [avg, setAvg] = useState(90);
  const [prov, setProv] = useState<"" | "BC" | "ON">("");
  const [sort, setSort] = useState<"name" | "tuition" | "avg">("name");
  const [tmax, setTmax] = useState(17000);

  const list = useMemo(() => {
    const rows = (data ?? []).filter(
      (p) =>
        (!prov || p.universities.province === prov) &&
        (tmax >= 17000 || (p.tuition_first_year_cad != null && +p.tuition_first_year_cad <= tmax)),
    );
    return rows.sort((x, y) =>
      sort === "tuition"
        ? (+(x.tuition_first_year_cad ?? 1e9)) - +(y.tuition_first_year_cad ?? 1e9)
        : sort === "avg"
          ? Number(x.avg_low == null) - Number(y.avg_low == null) || +(x.avg_low ?? 0) - +(y.avg_low ?? 0)
          : x.universities.name.localeCompare(y.universities.name),
    );
  }, [data, prov, sort, tmax]);

  return (
    <div className="min-h-screen bg-deep">
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-5xl px-6 pb-20">
        <section className="pt-12 pb-6">
          <h1 className="max-w-3xl font-display text-4xl leading-[1.05] font-semibold sm:text-6xl">
            Where can your average take you in computer science?
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Six universities in BC and Ontario, side by side: first-year tuition, degree length and
            the admission average each one publishes. Every fact links to the page it came from.
          </p>
          <p className="mt-6 max-w-2xl rounded-xl border-l-4 border-accent bg-card/60 px-4 py-3 text-sm">
            <b>Read this first.</b> A student collected these facts from each university's own
            website. They can be out of date or wrong, and this site is not affiliated with any
            university. Confirm on the university's page before you apply.
          </p>
        </section>

        {isLoading && <p className="py-10 text-muted-foreground">Loading programs…</p>}
        {isError && (
          <p className="py-10 text-destructive">
            The programs could not be loaded. Check your connection and reload the page.
          </p>
        )}

        {data && (
          <>
            <section
              aria-labelledby="ladder-h"
              className="mt-6 rounded-3xl border border-border/70 bg-card/70 p-5 shadow-panel sm:p-7"
            >
              <h2 id="ladder-h" className="font-display text-2xl font-semibold">
                Your average against published ranges
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Universities mostly publish bands such as "low 90s", not exact cutoffs. Each bar is
                our reading of that wording, so treat the edges as soft.
              </p>
              <div className="mt-5 flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Your average (%)
                  <input
                    type="number"
                    min={60}
                    max={100}
                    step={0.5}
                    value={avg}
                    inputMode="decimal"
                    onChange={(e) => setAvg(+e.target.value || 0)}
                    className="w-32 rounded-xl border-2 border-border bg-background/60 px-3 py-1.5 font-display text-2xl font-semibold"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Slide to try a different average
                  <input
                    type="range"
                    min={70}
                    max={100}
                    step={0.5}
                    value={avg}
                    onChange={(e) => setAvg(+e.target.value)}
                    className="w-72 max-w-[80vw] accent-[var(--primary)]"
                  />
                </label>
              </div>

              <div className="mt-6 grid grid-cols-[84px_1fr] items-center gap-x-3 sm:grid-cols-[130px_1fr]" role="list">
                <div />
                <div className="relative pt-7 text-xs text-muted-foreground" aria-hidden>
                  <div className="flex justify-between">
                    {[75, 80, 85, 90, 95, 100].map((n) => (
                      <span key={n}>{n}%</span>
                    ))}
                  </div>
                  <b
                    className="absolute top-0 -translate-x-1/2 rounded-md bg-primary px-2 py-0.5 text-xs whitespace-nowrap text-primary-foreground transition-[left]"
                    style={{ left: `${pct(avg)}%` }}
                  >
                    You: {avg}%
                  </b>
                </div>
                {data.map((p) => {
                  const none = p.avg_low == null;
                  const lo = +(p.avg_low ?? 0);
                  const hi = +(p.avg_high ?? 0);
                  const status = none
                    ? "No published range to compare with."
                    : avg < lo
                      ? `Your ${avg}% is below the published range.`
                      : avg > hi && !p.avg_open_ended
                        ? `Your ${avg}% is above the published range.`
                        : `Your ${avg}% is inside the published range.`;
                  return (
                    <div key={p.id} className="contents" role="listitem">
                      <div className="border-t border-border/60 py-3 font-display text-sm font-semibold">
                        {p.universities.name}
                      </div>
                      <div className="relative h-11 border-t border-border/60">
                        {none ? (
                          <div className="absolute inset-x-0 top-[11px] h-[22px] overflow-hidden rounded-full bg-muted/60 pl-3 text-xs leading-[22px] whitespace-nowrap text-muted-foreground">
                            No first-year range published
                          </div>
                        ) : (
                          <div
                            className={cn(
                              "absolute top-[11px] h-[22px] bg-accent",
                              p.avg_open_ended
                                ? "rounded-l-full [mask-image:linear-gradient(90deg,#000_55%,transparent)]"
                                : "rounded-full",
                            )}
                            style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }}
                          />
                        )}
                        {!none && (
                          <span
                            className="absolute top-[11px] z-10 hidden pl-3 text-xs sm:block leading-[22px] font-semibold whitespace-nowrap text-accent-foreground"
                            style={{ left: `${pct(lo)}%` }}
                          >
                            {p.admission_range_text}
                          </span>
                        )}
                        <div
                          className="absolute top-0 bottom-0 z-20 border-l-[3px] border-primary"
                          style={{ left: `${pct(avg)}%` }}
                        />
                      </div>
                      <div className="col-start-2 pb-2 text-xs text-muted-foreground">
                        {!none && <b className="text-foreground sm:hidden">{p.admission_range_text}. </b>}
                        {status}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 max-w-3xl text-xs text-muted-foreground">
                Bright bar: the published range. A bar that fades to the right is a minimum with no
                top end. Grey: no first-year range published. Reading used: high 80s is 87–89, low
                90s is 90–93, mid 90s is 94–96.
              </p>
            </section>

            <section className="mt-8">
              <UniChat average={avg} />
            </section>

            <section aria-labelledby="cmp-h" className="mt-10">
              <h2 id="cmp-h" className="font-display text-2xl font-semibold">
                Compare the programs
              </h2>
              <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-4">
                <div>
                  <div className="mb-1 text-sm font-medium" id="prov-l">
                    Province
                  </div>
                  <div role="group" aria-labelledby="prov-l" className="inline-flex overflow-hidden rounded-xl border-2 border-border">
                    {([["", "All"], ["BC", "BC"], ["ON", "Ontario"]] as const).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={prov === v}
                        onClick={() => setProv(v)}
                        className={cn(
                          "px-4 py-2 text-sm font-semibold",
                          prov === v ? "bg-primary text-primary-foreground" : "bg-background/40",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Sort by
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as typeof sort)}
                    className="rounded-xl border-2 border-border bg-background/60 px-3 py-2 text-sm"
                  >
                    <option value="name">University</option>
                    <option value="tuition">First-year tuition, lowest first</option>
                    <option value="avg">Admission average, lowest first</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  <span>
                    Max tuition: <b>{tmax >= 17000 ? "any" : `$${tmax.toLocaleString()}`}</b>
                  </span>
                  <input
                    type="range"
                    min={6000}
                    max={17000}
                    step={500}
                    value={tmax}
                    onChange={(e) => setTmax(+e.target.value)}
                    className="w-52 accent-[var(--primary)]"
                  />
                </label>
              </div>
              <p className="mt-4 mb-3 text-sm text-muted-foreground" aria-live="polite">
                {list.length
                  ? `${list.length} of ${data.length} programs shown.`
                  : "No program fits those filters. Raise the tuition limit or choose All provinces."}
              </p>
              <div className="space-y-3">
                {list.map((p) => (
                  <ProgramCard key={p.id} p={p} />
                ))}
              </div>
            </section>

            <footer className="mt-12 max-w-3xl text-sm text-muted-foreground">
              Facts are collected one page at a time from each university's public pages, then
              re-checked against a second page where we could. "Checked twice" means two official
              pages agree. "Checked once" means we found it on one page. Tuition is for Canadian
              students for 2026/27, and what it includes differs by university, so read the note
              under each figure.
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function ProgramCard({ p }: { p: Row }) {
  const f = p.fact_sources[0];
  const twice = !!f?.verified;
  const srcs = (f?.source_url ?? p.application_url).split(" ; ");
  const host = (u: string) => {
    try {
      return new URL(u).hostname;
    } catch {
      return u;
    }
  };
  return (
    <article className="overflow-hidden rounded-2xl border border-border/70 bg-card/70">
      <div className="grid gap-x-5 gap-y-3 p-5 sm:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="col-span-full sm:col-span-1">
          <h3 className="font-display text-lg leading-tight font-semibold">
            {p.universities.name}: {p.title}
          </h3>
          <div className="mt-1 text-sm text-muted-foreground">
            {p.campus ?? "Campus not confirmed"},{" "}
            {p.universities.province === "BC" ? "British Columbia" : "Ontario"}
          </div>
        </div>
        <Stat k="First-year tuition" note={p.tuition_includes_fees ? "includes fees" : "tuition only"}>
          {p.tuition_first_year_cad ? money(+p.tuition_first_year_cad) : "Not found"}
        </Stat>
        <Stat k="Degree length">
          {p.degree_length_years ? `${+p.degree_length_years} years` : "Not found"}
        </Stat>
        <div>
          <div className="text-xs text-muted-foreground">Published average</div>
          <div className="font-display text-lg font-semibold">{p.admission_range_text ?? "None"}</div>
          <span
            className={cn(
              "mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold",
              twice ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-400/20 text-amber-200",
            )}
          >
            {twice ? "Checked twice" : "Checked once"}
          </span>
        </div>
      </div>
      <details className="group border-t border-border/60">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold">
          How we know this
          <span aria-hidden className="text-xl leading-none group-open:hidden">+</span>
          <span aria-hidden className="hidden text-xl leading-none group-open:inline">−</span>
        </summary>
        <div className="grid gap-5 px-5 pb-5 text-sm sm:grid-cols-2">
          <div>
            <h4 className="font-semibold">Tuition basis</h4>
            <p className="text-muted-foreground">{p.tuition_basis}</p>
          </div>
          <div>
            <h4 className="font-semibold">Admission notes</h4>
            <p className="text-muted-foreground">{p.min_average_note}</p>
          </div>
          <div>
            <h4 className="font-semibold">Sources, checked {f?.date_accessed}</h4>
            <ul className="list-disc pl-5">
              {srcs.map((u) => (
                <li key={u}>
                  <a href={u} rel="noopener noreferrer" className="text-accent underline underline-offset-4">
                    {host(u)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold">Ready to apply?</h4>
            <a
              href={p.application_url}
              rel="noopener noreferrer"
              className="mt-1 inline-block rounded-xl bg-gradient-lumin px-4 py-2 font-semibold text-primary-foreground"
            >
              Open the university's application page
            </a>
          </div>
        </div>
      </details>
    </article>
  );
}

function Stat({ k, note, children }: { k: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-display text-lg font-semibold">{children}</div>
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}
