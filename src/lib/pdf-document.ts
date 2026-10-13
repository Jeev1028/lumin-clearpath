// Lumin can author real PDF documents (practice tests, study guides, plans).
// To stay model-agnostic -- every fallback model can do this, no tool-calling
// needed -- Lumin wraps the document in a marker block inside its reply:
//
//   :::pdf Document title
//   ...Markdown...
//   :::
//
// The chat window turns that block into a downloadable file card instead of
// showing the raw text, and this module builds the actual PDF in the browser.

import { stripLatex } from "./pdf-latex";

export type MessageSegment =
  | { kind: "text"; text: string }
  | { kind: "pdf"; title: string; markdown: string; complete: boolean };

const OPEN = /^:::pdf(?:[ \t]+(.*))?$/i;
const CLOSE = /^:::\s*$/;

export function splitPdfSegments(text: string): MessageSegment[] {
  if (!/^:::pdf/im.test(text)) return [{ kind: "text", text }];
  const segments: MessageSegment[] = [];
  let buffer: string[] = [];
  let pdf: { title: string; lines: string[] } | null = null;
  const flushText = () => {
    const joined = buffer.join("\n");
    if (joined.trim()) segments.push({ kind: "text", text: joined });
    buffer = [];
  };
  for (const line of text.split("\n")) {
    if (!pdf) {
      const match = OPEN.exec(line.trim());
      if (match) {
        flushText();
        pdf = { title: (match[1] ?? "").trim() || "Lumin AI document", lines: [] };
      } else {
        buffer.push(line);
      }
    } else if (CLOSE.test(line)) {
      segments.push({
        kind: "pdf",
        title: pdf.title,
        markdown: pdf.lines.join("\n"),
        complete: true,
      });
      pdf = null;
    } else {
      pdf.lines.push(line);
    }
  }
  if (pdf) {
    segments.push({
      kind: "pdf",
      title: pdf.title,
      markdown: pdf.lines.join("\n"),
      complete: false,
    });
  } else {
    flushText();
  }
  return segments;
}

/** The reply with document bodies removed (for read-aloud, copy, etc.). */
export function proseOnly(text: string): string {
  return splitPdfSegments(text)
    .map((seg) => (seg.kind === "text" ? seg.text : ""))
    .join("\n")
    .trim();
}

// ---------------------------------------------------------------------------
// PDF building (jsPDF, loaded on demand so it isn't in the main bundle)
// ---------------------------------------------------------------------------

type Run = { text: string; bold: boolean; code: boolean };
type Rgb = [number, number, number];

function parseInline(raw: string): Run[] {
  const text = raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 ($2)")
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, "$1$2")
    .replace(/(^|\W)_(?!\s)([^_]+?)_(?=\W|$)/g, "$1$2")
    .replace(/<br\s*\/?>/gi, " ");
  const runs: Run[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), bold: false, code: false });
    if (m[1] !== undefined) runs.push({ text: m[1], bold: true, code: false });
    else runs.push({ text: m[2] ?? "", bold: false, code: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false, code: false });
  return runs;
}

function plain(raw: string): string {
  return parseInline(raw)
    .map((r) => r.text)
    .join("");
}

let fontCache: Promise<Record<string, string>> | null = null;

// DejaVu covers math and set symbols (union, intersection, pi, ...) that the
// built-in PDF fonts can't draw. Served from /public/fonts, fetched on demand.
function loadFonts(): Promise<Record<string, string>> {
  fontCache ??= (async () => {
    const files = {
      regular: "/fonts/DejaVuSans.ttf",
      bold: "/fonts/DejaVuSans-Bold.ttf",
      mono: "/fonts/DejaVuSansMono.ttf",
    };
    const out: Record<string, string> = {};
    for (const [key, url] of Object.entries(files)) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`font ${url} failed`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      out[key] = btoa(binary);
    }
    return out;
  })().catch((error) => {
    fontCache = null;
    throw error;
  });
  return fontCache;
}

const BLUE: Rgb = [29, 127, 214];
const INK: Rgb = [26, 26, 26];
const MUTED: Rgb = [110, 110, 110];
const CODE_COLOR: Rgb = [150, 40, 70];

