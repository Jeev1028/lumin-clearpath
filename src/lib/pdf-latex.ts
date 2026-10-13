// Some models write LaTeX even though they are told not to. The PDF has no
// LaTeX engine, so turn the common commands into real Unicode symbols.

const SYMBOLS: Record<string, string> = {
  cap: "∩",
  cup: "∪",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  supset: "⊃",
  emptyset: "∅",
  varnothing: "∅",
  infty: "∞",
  times: "×",
  div: "÷",
  cdot: "·",
  pm: "±",
  mp: "∓",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ne: "≠",
  neq: "≠",
  approx: "≈",
  equiv: "≡",
  pi: "π",
  theta: "θ",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  Delta: "Δ",
  lambda: "λ",
  mu: "μ",
  sigma: "σ",
  Sigma: "Σ",
  omega: "ω",
  Omega: "Ω",
  phi: "φ",
  rightarrow: "→",
  to: "→",
  leftarrow: "←",
  Rightarrow: "⇒",
  Leftrightarrow: "⇔",
  leftrightarrow: "↔",
  therefore: "∴",
  because: "∵",
  forall: "∀",
  exists: "∃",
  neg: "¬",
  land: "∧",
  lor: "∨",
  angle: "∠",
  degree: "°",
  circ: "°",
  sum: "Σ",
  prod: "∏",
  int: "∫",
  partial: "∂",
  nabla: "∇",
  ldots: "…",
  dots: "…",
  cdots: "⋯",
  mid: "|",
  vert: "|",
  quad: " ",
  qquad: "  ",
  mathbb: "",
};

const SUPER: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  n: "ⁿ",
};
const SUB: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
};

function mapAll(value: string, table: Record<string, string>): string | null {
  const chars = [...value];
  return chars.every((c) => table[c]) ? chars.map((c) => table[c]).join("") : null;
}

function mathToUnicode(math: string): string {
  let m = math;
  for (let i = 0; i < 4; i++) {
    m = m
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_a, n: string, d: string) => {
        const wrap = (v: string) => (/^[\w.]+$/.test(v) ? v : `(${v})`);
        return `${wrap(n)}/${wrap(d)}`;
      })
      .replace(/\\sqrt\{([^{}]*)\}/g, "√($1)")
      .replace(/\\mathbb\{Z\}/g, "ℤ")
      .replace(/\\mathbb\{R\}/g, "ℝ")
      .replace(/\\mathbb\{N\}/g, "ℕ")
      .replace(/\\mathbb\{Q\}/g, "ℚ")
      .replace(/\\(?:text|mathrm|mathbf|textbf|mathit|operatorname)\{([^{}]*)\}/g, "$1");
  }
  m = m
    .replace(/\\(?:left|right|big|Big)(?![A-Za-z])/g, "")
    .replace(/\\([A-Za-z]+)/g, (_all, name: string) => SYMBOLS[name] ?? name)
    .replace(/\\[,;:! ]/g, " ")
    .replace(/\\([{}%&#_$])/g, "$1")
    .replace(/\^\{([^{}]*)\}/g, (_a, v: string) => mapAll(v, SUPER) ?? `^(${v})`)
    .replace(/\^([0-9n])/g, (_a, v: string) => SUPER[v] ?? `^${v}`)
    .replace(/_\{([^{}]*)\}/g, (_a, v: string) => mapAll(v, SUB) ?? `_${v}`)
    .replace(/_([0-9])/g, (_a, v: string) => SUB[v] ?? `_${v}`)
    .replace(/ {2,}/g, " ");
  return m.trim();
}

export function stripLatex(markdown: string): string {
  return markdown
    .replace(/\$\$([\s\S]+?)\$\$/g, (_a, m: string) => mathToUnicode(m))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_a, m: string) => mathToUnicode(m))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_a, m: string) => mathToUnicode(m))
    .replace(/(?<![\\$\d])\$(?!\s)([^$\n]{1,200}?)(?<!\s)\$(?!\d)/g, (_a, m: string) =>
      mathToUnicode(m),
    );
}
