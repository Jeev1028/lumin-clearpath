Lumin UNI auto-check. Report only: it never edits data and uses no secrets.
Fetches each program's source pages (1 request/second per site, 20 s for students.ubc.ca per its robots.txt)
and records whether each stored fact is found, with the sentence it was found in.
NOT FOUND does not mean wrong (JavaScript pages, different wording): a person reads it.
data/programs_template.csv is the 2026-11-26 snapshot of the facts; update it when the database facts change.
Run locally: PYTHONIOENCODING=utf-8 python tools/uni-autofetch/verify/autofetch.py
