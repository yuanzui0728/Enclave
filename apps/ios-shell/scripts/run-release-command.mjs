import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const currentDir = dirname(fileURLToPath(import.meta.url));
const shellDir = resolve(currentDir, "..");
const defaultEnvFilePath = resolve(shellDir, "ios-release.env.local");

const [command, ...restArgs] = process.argv.slice(2);

if (!command) {
  console.error(
    "usage: node ./scripts/run-release-command.mjs <doctor|ipa|archive|export> [args...]",
  );
  process.exit(1);
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function parseEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvFile(filePath) {
  const parsed = {};
  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const normalized = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    if (!key) {
      continue;
    }

    parsed[key] = parseEnvValue(normalized.slice(separatorIndex + 1));
  }

  return parsed;
}

const explicitEnvFilePath = normalizeOptionalString(
  process.env.YINJIE_IOS_RELEASE_ENV_FILE,
);
const resolvedEnvFilePath = explicitEnvFilePath
  ? resolve(process.cwd(), explicitEnvFilePath)
  : defaultEnvFilePath;

if (explicitEnvFilePath && !existsSync(resolvedEnvFilePath)) {
  console.error(`Missing iOS release env file: ${resolvedEnvFilePath}`);
  process.exit(1);
}

const envFromFile = existsSync(resolvedEnvFilePath)
  ? parseEnvFile(resolvedEnvFilePath)
  : {};

if (existsSync(resolvedEnvFilePath)) {
  console.log(`info  loaded iOS release env from ${resolvedEnvFilePath}`);
} else {
  console.log(
    `note  iOS release env file not found at ${resolvedEnvFilePath}; using current process env`,
  );
}

const scriptMap = {
  doctor: ["scripts/doctor-ios-release.mjs"],
  archive: ["scripts/build-ios-ipa.mjs", "--stop-at=archive"],
  export: ["scripts/build-ios-ipa.mjs", "--stop-at=export"],
  ipa: ["scripts/build-ios-ipa.mjs"],
};

const target = scriptMap[command];
if (!target) {
  console.error(
    `unknown release command "${command}". expected one of: ${Object.keys(scriptMap).join(", ")}`,
  );
  process.exit(1);
}

const result = spawnSync("node", [...target, ...restArgs], {
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

throw result.error ?? new Error("Failed to execute iOS release command");
