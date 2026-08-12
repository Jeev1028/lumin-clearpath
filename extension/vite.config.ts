import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the popup as a plain static site (index.html + hashed JS/CSS
// assets) into dist/ -- manifest.json and icons/ are copied in verbatim by
// scripts/copy-static.mjs (see the build script in package.json), since
// Chrome needs manifest.json to sit at the root of the unpacked/zipped
// extension folder next to whatever it references. base: "./" keeps every
// asset reference relative rather than root-absolute, just to avoid any
// ambiguity about how "/" resolves under the chrome-extension:// scheme.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: "popup.html",
      },
    },
  },
});
