import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const rootDir = join(scriptDir, "..");
const desktopDir = join(rootDir, "apps", "desktop");
const tauriConfigPath = join(desktopDir, "src-tauri", "tauri.conf.json");
const tauriConfig = JSON.parse(readText(tauriConfigPath));
const productName = tauriConfig.productName ?? "Yinjie";
const version = tauriConfig.version ?? "0.1.0";
const supportedBundles = new Map([
  [
    "app",
    {
      directory: "macos",
      accepts: (entryPath, stats) => stats.isDirectory() && entryPath.endsWith(".app"),
    },
  ],
  [
    "dmg",
    {
      directory: "dmg",
      accepts: (entryPath, stats) => stats.isFile() && extname(entryPath).toLowerCase() === ".dmg",
    },
  ],
]);

const { archiveByVersion, bundles, target } = parseArgs(process.argv.slice(2));
const targetTriple = target ?? resolveHostTarget();
const bundleFilter = bundles.length > 0 ? bundles : ["app", "dmg"];

ensureMacHost();
logSigningStatus();
runDesktopBuild(targetTriple, bundleFilter);

const bundleRoot = resolveBundleRoot(targetTriple);
const bundleEntries = collectBundleEntries(bundleRoot, bundleFilter);

if (bundleEntries.length === 0) {
  console.error(`No macOS bundles were found under ${bundleRoot}.`);
  process.exit(1);
}

const latestDir = join(rootDir, "dist", "macos-bundle", targetTriple);
copyBundleEntries(bundleEntries, latestDir, true);

if (archiveByVersion) {
  const releaseDir = join(rootDir, "dist", "releases", "macos", `${productName}-${version}`, targetTriple);
  copyBundleEntries(bundleEntries, releaseDir, true);
}

for (const entry of bundleEntries) {
  console.log(`Bundle ready: ${entry}`);
}

function parseArgs(args) {
  let archive = false;
  let bundleArg = null;
  let targetArg = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--archive-by-version") {
      archive = true;
      continue;
    }

    if (arg === "--bundles") {
      bundleArg = args[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--target") {
      targetArg = args[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg.startsWith("--bundles=")) {
      bundleArg = arg.slice("--bundles=".length);
      continue;
    }

    if (arg.startsWith("--target=")) {
      targetArg = arg.slice("--target=".length);
    }
  }

  const bundles = bundleArg
    ? bundleArg.split(",").map((value) => value.trim()).filter(Boolean)
    : [];

  for (const bundle of bundles) {
    if (!supportedBundles.has(bundle)) {
      console.error(
        `Unsupported macOS bundle "${bundle}". Supported values: ${Array.from(supportedBundles.keys()).join(", ")}.`,
      );
      process.exit(1);
    }
  }

  return {
    archiveByVersion: archive,
    bundles,
    target: targetArg,
  };
}

function resolveHostTarget() {
  return process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
}

function ensureMacHost() {
  if (process.platform === "darwin") {
    return;
  }

  console.error("macOS desktop bundles must be built on a Mac host with Xcode Command Line Tools installed.");
  process.exit(1);
}

function logSigningStatus() {
  const signingIdentity = process.env.APPLE_SIGNING_IDENTITY?.trim();
  const adHocSigning = signingIdentity === "-";
  const hasApiNotarization =
    Boolean(process.env.APPLE_API_ISSUER?.trim()) &&
    Boolean(process.env.APPLE_API_KEY?.trim()) &&
    Boolean(process.env.APPLE_API_KEY_PATH?.trim());
  const hasAppleIdNotarization =
    Boolean(process.env.APPLE_ID?.trim()) &&
    Boolean(process.env.APPLE_PASSWORD?.trim()) &&
    Boolean(process.env.APPLE_TEAM_ID?.trim());

  if (adHocSigning) {
    console.warn(
      "Using ad-hoc macOS signing. Apple Silicon devices may still require manual approval in Privacy & Security.",
    );
    return;
  }

  if (!signingIdentity) {
    console.warn(
      "APPLE_SIGNING_IDENTITY is not set. The macOS app can be built for local verification, but distribution builds should configure signing first.",
    );
    return;
  }

  if (hasApiNotarization || hasAppleIdNotarization) {
    console.log(`Using macOS signing identity "${signingIdentity}" with notarization credentials configured.`);
    return;
  }

  console.warn(
    `Using macOS signing identity "${signingIdentity}" without notarization credentials. Direct-download builds may still trigger Gatekeeper warnings.`,
  );
}

function runDesktopBuild(targetTriple, selectedBundles) {
  const runTauriPath = join(desktopDir, "scripts", "run-tauri.mjs");
  const buildArgs = [runTauriPath, "build", "--target", targetTriple];

  if (selectedBundles.length > 0) {
    buildArgs.push("--bundles", selectedBundles.join(","));
  }

  const result = spawnSync(process.execPath, buildArgs, {
    stdio: "inherit",
    cwd: desktopDir,
    env: process.env,
  });

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveBundleRoot(targetTriple) {
  const candidateRoots = [
    join(homedir(), ".cargo-target", "yinjie-desktop", targetTriple, "release", "bundle"),
    join(desktopDir, "src-tauri", "target", targetTriple, "release", "bundle"),
    join(desktopDir, "src-tauri", "target", "release", "bundle"),
  ];

  for (const candidate of candidateRoots) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidateRoots[0];
}

function collectBundleEntries(bundleRoot, selectedBundles) {
  const entries = [];

  for (const bundle of selectedBundles) {
    const bundleConfig = supportedBundles.get(bundle);
    const directory = join(bundleRoot, bundleConfig.directory);

    if (!existsSync(directory)) {
      continue;
    }

    for (const entry of readdirSync(directory)) {
      const entryPath = join(directory, entry);
      const stats = statSync(entryPath);
      if (bundleConfig.accepts(entryPath, stats)) {
        entries.push(entryPath);
      }
    }
  }

  return entries;
}

function copyBundleEntries(entries, destinationDir, cleanDestination) {
  mkdirSync(destinationDir, { recursive: true });

  if (cleanDestination) {
    for (const entry of readdirSync(destinationDir)) {
      rmSync(join(destinationDir, entry), { force: true, recursive: true });
    }
  }

  for (const entry of entries) {
    const stats = statSync(entry);
    cpSync(entry, join(destinationDir, basename(entry)), { recursive: stats.isDirectory() });
  }
}

function readText(path) {
  return readFileSync(path, "utf8");
}
