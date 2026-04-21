import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(scriptDir, "..");
const repoRoot = join(desktopDir, "..", "..");
const args = new Set(process.argv.slice(2));
const skipWebAudit = args.has("--skip-web-audit");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

if (!skipWebAudit) {
  runCommand(pnpmCommand, ["--dir", "../app", "audit:desktop-web"], {
    cwd: desktopDir,
    label: "desktop web audit",
  });
}

const standaloneWindowPrefixes = collectStandaloneWindowPrefixes(
  walkFiles(join(repoRoot, "apps", "app", "src")),
);
const capabilityWindows = readCapabilityWindows(
  join(
    desktopDir,
    "src-tauri",
    "capabilities",
    "default.json",
  ),
);

const missingCapabilityWindows = standaloneWindowPrefixes
  .filter((prefix) => {
    const sampleLabel = `${prefix}:sample`;
    return !capabilityWindows.some((pattern) => matchesWindowPattern(pattern, sampleLabel));
  })
  .sort();

const desktopInvokeCommands = collectInvokeCommands([
  ...walkFiles(join(repoRoot, "apps", "app", "src")),
  ...walkFiles(join(repoRoot, "packages", "ui", "src")),
]);
const registeredCommands = readRegisteredCommands(
  join(desktopDir, "src-tauri", "src", "main.rs"),
);

const missingCommands = [...desktopInvokeCommands]
  .filter((command) => !registeredCommands.has(command))
  .sort();

const unusedCommands = [...registeredCommands]
  .filter((command) => !desktopInvokeCommands.has(command))
  .sort();

console.log("Desktop shell sync audit");
console.log(`- Standalone window prefixes: ${standaloneWindowPrefixes.length}`);
console.log(`- Capability window patterns: ${capabilityWindows.length}`);
console.log(`- Desktop invoke commands: ${desktopInvokeCommands.size}`);
console.log(`- Registered Tauri commands: ${registeredCommands.size}`);

if (standaloneWindowPrefixes.length > 0) {
  console.log(
    `- Standalone windows: ${standaloneWindowPrefixes.join(", ")}`,
  );
}

if (unusedCommands.length > 0) {
  console.log(`- Registered but not referenced directly: ${unusedCommands.join(", ")}`);
}

if (missingCapabilityWindows.length > 0) {
  console.error(
    `Missing Tauri capability windows: ${missingCapabilityWindows
      .map((prefix) => `${prefix}:*`)
      .join(", ")}`,
  );
}

if (missingCommands.length > 0) {
  console.error(`Missing registered Tauri commands: ${missingCommands.join(", ")}`);
}

if (missingCapabilityWindows.length > 0 || missingCommands.length > 0) {
  process.exit(1);
}

console.log("Desktop shell sync audit passed.");

function runCommand(command, commandArgs, options) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd,
    stdio: "inherit",
  });

  if ((result.status ?? 1) !== 0) {
    console.error(`Failed during ${options.label}.`);
    process.exit(result.status ?? 1);
  }
}

function walkFiles(rootDir, files = []) {
  for (const entry of readdirSync(rootDir)) {
    const entryPath = join(rootDir, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      walkFiles(entryPath, files);
      continue;
    }

    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(entryPath);
    }
  }

  return files;
}

function collectStandaloneWindowPrefixes(files) {
  const prefixes = new Set();

  for (const filePath of files) {
    const contents = readFileSync(filePath, "utf8");
    for (const match of contents.matchAll(
      /buildDesktopStandaloneWindowLabel\(\s*["'`]([^"'`]+)["'`]/g,
    )) {
      prefixes.add(match[1]);
    }
  }

  return [...prefixes].sort();
}

function readCapabilityWindows(filePath) {
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  return Array.isArray(parsed.windows)
    ? parsed.windows.filter((value) => typeof value === "string")
    : [];
}

function matchesWindowPattern(pattern, label) {
  if (!pattern.includes("*")) {
    return pattern === label;
  }

  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  const regex = new RegExp(`^${escaped.replaceAll("*", ".*")}$`);
  return regex.test(label);
}

function collectInvokeCommands(files) {
  const commands = new Set();

  for (const filePath of files) {
    const contents = readFileSync(filePath, "utf8");
    for (const match of contents.matchAll(
      /\b(?:invoke|invokeDesktop)(?:<[^>]+>)?\(\s*["'`]([^"'`]+)["'`]/g,
    )) {
      commands.add(match[1]);
    }
  }

  return commands;
}

function readRegisteredCommands(filePath) {
  const contents = readFileSync(filePath, "utf8");
  const handlerMatch = contents.match(/generate_handler!\[([\s\S]*?)\]/m);
  const commands = new Set();

  if (!handlerMatch) {
    return commands;
  }

  for (const match of handlerMatch[1].matchAll(/\b([a-z0-9_]+)\b/g)) {
    commands.add(match[1]);
  }

  return commands;
}
