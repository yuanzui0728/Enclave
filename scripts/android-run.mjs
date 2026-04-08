import { chmodSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const currentDir = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(currentDir, "android-run.sh");

if (existsSync(scriptPath)) {
  chmodSync(scriptPath, 0o755);
}

const result = spawnSync("bash", [scriptPath, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

throw result.error ?? new Error("Failed to execute android-run.sh");