/**
 * Warms the PDF library and fonts so the download is near-instant. iOS only
 * allows the share sheet shortly after a tap, so we can't afford to fetch
 * ~1.8MB of fonts after the student presses Download.
 */
export function preloadPdfAssets(): void {
  void Promise.all([import("jspdf"), import("jspdf-autotable"), loadFonts()]).catch(() => {});
}

export async function downloadPdfDocument(title: string, markdown: string): Promise<void> {
  const [{ jsPDF }, autoTableModule, fonts] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    loadFonts(),
  ]);
  const autoTable = autoTableModule.default ?? autoTableModule.autoTable;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.addFileToVFS("DejaVuSans.ttf", fonts["regular"]!);
  doc.addFileToVFS("DejaVuSans-Bold.ttf", fonts["bold"]!);
  doc.addFileToVFS("DejaVuSansMono.ttf", fonts["mono"]!);
  doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
  doc.addFont("DejaVuSans-Bold.ttf", "DejaVu", "bold");
  doc.addFont("DejaVuSansMono.ttf", "DejaVuMono", "normal");

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;
  const bottom = pageH - 60;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensure = (h: number) => {
    if (y + h > bottom) {
      doc.addPage();
      y = margin;
    }
  };

  // Header
  doc.setFont("DejaVu", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...BLUE);
  for (const line of doc.splitTextToSize(title, contentW) as string[]) {
    y += 22;
    doc.text(line, margin, y);
  }
  doc.setFont("DejaVu", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  y += 16;
  const dateText = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(`Lumin AI by ClearPath  |  ${dateText}`, margin, y);
  y += 10;
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(1.5);
  doc.line(margin, y, pageW - margin, y);
  y += 22;

  // Wraps and draws runs with bold / inline-code support.
  const writeRich = (
    raw: string,
    x: number,
    width: number,
    size: number,
    opts: { bold?: boolean; color?: Rgb } = {},
  ) => {
    const lineH = size * 1.5;
    type Word = { text: string; bold: boolean; code: boolean };
    const words: Word[] = [];
    for (const run of parseInline(raw)) {
      for (const part of run.text.split(/\s+/)) {
        if (part) words.push({ text: part, bold: run.bold || !!opts.bold, code: run.code });
      }
    }
    const setFor = (w: Word) => {
      if (w.code) doc.setFont("DejaVuMono", "normal");
      else doc.setFont("DejaVu", w.bold ? "bold" : "normal");
      doc.setFontSize(w.code ? size - 1 : size);
    };
    const measure = (w: Word) => {
      setFor(w);
      return doc.getTextWidth(w.text);
    };
    doc.setFontSize(size);
    doc.setFont("DejaVu", "normal");
    const space = doc.getTextWidth(" ");

    let line: Word[] = [];
    let lineWidth = 0;
    const flush = () => {
      if (line.length === 0) return;
      ensure(lineH);
      let cx = x;
      for (const w of line) {
        setFor(w);
        doc.setTextColor(...(w.code ? CODE_COLOR : (opts.color ?? INK)));
        doc.text(w.text, cx, y + size);
        cx += doc.getTextWidth(w.text) + space;
      }
      y += lineH;
      line = [];
      lineWidth = 0;
    };
    for (const w of words) {
      const ww = measure(w);
      if (line.length > 0 && lineWidth + space + ww > width) flush();
      lineWidth += (line.length > 0 ? space : 0) + ww;
      line.push(w);
    }
    flush();
  };

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  const flushPara = () => {
    if (para.length === 0) return;
    writeRich(para.join(" "), margin, contentW, 11);
    y += 6;
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushPara();
      const code: string[] = [];
      for (i++; i < lines.length && !(lines[i] ?? "").trim().startsWith("```"); i++) {
        code.push(lines[i] ?? "");
      }
      doc.setFont("DejaVuMono", "normal");
      doc.setFontSize(9.5);
      const wrapped = code.flatMap((c) => doc.splitTextToSize(c || " ", contentW - 16) as string[]);
      const lh = 13;
      let idx = 0;
      while (idx < wrapped.length) {
        const room = Math.max(1, Math.floor((bottom - y - 12) / lh));
        const chunk = wrapped.slice(idx, idx + room);
        ensure(chunk.length * lh + 12);
        doc.setFillColor(241, 243, 245);
        doc.roundedRect(margin, y, contentW, chunk.length * lh + 12, 4, 4, "F");
        doc.setFont("DejaVuMono", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...INK);
        chunk.forEach((c, n) => doc.text(c, margin + 8, y + 6 + (n + 1) * lh - 3));
        y += chunk.length * lh + 18;
        idx += chunk.length;
      }
      continue;
    }

    if (trimmed === "") {
      flushPara();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushPara();
      const level = heading[1]!.length;
      const size = [0, 17, 14, 12.5, 11.5][level]!;
      y += level === 1 ? 8 : 6;
      ensure(size * 2.2);
      writeRich(heading[2]!, margin, contentW, size, {
        bold: true,
        color: level <= 2 ? BLUE : INK,
      });
      y += 2;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushPara();
      ensure(14);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.7);
      doc.line(margin, y + 5, pageW - margin, y + 5);
      y += 14;
      continue;
    }

    if (trimmed.startsWith("|")) {
      flushPara();
      const rows: string[][] = [];
      for (; i < lines.length && (lines[i] ?? "").trim().startsWith("|"); i++) {
        const cells = (lines[i] ?? "")
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => plain(c.trim()));
        if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
        rows.push(cells);
      }
      i--;
      const [head, ...body] = rows;
      if (head) {
        autoTable(doc, {
          startY: y,
          head: [head],
          body,
          margin: { left: margin, right: margin, bottom: 60 },
          styles: { font: "DejaVu", fontSize: 9.5, cellPadding: 5, textColor: INK },
          headStyles: { fillColor: BLUE, textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [244, 248, 252] },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
      }
      continue;
    }

    const bullet = /^(\s*)([-*+•])\s+(.*)$/.exec(line);
    const numbered = /^(\s*)(\d+[.)])\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(trimmed);
    const listMatch = bullet ?? numbered;
    if (listMatch) {
      flushPara();
      const depth = Math.min(3, Math.floor(listMatch[1]!.length / 2));
      const indent = margin + 6 + depth * 18;
      ensure(18);
      doc.setFont("DejaVu", "normal");
      doc.setFontSize(11);
      doc.setTextColor(...INK);
      doc.text(bullet ? "•" : listMatch[2]!, indent, y + 11);
      writeRich(listMatch[3]!, indent + 16, contentW - (indent - margin) - 16, 11);
      y += 2;
      continue;
    }
    if (quote) {
      flushPara();
      const startY = y;
      writeRich(quote[1] ?? "", margin + 14, contentW - 14, 11, { color: [70, 70, 70] });
      doc.setDrawColor(190, 190, 190);
      doc.setLineWidth(2);
      doc.line(margin + 2, startY + 1, margin + 2, y - 4);
      y += 4;
      continue;
    }

    para.push(trimmed);
  }
  flushPara();

  // Footer on every page.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("DejaVu", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.line(margin, pageH - 44, pageW - margin, pageH - 44);
    doc.text(
      "Made by Lumin AI. AI can make mistakes: verify before relying on this.",
      margin,
      pageH - 30,
    );
    doc.text(`Page ${p} of ${pages}`, pageW - margin, pageH - 30, { align: "right" });
  }

  const safe =
    title
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "lumin-document";
  const filename = `${safe}.pdf`;
  const blob = doc.output("blob");

  // Phones (and the iOS app's web view) don't handle a plain file download
  // well, so hand the PDF to the system share sheet ("Save to Files", Print,
  // AirDrop, ...). Desktop browsers just download it.
  const file = new File([blob], filename, { type: "application/pdf" });
  const canShareFile =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });
  const isTouchPhone =
    typeof navigator !== "undefined" &&
    (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  if (canShareFile && isTouchPhone) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (error) {
      // The student closing the share sheet is not an error.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Last resort for browsers that ignore the download attribute (older iOS).
  if (isTouchPhone) window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
