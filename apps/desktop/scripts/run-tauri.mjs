import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const mode = process.argv[2] ?? "dev";
const forwardedArgs = process.argv.slice(3);
const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const desktopDir = join(scriptDir, "..");
const cargoBin = join(homedir(), ".cargo", "bin");
const cargoTargetDir = join(homedir(), ".cargo-target", "yinjie-desktop");
const env = {
  ...process.env,
  PATH: `${cargoBin}${delimiter}${process.env.PATH ?? ""}`,
  CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? cargoTargetDir,
  CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? "1",
};
const hostTargetTriple = resolveHostTargetTriple();

const explicitTarget = readTargetArg(forwardedArgs);
const effectiveTarget = normalizeRequestedTarget(explicitTarget, hostTargetTriple);
const tauriArgs = replaceTargetArg(forwardedArgs, effectiveTarget);
const needsWindowsVcVars = process.platform === "win32" && !hasCommand("cl", ["/?"]);
const windowsVcVarsPath = needsWindowsVcVars ? resolveWindowsVcVarsPath() : null;

if (explicitTarget) {
  env.CARGO_BUILD_TARGET = explicitTarget;
  env.YINJIE_DESKTOP_TARGET_TRIPLE = explicitTarget;
}

if (windowsVcVarsPath) {
  Object.assign(env, loadWindowsVcVarsEnv(windowsVcVarsPath));
}

mkdirSync(env.CARGO_TARGET_DIR, { recursive: true });

function hasCommand(command, args = ["--version"]) {
  const result = spawnSync(command, args, {
    stdio: "ignore",
    shell: true,
    env,
  });

  return result.status === 0;
}

function hasPkgConfigPackage(pkg) {
  const result = spawnSync("pkg-config", ["--exists", pkg], {
    stdio: "ignore",
    shell: true,
    env,
  });

  return result.status === 0;
}

function ensureLinuxDesktopDependencies() {
  if (process.platform !== "linux") {
    return;
  }

  if (!hasCommand("pkg-config")) {
    console.error(
      [
        "Linux desktop build requires pkg-config and GTK/WebKit development libraries.",
        "Install pkg-config plus the Tauri Linux system dependencies, then rerun this command.",
      ].join(" "),
    );
    process.exit(1);
  }

  const requiredPackages = [
    "glib-2.0",
    "gobject-2.0",
    "gio-2.0",
    "gtk+-3.0",
    "gdk-3.0",
    "gdk-pixbuf-2.0",
    "pango",
    "cairo",
    "atk",
    "webkit2gtk-4.1",
    "javascriptcoregtk-4.1",
    "libsoup-3.0",
  ];
  const missingPackages = requiredPackages.filter((pkg) => !hasPkgConfigPackage(pkg));

  if (missingPackages.length === 0) {
    return;
  }

  console.error(
    [
      `Missing Linux desktop system packages: ${missingPackages.join(", ")}.`,
      "Install the Tauri Linux dependencies first.",
      "For Debian/Ubuntu this usually includes:",
      [
        "libglib2.0-dev",
        "libgtk-3-dev",
        "libwebkit2gtk-4.1-dev",
        "libsoup-3.0-dev",
        "libgdk-pixbuf-2.0-dev",
        "libpango1.0-dev",
        "libcairo2-dev",
        "libatk1.0-dev",
      ].join(" "),
    ].join(" "),
  );
  process.exit(1);
}

function ensureMacDesktopAssets() {
  if (process.platform !== "darwin") {
    return;
  }

  if (!hasCommand("iconutil")) {
    console.error(
      [
        "macOS desktop build expects Apple's iconutil to be available.",
        "Run this build on a Mac with Xcode Command Line Tools installed.",
      ].join(" "),
    );
    process.exit(1);
  }

  const iconResult = spawnSync("test", ["-f", "src-tauri/icons/icon.icns"], {
    stdio: "ignore",
    shell: true,
    env,
    cwd: desktopDir,
  });

  if (iconResult.status !== 0) {
    console.error(
      [
        "Missing src-tauri/icons/icon.icns.",
        "Generate the macOS icon asset before running a desktop build.",
      ].join(" "),
    );
    process.exit(1);
  }
}

function ensureWindowsDesktopDependencies() {
  if (process.platform !== "win32") {
    return;
  }

  if (!hasCommand("cl", ["/?"]) && !windowsVcVarsPath) {
    console.error(
      [
        "Windows desktop build requires MSVC Build Tools.",
        "Install Visual Studio Build Tools with the Desktop development with C++ workload and Windows SDK,",
        "or make sure vcvars64.bat is available so this script can load MSVC automatically.",
      ].join(" "),
    );
    process.exit(1);
  }

  const installedTargets = spawnSync("rustup", ["target", "list", "--installed"], {
    stdio: "pipe",
    shell: true,
    env,
    encoding: "utf8",
  });

  if ((installedTargets.status ?? 1) !== 0) {
    console.error(
      "Failed to inspect installed Rust targets. Ensure rustup is available before building the Windows desktop shell.",
    );
    process.exit(installedTargets.status ?? 1);
  }

  const requiredTarget = explicitTarget ?? "x86_64-pc-windows-msvc";
  if (!installedTargets.stdout.includes(requiredTarget)) {
    console.error(
      [
        `Missing Rust target ${requiredTarget}.`,
        `Run \`rustup target add ${requiredTarget}\` and rerun this command.`,
      ].join(" "),
    );
    process.exit(1);
  }
}

