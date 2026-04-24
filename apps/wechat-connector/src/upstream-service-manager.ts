import { spawn, type ChildProcess } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_WEFLOW_ACCESS_TOKEN,
  type ConnectorConfig,
} from "./config.js";
import type {
  LocalUpstreamServiceInfo,
  LocalUpstreamServiceKey,
  LocalUpstreamServiceOpenResponse,
  LocalUpstreamServiceStartResponse,
} from "./contracts.js";

interface ManagedUpstreamProcessState {
  child: ChildProcess;
  pid: number;
  startedAt: string;
  lastExitedAt: string | null;
  lastError: string | null;
  logs: ProcessLogs;
}

interface ProcessLogs {
  stdout: string;
  stderr: string;
}

interface ShellCommandSpec {
  command: string;
  args: string[];
  preview: string;
}

interface UpstreamLaunchSpec {
  key: LocalUpstreamServiceKey;
  label: string;
  baseUrl: string;
  healthUrl: string;
  cwd: string;
  command: string;
  args: string[];
  commandPreview: string;
  canStart: boolean;
  notes: string[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const LOG_DIR = path.join(WORKSPACE_ROOT, "logs", "upstream-services");

const WEFLOW_ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/";
const WEFLOW_ELECTRON_BUILDER_MIRROR =
  "https://npmmirror.com/mirrors/electron-builder-binaries/";

export class LocalUpstreamServiceManager {
  private readonly processes = new Map<
    LocalUpstreamServiceKey,
    ManagedUpstreamProcessState
  >();

  async listServices(
    config: ConnectorConfig,
  ): Promise<LocalUpstreamServiceInfo[]> {
    return Promise.all([
      this.describeService("wechat-decrypt", config),
      this.describeService("weflow", config),
    ]);
  }

  async startService(
    key: LocalUpstreamServiceKey,
    config: ConnectorConfig,
  ): Promise<LocalUpstreamServiceStartResponse> {
    const spec = this.resolveSpec(key, config);
    const current = await this.describeService(key, config);
    if (key === "weflow" && current.healthOk) {
      const focused = await this.focusWeFlowWindow(spec.cwd);
      return {
        ok: true,
        message: focused
          ? `${current.label} 已在运行，并已切到前台。`
          : `${current.label} 已在运行，但没有成功拉起窗口；你可以再点一次“打开 WeFlow 窗口”。`,
        service: await this.describeService(key, config),
      };
    }
    if (current.healthOk) {
      return {
        ok: true,
        message: `${current.label} 已经在运行。`,
        service: current,
      };
    }

    if (!spec.canStart) {
      throw new Error(
        `${spec.label} 当前无法通过本地连接器启动。${spec.notes[0] ?? ""}`,
      );
    }

    this.ensureLogDir();

    const existing = this.processes.get(key);
    if (key === "weflow" && existing && this.isPidRunning(existing.pid)) {
      const focused = await this.focusWeFlowWindow(spec.cwd);
      return {
        ok: true,
        message: focused
          ? `${spec.label} 正在启动中，并已尝试把桌面窗口切到前台。`
          : `${spec.label} 启动请求已发出，正在等待本地服务就绪。`,
        service: await this.describeService(key, config),
      };
    }
    if (existing && this.isPidRunning(existing.pid)) {
      return {
        ok: true,
        message: `${spec.label} 启动请求已发出，正在等待本地服务就绪。`,
        service: await this.describeService(key, config),
      };
    }

    const logs = this.getLogPaths(key);
    rmSync(logs.stdout, { force: true });
    rmSync(logs.stderr, { force: true });

    if (key === "weflow") {
      await this.prepareWeFlow(spec, config, logs);
    }

    const child = this.spawnLoggedProcess(
      {
        command: spec.command,
        args: spec.args,
        preview: spec.commandPreview,
      },
      spec.cwd,
      this.buildProcessEnv(key),
      logs,
      true,
    );

    const startedAt = new Date().toISOString();
    const state: ManagedUpstreamProcessState = {
      child,
      pid: child.pid ?? 0,
      startedAt,
      lastExitedAt: null,
      lastError: null,
      logs,
    };

    child.on("error", (error) => {
      const currentState = this.processes.get(key);
      if (!currentState) {
        return;
      }
      currentState.lastError = error.message;
    });

    child.on("exit", (code, signal) => {
      const currentState = this.processes.get(key);
      if (!currentState) {
        return;
      }

      currentState.lastExitedAt = new Date().toISOString();
      if (code !== 0 || signal) {
        currentState.lastError = this.readProcessError(
          currentState.logs.stderr,
          `${spec.label} 启动后很快退出。`,
        );
      }
    });

    child.unref();
    this.processes.set(key, state);

    await sleep(1200);

    if (!this.isPidRunning(state.pid)) {
      throw new Error(
        this.readProcessError(logs.stderr, `${spec.label} 启动失败，请检查日志。`),
      );
    }

    const healthTimeoutMs = key === "weflow" ? 25_000 : 6_000;
    const healthReady = await this.waitForHealth(spec.healthUrl, healthTimeoutMs);
    if (key === "weflow") {
      const focused = await this.focusWeFlowWindow(spec.cwd);
      return {
        ok: true,
        message: healthReady
          ? focused
            ? `${spec.label} 已成功启动，并已打开桌面窗口。`
            : `${spec.label} 已成功启动，但没有成功拉起桌面窗口；你可以再点一次“打开 WeFlow 窗口”。`
          : focused
            ? `已发起 ${spec.label} 启动请求，并已尝试打开桌面窗口。`
            : `已发起 ${spec.label} 启动请求，请等待本地服务就绪。`,
        service: await this.describeService(key, config),
      };
    }

    return {
      ok: true,
      message: healthReady
        ? `${spec.label} 已成功启动。`
        : `已发起 ${spec.label} 启动请求，请等待本地服务就绪。`,
      service: await this.describeService(key, config),
    };
  }

  async openService(
    key: LocalUpstreamServiceKey,
    config: ConnectorConfig,
  ): Promise<LocalUpstreamServiceOpenResponse> {
    const spec = this.resolveSpec(key, config);

    if (key !== "weflow") {
      throw new Error(
        `${spec.label} 没有桌面窗口可打开，请直接使用它的 HTTP 地址或查看日志。`,
      );
    }

    let startedByOpenAction = false;
    const current = await this.describeService(key, config);
    if (!current.healthOk) {
      await this.startService(key, config);
      startedByOpenAction = true;
    }

    const focused = await this.focusWeFlowWindow(spec.cwd);
    if (!focused) {
      throw new Error(
        "WeFlow 已启动，但当前没有找到可切到前台的主窗口。请检查任务栏、系统托盘，或在 WeFlow 所在虚拟桌面里切换回来。",
      );
    }

    return {
      ok: true,
      message: startedByOpenAction
        ? "已尝试启动 WeFlow，并把桌面窗口切到前台。"
        : "已将 WeFlow 桌面窗口切到前台。",
      service: await this.describeService(key, config),
    };
  }

  private async describeService(
    key: LocalUpstreamServiceKey,
    config: ConnectorConfig,
  ): Promise<LocalUpstreamServiceInfo> {
    const spec = this.resolveSpec(key, config);
    const processState = this.processes.get(key);
    const healthOk = await this.checkHttpHealth(spec.healthUrl);
    const pidRunning = processState ? this.isPidRunning(processState.pid) : false;
    const status = healthOk
      ? "running"
      : pidRunning
        ? "starting"
        : processState?.lastError
          ? "error"
          : "idle";

    return {
      key,
      label: spec.label,
      status,
      baseUrl: spec.baseUrl,
      healthUrl: spec.healthUrl,
      healthOk,
      canStart: spec.canStart,
      commandPreview: spec.commandPreview,
      cwd: spec.cwd,
      lastStartedAt: processState?.startedAt ?? null,
      lastExitedAt: processState?.lastExitedAt ?? null,
      lastError: processState?.lastError ?? null,
      notes: spec.notes,
      logs: processState ? processState.logs : this.getLogPaths(key),
    };
  }

  private resolveSpec(
    key: LocalUpstreamServiceKey,
    config: ConnectorConfig,
  ): UpstreamLaunchSpec {
    if (key === "wechat-decrypt") {
      const cwd = path.join(WORKSPACE_ROOT, ".cache", "upstreams", "wechat-decrypt");
      const windowsVenvPython = path.join(cwd, ".venv", "Scripts", "python.exe");
      const unixVenvPython = path.join(cwd, ".venv", "bin", "python");
      const command = existsSync(windowsVenvPython)
        ? windowsVenvPython
        : existsSync(unixVenvPython)
          ? unixVenvPython
          : process.platform === "win32"
            ? "python"
            : "python3";
      const args = ["main.py"];
      const baseUrl = config.wechatDecryptBaseUrl ?? "http://127.0.0.1:5678";
      const healthUrl = new URL(
        "/api/history?limit=1",
        withTrailingSlash(baseUrl),
      ).toString();
      const notes = [
        "会在本地 clone 的 wechat-decrypt 目录里执行 main.py，并拉起 5678 HTTP 服务。",
      ];

      if (!existsSync(cwd)) {
        notes.unshift(`未找到本地目录：${cwd}`);
      }

      return {
        key,
        label: "wechat-decrypt",
        baseUrl,
        healthUrl,
        cwd,
        command,
        args,
        commandPreview: `${command} ${args.join(" ")}`,
        canStart: existsSync(cwd),
        notes,
      };
    }

    const cwd = path.join(WORKSPACE_ROOT, ".cache", "upstreams", "WeFlow");
    const launchCommand = this.resolveNpmCommand("npm run electron:dev");
    const baseUrl = config.weflowBaseUrl ?? "http://127.0.0.1:5031";
    const healthUrl = new URL("/health", withTrailingSlash(baseUrl)).toString();
    const notes = [
      "会在本地 clone 的 WeFlow 目录里执行 npm run electron:dev，拉起桌面应用本体。",
      "启动前会自动写入本机 WeFlow 配置，开启 HTTP API 并同步 Access Token。",
      "首次启动如果检测到依赖未安装，会自动执行 npm install 并使用 Electron 镜像源补齐运行环境。",
    ];

    if (!existsSync(cwd)) {
      notes.unshift(`未找到本地目录：${cwd}`);
    }

    return {
      key,
      label: "WeFlow",
      baseUrl,
      healthUrl,
      cwd,
      command: launchCommand.command,
      args: launchCommand.args,
      commandPreview: launchCommand.preview,
      canStart: existsSync(cwd),
      notes,
    };
  }

  private async prepareWeFlow(
    spec: UpstreamLaunchSpec,
    config: ConnectorConfig,
    logs: ProcessLogs,
  ) {
    this.ensureWeFlowConfig(spec.baseUrl, config, logs);

    if (this.hasWeFlowRuntime(spec.cwd)) {
      return;
    }

    const installCommand = this.resolveNpmCommand("npm install");
    this.appendLog(
      logs.stdout,
      `[yinjie] WeFlow 依赖缺失，开始执行 ${installCommand.preview}\n`,
    );

    await this.runForegroundCommand(
      installCommand,
      spec.cwd,
      this.buildProcessEnv("weflow"),
      logs,
      "WeFlow 依赖安装失败，请检查日志。",
    );
  }

  private hasWeFlowRuntime(cwd: string) {
    const nodeModulesDir = path.join(cwd, "node_modules");
    if (!existsSync(nodeModulesDir)) {
      return false;
    }

    const electronExecutable =
      process.platform === "win32"
        ? path.join(nodeModulesDir, "electron", "dist", "electron.exe")
        : path.join(nodeModulesDir, "electron", "dist", "electron");
    const viteBinary = path.join(nodeModulesDir, "vite", "bin", "vite.js");
    return existsSync(electronExecutable) && existsSync(viteBinary);
  }

  private ensureWeFlowConfig(
    baseUrl: string,
    config: ConnectorConfig,
    logs: ProcessLogs,
  ) {
    const configPath = resolveWeFlowConfigPath();
    const configDir = path.dirname(configPath);
    mkdirSync(configDir, { recursive: true });

    const url = new URL(baseUrl);
    const existingConfig = readJsonObject(configPath);
    const nextConfig = {
      ...existingConfig,
      httpApiEnabled: true,
      httpApiHost: url.hostname,
      httpApiPort: normalizeHttpPort(url),
      httpApiToken: config.weflowAccessToken ?? DEFAULT_WEFLOW_ACCESS_TOKEN,
    };

    writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
    this.appendLog(
      logs.stdout,
      `[yinjie] 已写入 WeFlow API 配置：${configPath}\n`,
    );
  }

  private resolveNpmCommand(commandLine: string): ShellCommandSpec {
    if (process.platform === "win32") {
      return {
        command: "cmd.exe",
        args: ["/d", "/s", "/c", commandLine],
        preview: commandLine,
      };
    }

    return {
      command: "sh",
      args: ["-lc", commandLine],
      preview: commandLine,
    };
  }

  private buildProcessEnv(key: LocalUpstreamServiceKey) {
    if (key !== "weflow") {
      return process.env;
    }

    return {
      ...process.env,
      ELECTRON_MIRROR:
        process.env.ELECTRON_MIRROR ?? WEFLOW_ELECTRON_MIRROR,
      npm_config_electron_mirror:
        process.env.npm_config_electron_mirror ?? WEFLOW_ELECTRON_MIRROR,
      ELECTRON_BUILDER_BINARIES_MIRROR:
        process.env.ELECTRON_BUILDER_BINARIES_MIRROR ??
        WEFLOW_ELECTRON_BUILDER_MIRROR,
      npm_config_fetch_retries: process.env.npm_config_fetch_retries ?? "5",
      npm_config_fetch_retry_factor:
        process.env.npm_config_fetch_retry_factor ?? "2",
      npm_config_fetch_retry_maxtimeout:
        process.env.npm_config_fetch_retry_maxtimeout ?? "120000",
    };
  }

  private async runForegroundCommand(
    command: ShellCommandSpec,
    cwd: string,
    env: NodeJS.ProcessEnv,
    logs: ProcessLogs,
    failureMessage: string,
  ) {
    const child = this.spawnLoggedProcess(command, cwd, env, logs, false);

    await new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (signal) {
          reject(new Error(`${failureMessage} 进程被信号 ${signal} 中断。`));
          return;
        }
        if (code !== 0) {
          reject(
            new Error(this.readProcessError(logs.stderr, `${failureMessage} 退出码 ${code}.`)),
          );
          return;
        }
        resolve();
      });
    });
  }

  private spawnLoggedProcess(
    command: ShellCommandSpec,
    cwd: string,
    env: NodeJS.ProcessEnv,
    logs: ProcessLogs,
    detached: boolean,
  ) {
    const stdoutFd = openSync(logs.stdout, "a");
    const stderrFd = openSync(logs.stderr, "a");

    try {
      return spawn(command.command, command.args, {
        cwd,
        env,
        detached,
        stdio: ["ignore", stdoutFd, stderrFd],
        windowsHide: true,
      });
    } finally {
      closeSync(stdoutFd);
      closeSync(stderrFd);
    }
  }

  private async waitForHealth(url: string, timeoutMs: number) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (await this.checkHttpHealth(url)) {
        return true;
      }
      await sleep(1000);
    }
    return false;
  }

  private async checkHttpHealth(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private ensureLogDir() {
    mkdirSync(LOG_DIR, { recursive: true });
  }

  private getLogPaths(key: LocalUpstreamServiceKey): ProcessLogs {
    return {
      stdout: path.join(LOG_DIR, `${key}.out.log`),
      stderr: path.join(LOG_DIR, `${key}.err.log`),
    };
  }

  private appendLog(logPath: string, content: string) {
    writeFileSync(logPath, content, {
      encoding: "utf8",
      flag: "a",
    });
  }

  private async focusWeFlowWindow(cwd: string) {
    if (process.platform === "win32") {
      return this.focusWeFlowWindowOnWindows(cwd);
    }

    return false;
  }

  private async focusWeFlowWindowOnWindows(cwd: string) {
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$proc = Get-Process | Where-Object {
  $_.ProcessName -eq 'electron' -and $_.MainWindowHandle -ne 0
} | Sort-Object @{ Expression = { if ($_.MainWindowTitle -match 'weflow') { 0 } else { 1 } } }, @{ Expression = { $_.StartTime }; Descending = $true } | Select-Object -First 1
if (-not $proc) {
  exit 2
}
$handle = [System.IntPtr] $proc.MainWindowHandle
[void][Win32]::ShowWindowAsync($handle, 9)
Start-Sleep -Milliseconds 200
$wshell = New-Object -ComObject WScript.Shell
[void]$wshell.AppActivate($proc.Id)
Start-Sleep -Milliseconds 150
[void][Win32]::SetForegroundWindow($handle)
Write-Output 'focused'
`.trim();

    const result = await this.runCapturedCommand(
      {
        command: "powershell.exe",
        args: [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          script,
        ],
        preview:
          "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command <focus-weflow-window>",
      },
      cwd,
      process.env,
    );

    return result.code === 0 && result.stdout.includes("focused");
  }

  private async runCapturedCommand(
    command: ShellCommandSpec,
    cwd: string,
    env: NodeJS.ProcessEnv,
  ) {
    const child = spawn(command.command, command.args, {
      cwd,
      env,
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr?.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    return new Promise<{
      code: number;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (signal) {
          reject(new Error(`${command.preview} was interrupted by signal ${signal}.`));
          return;
        }

        resolve({
          code: code ?? 0,
          stdout: Buffer.concat(stdoutChunks).toString("utf8").trim(),
          stderr: Buffer.concat(stderrChunks).toString("utf8").trim(),
        });
      });
    });
  }

  private isPidRunning(pid: number) {
    if (!pid) {
      return false;
    }

    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private readProcessError(logPath: string, fallbackMessage: string) {
    try {
      const content = readFileSync(logPath, "utf8").trim();
      return content ? `${fallbackMessage}\n${content}` : fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  }
}

function resolveWeFlowConfigPath() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? os.homedir(), "WeFlow", "WeFlow-config.json");
  }

  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "WeFlow",
      "WeFlow-config.json",
    );
  }

  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
    "WeFlow",
    "WeFlow-config.json",
  );
}

function readJsonObject(filePath: string) {
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const content = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
    return content ? (JSON.parse(content) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function normalizeHttpPort(url: URL) {
  if (url.port) {
    const parsed = Number(url.port);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }

  return url.protocol === "https:" ? 443 : 80;
}

function withTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
