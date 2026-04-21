import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const currentDir = dirname(fileURLToPath(import.meta.url));
const shellDir = resolve(currentDir, "..");
const defaultEnvFilePath = resolve(shellDir, "android-release.env.local");

const [command = "doctor", ...restArgs] = process.argv.slice(2);

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function parseEnvValue(value) {
  const trimmedValue = value.trim();
  if (
    (trimmedValue.startsWith("\"") && trimmedValue.endsWith("\"")) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue;
}

function parseEnvFile(filePath) {
  const parsed = {};
  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const normalizedLine = trimmedLine.startsWith("export ")
      ? trimmedLine.slice("export ".length).trim()
      : trimmedLine;
    const separatorIndex = normalizedLine.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    const value = parseEnvValue(normalizedLine.slice(separatorIndex + 1));
    if (!key) {
      continue;
    }

    parsed[key] = value;
  }

  return parsed;
}

const explicitEnvFilePath = normalizeOptionalString(process.env.YINJIE_ANDROID_RELEASE_ENV_FILE);
const resolvedEnvFilePath = explicitEnvFilePath
  ? resolve(process.cwd(), explicitEnvFilePath)
  : defaultEnvFilePath;

if (explicitEnvFilePath && !existsSync(resolvedEnvFilePath)) {
  console.error(`Missing Android release env file: ${resolvedEnvFilePath}`);
  process.exit(1);
}

const envFromFile = existsSync(resolvedEnvFilePath) ? parseEnvFile(resolvedEnvFilePath) : {};
if (existsSync(resolvedEnvFilePath)) {
  console.log(`info  loaded Android release env from ${resolvedEnvFilePath}`);
} else {
  console.log(
    `note  Android release env file not found at ${resolvedEnvFilePath}; using current process env`,
  );
}

const result = spawnSync("node", ["./scripts/run-capacitor.mjs", command, ...restArgs], {
  cwd: shellDir,
  stdio: "inherit",
  env: {
    ...envFromFile,
    ...process.env,
  },
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

throw result.error ?? new Error("Failed to execute Android release command");
