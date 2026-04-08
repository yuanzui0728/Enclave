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

const { archiveByVersion, bundles } = parseArgs(process.argv.slice(2));
const bundleFilter = bundles.length > 0 ? bundles : ["nsis", "msi"];

runDesktopBuild(bundleFilter);

const bundleRoot = resolveBundleRoot();
const installerFiles = collectInstallerFiles(bundleRoot, bundleFilter);

if (installerFiles.length === 0) {
  console.error(`No Windows installers were found under ${bundleRoot}.`);
  process.exit(1);
}

const latestDir = join(rootDir, "dist", "windows-installer");
copyInstallers(installerFiles, latestDir, true);

if (archiveByVersion) {
  const releaseDir = join(rootDir, "dist", "releases", "windows", `${productName}-${version}`);
  copyInstallers(installerFiles, releaseDir, true);
}

for (const file of installerFiles) {
  console.log(`Installer ready: ${file}`);
}

function parseArgs(args) {
  let archive = false;
  let bundleArg = null;

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

    if (arg.startsWith("--bundles=")) {
      bundleArg = arg.slice("--bundles=".length);
    }
  }

  return {
    archiveByVersion: archive,
    bundles: bundleArg
      ? bundleArg.split(",").map((value) => value.trim()).filter(Boolean)
      : [],
  };
}

function runDesktopBuild(selectedBundles) {
  const runTauriPath = join(desktopDir, "scripts", "run-tauri.mjs");
  const buildArgs = [runTauriPath, "build", "--target", "x86_64-pc-windows-msvc"];

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

function resolveBundleRoot() {
  const candidateRoots = [
    join(homedir(), ".cargo-target", "yinjie-desktop", "x86_64-pc-windows-msvc", "release", "bundle"),
    join(desktopDir, "src-tauri", "target", "x86_64-pc-windows-msvc", "release", "bundle"),
    join(desktopDir, "src-tauri", "target", "release", "bundle"),
  ];

  for (const candidate of candidateRoots) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidateRoots[0];
}

function collectInstallerFiles(bundleRoot, selectedBundles) {
  const files = [];

  for (const bundle of selectedBundles) {
    const directory = join(bundleRoot, bundle);
    if (!existsSync(directory)) {
      continue;
    }

    for (const entry of walkFiles(directory)) {
      const extension = extname(entry).toLowerCase();
      if (bundle === "nsis" && extension === ".exe") {
        files.push(entry);
      }
      if (bundle === "msi" && extension === ".msi") {
        files.push(entry);
      }
    }
  }

  return files;
}

function copyInstallers(files, destinationDir, cleanDestination) {
  mkdirSync(destinationDir, { recursive: true });

  if (cleanDestination) {
    for (const entry of readdirSync(destinationDir)) {
      const entryPath = join(destinationDir, entry);
      if (statSync(entryPath).isFile()) {
        rmSync(entryPath, { force: true });
      }
    }
  }

  for (const file of files) {
    cpSync(file, join(destinationDir, basename(file)));
  }
}

function* walkFiles(directory) {
  for (const entry of readdirSync(directory)) {
    const entryPath = join(directory, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) {
      yield* walkFiles(entryPath);
      continue;
    }

    if (stats.isFile()) {
      yield entryPath;
    }
  }
}

function readText(path) {
  return readFileSync(path, "utf8");
}