if (!hasCommand("rustc") || !hasCommand("cargo")) {
  console.error(
    [
      "Rust toolchain is required to run the Yinjie desktop shell.",
      "Install rustup, restart the terminal, then rerun this command.",
      "Current JS workspace has already been scaffolded and verified.",
    ].join(" "),
  );
  process.exit(1);
}

ensureLinuxDesktopDependencies();
ensureMacDesktopAssets();
ensureWindowsDesktopDependencies();

const maxAttempts = mode === "build" ? 6 : 1;

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const result = spawnTauriCommand();

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if ((result.status ?? 1) === 0) {
    process.exit(0);
  }

  const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const isRetryableBuildScriptError =
    mode === "build" &&
    attempt < maxAttempts &&
    /build-script-build/i.test(combinedOutput) &&
    /os error 5/i.test(combinedOutput);
  const isRetryableWixToolError =
    mode === "build" &&
    attempt < maxAttempts &&
    /failed to run .*?(light|candle)\.exe/i.test(combinedOutput);

  if (!isRetryableBuildScriptError && !isRetryableWixToolError) {
    process.exit(result.status ?? 1);
  }

  console.error(
    `Detected transient Windows desktop build failure (attempt ${attempt}/${maxAttempts}). Retrying with serialized cargo jobs...`,
  );
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
}

process.exit(1);

function spawnTauriCommand() {
  return spawnSync("pnpm", ["exec", "tauri", mode, ...tauriArgs], {
    stdio: "pipe",
    shell: true,
    env,
    encoding: "utf8",
    cwd: desktopDir,
  });
}

function readTargetArg(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--target") {
      return args[index + 1] ?? null;
    }
    if (arg.startsWith("--target=")) {
      return arg.slice("--target=".length);
    }
  }

  return null;
}

function replaceTargetArg(args, target) {
  const nextArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--target") {
      index += 1;
      if (target) {
        nextArgs.push("--target", target);
      }
      continue;
    }

    if (arg.startsWith("--target=")) {
      if (target) {
        nextArgs.push(`--target=${target}`);
      }
      continue;
    }

    nextArgs.push(arg);
  }

  return nextArgs;
}

function normalizeRequestedTarget(target, hostTarget) {
  if (!target) {
    return null;
  }

  return target;
}

function resolveWindowsVcVarsPath() {
  const vswherePath = join(
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );

  if (existsSync(vswherePath)) {
    const result = spawnSync(
      vswherePath,
      [
        "-latest",
        "-products",
        "*",
        "-requires",
        "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
        "-find",
        "VC\\Auxiliary\\Build\\vcvars64.bat",
      ],
      {
        stdio: "pipe",
        shell: false,
        env,
        encoding: "utf8",
      },
    );

    const resolved = result.stdout?.split(/\r?\n/u).find((line) => line.trim());
    if (resolved) {
      return resolved.trim();
    }
  }

  const fallbacks = [
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat",
  ];

  return fallbacks.find((candidate) => existsSync(candidate)) ?? null;
}

function loadWindowsVcVarsEnv(vcvarsPath) {
  const scriptPath = join(tmpdir(), `yinjie-vcvars-${process.pid}.cmd`);
  writeFileSync(scriptPath, `@echo off\r\ncall "${vcvarsPath}" >nul\r\nset\r\n`, "utf8");

  const result = spawnSync("cmd.exe", ["/d", "/c", scriptPath], {
    stdio: "pipe",
    shell: false,
    env,
    encoding: "utf8",
  });

  try {
    unlinkSync(scriptPath);
  } catch {
  }

  if ((result.status ?? 1) !== 0) {
    console.error("Failed to load vcvars64.bat for the Windows desktop build.");
    process.exit(result.status ?? 1);
  }

  const nextEnv = {};
  for (const line of result.stdout.split(/\r?\n/u)) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }

    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    nextEnv[key] = value;
  }

  return nextEnv;
}

function resolveHostTargetTriple() {
  const rustcVersion = spawnSync("rustc", ["-vV"], {
    stdio: "pipe",
    shell: true,
    env,
    encoding: "utf8",
  });

  if ((rustcVersion.status ?? 1) !== 0) {
    return null;
  }

  const hostLine = rustcVersion.stdout
    .split(/\r?\n/u)
    .find((line) => line.startsWith("host:"));
  return hostLine?.split(":")[1]?.trim() ?? null;
}
