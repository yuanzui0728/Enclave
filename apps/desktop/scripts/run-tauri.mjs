import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const mode = process.argv[2] ?? "dev";
const forwardedArgs = process.argv.slice(3);

function bilingual(en, zh) {
  return zh ? `${en}\n${zh}` : en;
}
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

// Tauri 2 hook commands run via `cmd /C` on Windows, where the POSIX
// `KEY=value cmd` inline-env syntax is interpreted as an executable name.
// Inject YINJIE_APP_BUILD_BASE here so `apps/app/vite.config.ts` picks up
// the relative base for desktop bundling on every platform, without
// touching the env when the web build runs `pnpm build` directly.
if (mode === "build") {
  env.YINJIE_APP_BUILD_BASE = process.env.YINJIE_APP_BUILD_BASE ?? "relative";
}
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
      bilingual(
        [
          "Linux desktop build requires pkg-config and GTK/WebKit development libraries.",
          "Install pkg-config plus the Tauri Linux system dependencies, then rerun this command.",
        ].join(" "),
        "Linux 桌面构建需要 pkg-config 与 GTK/WebKit 开发库。请先安装 pkg-config 及 Tauri 的 Linux 系统依赖后再重新运行。",
      ),
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

  const debPackages = [
    "libglib2.0-dev",
    "libgtk-3-dev",
    "libwebkit2gtk-4.1-dev",
    "libsoup-3.0-dev",
    "libgdk-pixbuf-2.0-dev",
    "libpango1.0-dev",
    "libcairo2-dev",
    "libatk1.0-dev",
  ].join(" ");
  console.error(
    bilingual(
      [
        `Missing Linux desktop system packages: ${missingPackages.join(", ")}.`,
        "Install the Tauri Linux dependencies first.",
        "For Debian/Ubuntu this usually includes:",
        debPackages,
      ].join(" "),
      `缺少 Linux 桌面构建所需系统包：${missingPackages.join("、")}。请先安装 Tauri 的 Linux 依赖。Debian/Ubuntu 上通常需要：${debPackages}`,
    ),
  );
  process.exit(1);
}

