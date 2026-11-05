// Copies the shared shell code from ../windows so there is one copy to maintain.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "..", "windows");
for (const f of ["preload.js", "memory.js", "home.js"]) {
  fs.copyFileSync(path.join(src, f), path.join(here, f));
}
fs.rmSync(path.join(here, "shell"), { recursive: true, force: true });
fs.cpSync(path.join(src, "shell"), path.join(here, "shell"), { recursive: true });
console.log("shared shell files copied");
