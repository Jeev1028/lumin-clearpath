"""Lumin UNI auto-fetch checker.

For every program in data/programs_template.csv: fetch each of its source pages,
turn the HTML into text, and look for each stored fact (tuition, degree length,
admission range, campus). A fact that is FOUND comes with the exact sentence it
was found in, so a human can read the evidence. NOT FOUND does not mean the fact
is wrong: the page may load its content with JavaScript (needs a browser, see
PLAYBOOK.md) or word it differently. It only ever reports, it never edits data.

Usage:  PYTHONIOENCODING=utf-8 python verify/autofetch.py
Output: verify/autofetch_report.md and verify/autofetch_report.json
"""
import csv, gzip, html, json, re, sys, time, urllib.request
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (compatible; LuminUNI-check/1.0; student project, low volume)"
DELAY = {"students.ubc.ca": 20}  # seconds, from that site's robots.txt Crawl-delay
DEFAULT_DELAY = 1.0

# What counts as "the published average" being on the page, per university.
RANGE_PATTERNS = {
    "SFU": [r"high\s*80", r"low\s*90"],
    "UVic": [r"80\s*%|minimum\s*(of\s*)?80|80\s*percent"],
    "Waterloo": [r"low[-\s]*to[-\s]*mid[-\s]*90|mid[-\s]*90"],
    "McMaster": [r"min(imum|\.)?\s*(of\s*)?90|90\s*%"],
    "Toronto": [r"low\s*90"],
}


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "svg"):
            self.skip += 1
        if tag in ("p", "li", "tr", "br", "div", "h1", "h2", "h3", "h4", "td", "th"):
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg") and self.skip:
            self.skip -= 1

    def handle_data(self, d):
        if not self.skip:
            self.out.append(d)


def to_text(raw: str) -> str:
    p = _Text()
    p.feed(raw)
    t = html.unescape("".join(p.out))
    return re.sub(r"[ \t\r\f\v ]+", " ", re.sub(r"\n\s*\n+", "\n", t))


_last = {}


def fetch(url: str):
    host = urlparse(url).hostname
    wait = DELAY.get(host, DEFAULT_DELAY) - (time.time() - _last.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    _last[host] = time.time()
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            body = r.read()
            if r.headers.get("Content-Encoding") == "gzip":
                body = gzip.decompress(body)
            ctype = r.headers.get("Content-Type", "")
            if "pdf" in ctype or url.lower().endswith(".pdf"):
                return None, "PDF (not read by this script)"
            return to_text(body.decode("utf-8", "replace")), None
    except Exception as e:  # report, never crash the whole run
        return None, f"{type(e).__name__}: {str(e)[:80]}"


def snippet(text: str, m: re.Match) -> str:
    a, b = max(0, m.start() - 90), min(len(text), m.end() + 90)
    return " ".join(text[a:b].split())


def find(text: str, pattern: str):
    m = re.search(pattern, text, re.I)
    return snippet(text, m) if m else None


def tuition_patterns(row):
    pats = []
    t = row["tuition_first_year_cad"].strip()
    if t:
        n = float(t)
        whole, cents = f"{n:,.2f}".split(".")
        pats.append(re.escape(whole) + (r"(\.%s)?" % cents if cents != "00" else r"(\.00)?"))
        pats.append(re.escape(whole.replace(",", "")) + (r"\.%s" % cents if cents != "00" else ""))
    for amt in re.findall(r"\$([\d,]+\.\d\d)", row["tuition_basis"]):  # per-credit figure
        pats.append(re.escape(amt))
    return "|".join(f"(?:{p})" for p in pats)


def facts(row):
    f = {"tuition": tuition_patterns(row)}
    yrs = row["degree_length_years"].strip()
    if yrs:
        words = {"4": "four", "5": "five"}.get(yrs, yrs)
        f["degree length"] = rf"\b(?:{yrs}|{words})[-\s]*(?:year|yr)"
    pats = RANGE_PATTERNS.get(row["university"])
    if pats:
        f["admission average"] = pats  # list: all must appear (in any page)
    campus = row["campus"].strip()
    if campus:
        c = re.escape(campus.split("(")[0].strip())
        # must sit next to the word "campus"; a bare city name in a header or footer is not evidence
        f["campus"] = rf"campus[^.\n]{{0,25}}{c}|{c}[^.\n]{{0,12}}campus"
    return f


def main():
    rows = list(csv.DictReader(open(ROOT / "data/programs_template.csv", encoding="utf-8")))
    cache, results = {}, []
    for row in rows:
        urls = []
        for col in ("source_url", "second_source_url"):
            for u in re.findall(r"https?://[^\s;,\"]+", row[col] or ""):
                u = u.rstrip(".,);")
                if u not in urls:
                    urls.append(u)
        pages = {}
        for u in urls:
            if u not in cache:
                print("fetch", u, file=sys.stderr)
                cache[u] = fetch(u)
            pages[u] = cache[u]
        res = {"university": row["university"], "stored": {}, "pages": {}, "facts": {}}
        for u, (t, err) in pages.items():
            res["pages"][u] = {"ok": t is not None, "error": err, "chars": len(t or "")}
        for name, pat in facts(row).items():
            hits = []
            pats = pat if isinstance(pat, list) else [pat]
            # for the average, every phrase must be found (on any single page)
            for u, (t, _) in pages.items():
                if not t:
                    continue
                found = [find(t, p) for p in pats]
                if all(found):
                    hits.append({"url": u, "evidence": found[0] if len(found) == 1 else " | ".join(found)})
            res["facts"][name] = hits
        res["stored"] = {k: row[k] for k in ("tuition_first_year_cad", "degree_length_years", "admission_range_text", "campus")}
        results.append(res)

    (ROOT / "verify").mkdir(exist_ok=True)
    (ROOT / "verify/autofetch_report.json").write_text(json.dumps(results, indent=1, ensure_ascii=False), encoding="utf-8")
    md = [f"# Auto-fetch report, {date.today()}", "",
          "FOUND = the stored value appears on a source page (evidence shown). NOT FOUND = not seen in the page text; "
          "the page may need a browser (JavaScript) or word it differently, so check by hand. Nothing here edits the data.", ""]
    found_n = total = 0
    for r in results:
        md += [f"## {r['university']}", f"Stored: {r['stored']}", ""]
        bad = {u: p["error"] for u, p in r["pages"].items() if not p["ok"]}
        for u, e in bad.items():
            md.append(f"- page not read: {u} ({e})")
        for name, hits in r["facts"].items():
            total += 1
            if hits:
                found_n += 1
                md.append(f"- **{name}: FOUND** on {urlparse(hits[0]['url']).hostname}: \"{hits[0]['evidence']}\"")
            else:
                md.append(f"- **{name}: NOT FOUND** on any fetched page")
        md.append("")
    md.insert(3, f"**{found_n} of {total} facts found with evidence.**\n")
    (ROOT / "verify/autofetch_report.md").write_text("\n".join(md), encoding="utf-8")
    print(f"{found_n}/{total} facts found")


if __name__ == "__main__":
    main()