function ensureMacDesktopAssets() {
  if (process.platform !== "darwin") {
    return;
  }

  // iconutil 是 Xcode CLT 一部分，但不支持 `--version` flag —— `hasCommand`
  // 默认走 `cmd --version` 探测时 iconutil 会 exit 1 被误判为缺失（CI
  // macos-14 runner 实测 dmg 打包炸在这）。改用 POSIX `command -v`
  // shell built-in：exit 0 即 PATH 上能找到，跨 mac/linux/zsh/bash 都
  // 等效；只在 darwin 跑，无 windows 兼容性顾虑。
  const iconUtilCheck = spawnSync("/bin/sh", ["-c", "command -v iconutil"], {
    stdio: "ignore",
    env,
  });
  if (iconUtilCheck.status !== 0) {
    console.error(
      bilingual(
        [
          "macOS desktop build expects Apple's iconutil to be available.",
          "Run this build on a Mac with Xcode Command Line Tools installed.",
        ].join(" "),
        "macOS 桌面构建依赖 Apple 的 iconutil。请在已安装 Xcode Command Line Tools 的 Mac 上运行本命令。",
      ),
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
      bilingual(
        [
          "Missing src-tauri/icons/icon.icns.",
          "Generate the macOS icon asset before running a desktop build.",
        ].join(" "),
        "缺少 src-tauri/icons/icon.icns。请先生成 macOS 图标资源再运行桌面构建。",
      ),
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
      bilingual(
        [
          "Windows desktop build requires MSVC Build Tools.",
          "Install Visual Studio Build Tools with the Desktop development with C++ workload and Windows SDK,",
          "or make sure vcvars64.bat is available so this script can load MSVC automatically.",
        ].join(" "),
        "Windows 桌面构建需要 MSVC Build Tools。请安装 Visual Studio Build Tools，并勾选「使用 C++ 的桌面开发」工作负载和 Windows SDK；或确保 vcvars64.bat 可被本脚本自动加载。",
      ),
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
      bilingual(
        "Failed to inspect installed Rust targets. Ensure rustup is available before building the Windows desktop shell.",
        "无法检查已安装的 Rust target。请先确保 rustup 可用，再构建 Windows 桌面壳。",
      ),
    );
    process.exit(installedTargets.status ?? 1);
  }

  const requiredTarget = explicitTarget ?? "x86_64-pc-windows-msvc";
  if (!installedTargets.stdout.includes(requiredTarget)) {
    console.error(
      bilingual(
        [
          `Missing Rust target ${requiredTarget}.`,
          `Run \`rustup target add ${requiredTarget}\` and rerun this command.`,
        ].join(" "),
        `缺少 Rust target ${requiredTarget}。请运行 \`rustup target add ${requiredTarget}\` 后重新执行本命令。`,
      ),
    );
    process.exit(1);
  }

  // Cargo + MSVC link.exe occasionally fail on Windows when CARGO_TARGET_DIR
  // contains non-ASCII characters (e.g. user names with Chinese characters).
  // Surface a hint up front rather than failing deep inside link.exe.
  const targetDir = env.CARGO_TARGET_DIR ?? "";
  if (/[^\x00-\x7f]/u.test(targetDir)) {
    console.warn(
      bilingual(
        [
          `CARGO_TARGET_DIR contains non-ASCII characters: ${targetDir}.`,
          "Some MSVC link.exe versions fail on such paths.",
          "If the build fails, set CARGO_TARGET_DIR to an ASCII-only path",
          "(e.g. `set CARGO_TARGET_DIR=C:\\yinjie-build`) before rerunning.",
        ].join(" "),
        `CARGO_TARGET_DIR 含有非 ASCII 字符：${targetDir}。部分 MSVC link.exe 版本在此类路径下会构建失败。若构建报错，请把 CARGO_TARGET_DIR 改成纯 ASCII 路径（例如 \`set CARGO_TARGET_DIR=C:\\yinjie-build\`）后重试。`,
      ),
    );
  }
}

if (!hasCommand("rustc") || !hasCommand("cargo")) {
  console.error(
    bilingual(
      [
        "Rust toolchain is required to run the Yinjie desktop shell.",
        "Install rustup, restart the terminal, then rerun this command.",
        "Current JS workspace has already been scaffolded and verified.",
      ].join(" "),
      "运行隐界桌面壳需要 Rust 工具链。请先安装 rustup，重启终端后再次执行本命令。当前 JS 工作区已就绪。",
    ),
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
    bilingual(
      `Detected transient Windows desktop build failure (attempt ${attempt}/${maxAttempts}). Retrying with serialized cargo jobs...`,
      `检测到 Windows 桌面构建偶发失败（第 ${attempt}/${maxAttempts} 次尝试），正在以串行 cargo 任务重试……`,
    ),
  );
  if (attempt >= 3) {
    console.error(
      bilingual(
        [
          "If the build keeps failing with `os error 5` or WiX light/candle errors,",
          "add `%CARGO_TARGET_DIR%` and `apps\\desktop\\src-tauri\\target\\` to Windows Defender exclusions,",
          "and close any IDE/Explorer window indexing those folders.",
        ].join(" "),
        "如果一直报 `os error 5` 或 WiX light/candle 错误，请把 `%CARGO_TARGET_DIR%` 与 `apps\\desktop\\src-tauri\\target\\` 加到 Windows Defender 例外清单，并关闭正在索引这些目录的 IDE / 资源管理器窗口。",
      ),
    );
  }
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
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Preview\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Professional\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Enterprise\\VC\\Auxiliary\\Build\\vcvars64.bat",
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
    console.error(
      bilingual(
        "Failed to load vcvars64.bat for the Windows desktop build.",
        "加载 vcvars64.bat 失败，无法进行 Windows 桌面构建。",
      ),
    );
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
