// Copies manifest.json + icons/ into dist/ after the Vite build, since
// Chrome needs manifest.json at the root of the extension folder alongside
// whatever it references (popup.html, icons) -- plain Node fs so this
// works the same on Windows/macOS/Linux without relying on shell cp/xcopy.
import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");

await mkdir(dist, { recursive: true });
await cp(path.join(root, "manifest.json"), path.join(dist, "manifest.json"));
await cp(path.join(root, "icons"), path.join(dist, "icons"), { recursive: true });

console.log("Copied manifest.json and icons/ into dist/");
