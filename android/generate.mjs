// One-off script: generates the Android TWA project directly via
// @bubblewrap/core, bypassing the interactive CLI wizard entirely (which
// doesn't work well in a non-TTY/scripted environment). Run once to scaffold
// the project; not needed again unless the project needs to be regenerated
// from scratch.
import { TwaManifest, TwaGenerator } from "@bubblewrap/core";
import path from "node:path";

const MANIFEST_URL = "https://luminclearpath.ca/manifest.webmanifest";
const TARGET_DIR = process.cwd();

const noopPrompt = {
  async printMessage(msg) {
    console.log(msg);
  },
};

async function main() {
  const twaManifest = await TwaManifest.fromWebManifest(MANIFEST_URL);

  // Overrides -- everything else comes from the live web manifest
  // (theme colors, icons, name, etc.) via fromWebManifest above.
  twaManifest.packageId = "ca.luminclearpath.twa";
  twaManifest.launcherName = "ClearPath";
  twaManifest.appVersionCode = 3;
  twaManifest.appVersionName = "1.0.2";
  twaManifest.signingKey.path = path.join(TARGET_DIR, "android.keystore");
  twaManifest.signingKey.alias = "clearpath";
  twaManifest.generatorApp = "bubblewrap-cli";

  await twaManifest.saveToFile(path.join(TARGET_DIR, "twa-manifest.json"));

  const twaGenerator = new TwaGenerator();
  await twaGenerator.createTwaProject(TARGET_DIR, twaManifest);

  console.log("TWA project generated at", TARGET_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
