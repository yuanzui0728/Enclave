import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
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
  matcher: ManagedProcessMatcher;
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

interface ManagedProcessMatcher {
  commandHints: string[];
  executableHints: string[];
}

interface WeFlowBootstrapInfo {
  configPath: string;
  config: Record<string, unknown>;
  resolvedDbPath: string | null;
  resolvedWxid: string | null;
  resolvedDecryptKey: string | null;
  missingFields: string[];
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
    const matcher = this.createProcessMatcher(key, spec);
    const current = await this.describeService(key, config);
    if (
      key === "weflow" &&
      current.healthOk &&
      !this.hasWeFlowDesktopWindowOnWindows(spec.cwd, matcher)
    ) {
      this.stopWindowsManagedProcesses(matcher);
      this.processes.delete(key);
    }
    const refreshedCurrent = key === "weflow"
      ? await this.describeService(key, config)
      : current;
    if (key === "weflow" && refreshedCurrent.healthOk) {
      const focused = await this.focusWeFlowWindow(spec.cwd);
      return {
        ok: true,
        message: focused
          ? `${refreshedCurrent.label} 已在运行，并已切到前台。`
          : `${refreshedCurrent.label} 已在运行，但没有成功拉起窗口；你可以再点一次“打开 WeFlow 窗口”。`,
        service: await this.describeService(key, config),
      };
    }
    if (refreshedCurrent.healthOk) {
      return {
        ok: true,
        message: `${refreshedCurrent.label} 已经在运行。`,
        service: refreshedCurrent,
      };
    }

    if (!spec.canStart) {
      throw new Error(
        `${spec.label} 当前无法通过本地连接器启动。${spec.notes[0] ?? ""}`,
      );
    }

    this.ensureLogDir();

    const existing = this.processes.get(key);
    const existingPid = existing
      ? this.resolveManagedProcessPid(existing.pid, existing.matcher)
      : 0;
    if (existing && existingPid && existing.pid !== existingPid) {
      existing.pid = existingPid;
    }
    if (
      key === "weflow" &&
      existing &&
      existingPid
    ) {
      const focused = await this.focusWeFlowWindow(spec.cwd);
      return {
        ok: true,
        message: focused
          ? `${spec.label} 正在启动中，并已尝试把桌面窗口切到前台。`
          : `${spec.label} 启动请求已发出，正在等待本地服务就绪。`,
        service: await this.describeService(key, config),
      };
    }
    if (existing && existingPid) {
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
      matcher,
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
      currentState.pid = 0;
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

    const runningPid = this.resolveManagedProcessPid(state.pid, state.matcher);
    if (!runningPid) {
      throw new Error(
        this.readProcessError(logs.stderr, `${spec.label} 启动失败，请检查日志。`),
      );
    }
    state.pid = runningPid;

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
    const matcher = this.createProcessMatcher(key, spec);

    if (key !== "weflow") {
      throw new Error(
        `${spec.label} 没有桌面窗口可打开，请直接使用它的 HTTP 地址或查看日志。`,
      );
    }

    let startedByOpenAction = false;
    const current = await this.describeService(key, config);
    if (current.healthOk && !this.hasWeFlowDesktopWindowOnWindows(spec.cwd, matcher)) {
      this.stopWindowsManagedProcesses(matcher);
      this.processes.delete(key);
    }
    const refreshedCurrent = await this.describeService(key, config);
    if (!refreshedCurrent.healthOk) {
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
    const resolvedPid = processState
      ? this.resolveManagedProcessPid(processState.pid, processState.matcher)
      : 0;
    if (processState && resolvedPid && processState.pid !== resolvedPid) {
      processState.pid = resolvedPid;
    }
    const pidRunning = Boolean(resolvedPid);
    const status = healthOk
      ? "running"
      : pidRunning
        ? "starting"
        : processState?.lastError
          ? "error"
          : "idle";
    const notes = [...spec.notes];
    if (key === "weflow" && healthOk) {
      const readinessNote = await this.probeWeFlowReadiness(
        spec.baseUrl,
        config.weflowAccessToken ?? DEFAULT_WEFLOW_ACCESS_TOKEN,
      );
      if (readinessNote) {
        notes.push(readinessNote);
      }
    }

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
      notes,
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
    const launchCommand =
      process.platform === "win32"
        ? this.resolveWeFlowWindowsLaunchCommand(cwd)
        : this.resolveNpmCommand("npm run electron:dev");
    const baseUrl = config.weflowBaseUrl ?? "http://127.0.0.1:5031";
    const healthUrl = new URL("/health", withTrailingSlash(baseUrl)).toString();
    const bootstrap = resolveWeFlowBootstrapInfo();
    const notes = [
      process.platform === "win32"
        ? "会直接以 Electron 桌面窗口启动本地 WeFlow，避免把主窗口误带到 5031 的 HTTP API 根地址。"
        : "会在本地 clone 的 WeFlow 目录里执行 npm run electron:dev，拉起桌面应用本体。",
      "启动前会自动写入本机 WeFlow 配置，开启 HTTP API 并同步 Access Token。",
      "首次启动如果检测到依赖未安装，会自动执行 npm install 并使用 Electron 镜像源补齐运行环境。",
    ];
    notes.push(...bootstrap.notes);

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
    const bootstrap = resolveWeFlowBootstrapInfo();
    this.ensureWeFlowConfig(spec.baseUrl, config, logs, bootstrap);
    const env = this.buildProcessEnv("weflow");

    if (this.hasWeFlowRuntime(spec.cwd)) {
      await this.ensureWeFlowBuild(spec.cwd, env, logs);
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
      env,
      logs,
      "WeFlow 依赖安装失败，请检查日志。",
    );
    await this.ensureWeFlowBuild(spec.cwd, env, logs);
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
    bootstrap: WeFlowBootstrapInfo,
  ) {
    const configPath = bootstrap.configPath;
    const configDir = path.dirname(configPath);
    mkdirSync(configDir, { recursive: true });

    const url = new URL(baseUrl);
    const existingConfig = bootstrap.config;
    const currentDbPath = normalizeStringValue(existingConfig.dbPath);
    const currentDbCandidate = resolveWeChatDataCandidate(currentDbPath);
    const currentWxid = normalizeStringValue(existingConfig.myWxid);
    const currentDecryptKey = resolveWeFlowDecryptKey(
      existingConfig,
      currentWxid,
    );
    const nextDbPath =
      currentDbCandidate?.rootPath ?? bootstrap.resolvedDbPath;
    const nextWxid =
      nextDbPath && currentWxid
        ? matchWeChatAccountWxid(nextDbPath, currentWxid) ?? currentWxid
        : bootstrap.resolvedWxid;
    const nextDecryptKey =
      currentDecryptKey ??
      resolveWeFlowDecryptKey(existingConfig, nextWxid) ??
      bootstrap.resolvedDecryptKey;
    const nextConfig = {
      ...existingConfig,
      httpApiEnabled: true,
      httpApiHost: url.hostname,
      httpApiPort: normalizeHttpPort(url),
      httpApiToken: config.weflowAccessToken ?? DEFAULT_WEFLOW_ACCESS_TOKEN,
      dbPath: nextDbPath ?? currentDbPath ?? "",
      myWxid: nextWxid ?? currentWxid ?? "",
      decryptKey: nextDecryptKey ?? "",
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

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "production",
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
    delete env.VITE_DEV_SERVER_URL;
    delete env.ELECTRON_RENDERER_URL;
    delete env.BROWSER;
    return env;
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
    const windowsHide = !(
      process.platform === "win32" &&
      detached &&
      path.basename(command.command).toLowerCase() === "electron.exe"
    );

    try {
      return spawn(command.command, command.args, {
        cwd,
        env,
        detached,
        stdio: ["ignore", stdoutFd, stderrFd],
        windowsHide,
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

  private async probeWeFlowReadiness(baseUrl: string, accessToken: string) {
    try {
      const url = new URL("/api/v1/contacts", withTrailingSlash(baseUrl));
      url.searchParams.set("limit", "1");
      url.searchParams.set("access_token", accessToken);

      const response = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      if (response.ok) {
        return null;
      }

      const body = await response.text();
      if (body.includes("请先在设置页面配置微信ID")) {
        return "WeFlow HTTP 已启动，但还没完成微信账号选择。请在桌面窗口里确认 wxid。";
      }
      if (body.includes("-3999")) {
        return "WeFlow HTTP 已启动，但当前 decryptKey 无法解密数据库（错误码 -3999）。请在 WeFlow 里重新“自动获取密钥”。";
      }
      return `WeFlow 联系人接口当前返回异常：${body || `HTTP ${response.status}`}`;
    } catch {
      return null;
    }
  }

  private hasWeFlowDesktopWindowOnWindows(
    cwd: string,
    matcher: ManagedProcessMatcher,
  ) {
    if (process.platform !== "win32") {
      return true;
    }

    const candidatePids = new Set(
      this.listWindowsCandidateProcesses(matcher).map((candidate) =>
        String(candidate.processId),
      ),
    );
    if (candidatePids.size === 0) {
      return false;
    }

    const windowState = this.readWeFlowWindowStateOnWindows(cwd);
    return windowState.hasWindow && !windowState.showsApiRoot404;
  }

  private stopWindowsManagedProcesses(matcher: ManagedProcessMatcher) {
    if (process.platform !== "win32") {
      return;
    }

    const candidates = this.listWindowsCandidateProcesses(matcher);
    for (const candidate of candidates) {
      spawnSync(
        "taskkill.exe",
        ["/PID", String(candidate.processId), "/T", "/F"],
        {
          encoding: "utf8",
          windowsHide: true,
        },
      );
    }
  }

  private createProcessMatcher(
    key: LocalUpstreamServiceKey,
    spec: UpstreamLaunchSpec,
  ): ManagedProcessMatcher {
    if (key === "weflow") {
      return {
        commandHints: [
          spec.cwd,
          "--no-sandbox",
          "dist-electron\\main.js",
          "dist\\index.html",
          "weflow",
        ],
        executableHints: ["electron.exe", "electron"],
      };
    }

    return {
      commandHints: [spec.cwd, "main.py", "wechat-decrypt"],
      executableHints: ["python.exe", "python3", "python"],
    };
  }

  private isManagedProcessRunning(
    pid: number,
    matcher: ManagedProcessMatcher,
  ) {
    return this.resolveManagedProcessPid(pid, matcher) > 0;
  }

  private resolveManagedProcessPid(
    pid: number,
    matcher: ManagedProcessMatcher,
  ) {
    if (!pid) {
      return process.platform === "win32"
        ? this.findManagedProcessPidOnWindows(matcher)
        : 0;
    }

    if (process.platform === "win32") {
      const identity = this.readWindowsProcessIdentity(pid);
      if (identity) {
        const haystack = [
          identity.name,
          identity.commandLine,
          identity.executablePath,
        ]
          .filter(Boolean)
          .join("\n")
          .toLowerCase();

        const commandMatched =
          matcher.commandHints.length === 0 ||
          matcher.commandHints.some((hint) =>
            haystack.includes(hint.toLowerCase()),
          );
        const executableMatched =
          matcher.executableHints.length === 0 ||
          matcher.executableHints.some((hint) =>
            haystack.includes(hint.toLowerCase()),
          );
        if (commandMatched && executableMatched) {
          return pid;
        }
      }

      return this.findManagedProcessPidOnWindows(matcher);
    }

    try {
      process.kill(pid, 0);
      return pid;
    } catch {
      return 0;
    }
  }

  private findManagedProcessPidOnWindows(matcher: ManagedProcessMatcher) {
    const candidates = this.listWindowsCandidateProcesses(matcher);
    for (const candidate of candidates) {
      const haystack = [
        candidate.name,
        candidate.commandLine,
        candidate.executablePath,
      ]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();

      const commandMatched =
        matcher.commandHints.length === 0 ||
        matcher.commandHints.some((hint) => haystack.includes(hint.toLowerCase()));
      const executableMatched =
        matcher.executableHints.length === 0 ||
        matcher.executableHints.some((hint) =>
          haystack.includes(hint.toLowerCase()),
        );
      if (commandMatched && executableMatched) {
        return candidate.processId;
      }
    }

    return 0;
  }

  private listWindowsCandidateProcesses(matcher: ManagedProcessMatcher) {
    const normalizedExecutableHints = matcher.executableHints
      .map((hint) => path.basename(hint).toLowerCase())
      .filter(Boolean)
      .map((hint) => (hint.endsWith(".exe") ? hint : `${hint}.exe`));
    const processNames = Array.from(
      new Set([
        "cmd.exe",
        "node.exe",
        "electron.exe",
        "python.exe",
        "python3.exe",
        ...normalizedExecutableHints,
      ]),
    );
    const namesLiteral = processNames
      .map((name) => `'${name.replaceAll("'", "''")}'`)
      .join(", ");
    const script = `
$ErrorActionPreference = 'Stop'
$names = @(${namesLiteral})
$processes = Get-CimInstance Win32_Process | Where-Object {
  $names -contains $_.Name.ToLower()
} | Select-Object ProcessId, Name, CommandLine, ExecutablePath
$processes | ConvertTo-Json -Compress
`.trim();

    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );

    if (result.status !== 0 || !result.stdout.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(result.stdout.trim()) as
        | Array<{
            ProcessId?: number;
            Name?: string;
            CommandLine?: string;
            ExecutablePath?: string;
          }>
        | {
            ProcessId?: number;
            Name?: string;
            CommandLine?: string;
            ExecutablePath?: string;
          };
      const items = Array.isArray(parsed) ? parsed : [parsed];
      return items
        .map((item) => ({
          processId: item.ProcessId ?? 0,
          name: item.Name ?? "",
          commandLine: item.CommandLine ?? "",
          executablePath: item.ExecutablePath ?? "",
        }))
        .filter((item) => item.processId > 0)
        .sort((left, right) => right.processId - left.processId);
    } catch {
      return [];
    }
  }

  private readWindowsProcessIdentity(pid: number) {
    const script = `\
$ErrorActionPreference = 'Stop'\
$process = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"\
if (-not $process) { exit 2 }\
[pscustomobject]@{\
  name = $process.Name\
  commandLine = $process.CommandLine\
  executablePath = $process.ExecutablePath\
} | ConvertTo-Json -Compress\
`;

    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );

    if (result.status !== 0 || !result.stdout.trim()) {
      return null;
    }

    try {
      const parsed = JSON.parse(result.stdout.trim()) as {
        name?: string;
        commandLine?: string;
        executablePath?: string;
      };
      return {
        name: parsed.name ?? "",
        commandLine: parsed.commandLine ?? "",
        executablePath: parsed.executablePath ?? "",
      };
    } catch {
      return null;
    }
  }

  private resolveWeFlowWindowsLaunchCommand(cwd: string): ShellCommandSpec {
    return {
      command: path.join(cwd, "node_modules", "electron", "dist", "electron.exe"),
      args: [".", "--no-sandbox"],
      preview:
        ".cache/upstreams/WeFlow/node_modules/electron/dist/electron.exe . --no-sandbox",
    };
  }

  private async ensureWeFlowBuild(
    cwd: string,
    env: NodeJS.ProcessEnv,
    logs: ProcessLogs,
  ) {
    const builtRendererIndex = path.join(cwd, "dist", "index.html");
    const builtElectronMain = path.join(cwd, "dist-electron", "main.js");
    if (existsSync(builtRendererIndex) && existsSync(builtElectronMain)) {
      return;
    }

    const viteBinary = path.join(cwd, "node_modules", "vite", "bin", "vite.js");
    if (!existsSync(viteBinary)) {
      throw new Error("WeFlow 依赖已安装，但缺少 vite 可执行文件。");
    }

    const buildCommand: ShellCommandSpec = {
      command: process.execPath,
      args: [viteBinary, "build"],
      preview: "node node_modules/vite/bin/vite.js build",
    };
    this.appendLog(
      logs.stdout,
      "[yinjie] WeFlow 缺少本地构建产物，开始执行 node node_modules/vite/bin/vite.js build\n",
    );
    await this.runForegroundCommand(
      buildCommand,
      cwd,
      env,
      logs,
      "WeFlow 构建失败，请检查日志。",
    );
  }

  private readWeFlowWindowStateOnWindows(cwd: string) {
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$proc = Get-Process | Where-Object {
  $_.ProcessName -eq 'electron' -and $_.MainWindowHandle -ne 0
} | Sort-Object @{ Expression = { if ($_.MainWindowTitle -match 'weflow') { 0 } else { 1 } } }, @{ Expression = { $_.StartTime }; Descending = $true } | Select-Object -First 1
if (-not $proc) {
  [pscustomobject]@{
    hasWindow = $false
    mainWindowTitle = ''
    observedText = ''
    showsApiRoot404 = $false
  } | ConvertTo-Json -Compress
  exit 0
}
$root = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
$walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
$queue = New-Object System.Collections.Queue
$queue.Enqueue($root)
$names = New-Object System.Collections.Generic.List[string]
while ($queue.Count -gt 0 -and $names.Count -lt 80) {
  $node = $queue.Dequeue()
  try { $name = $node.Current.Name } catch { $name = '' }
  if ($name -and -not [string]::IsNullOrWhiteSpace($name)) {
    $names.Add($name)
  }
  $child = $walker.GetFirstChild($node)
  while ($child -ne $null -and $names.Count -lt 80) {
    $queue.Enqueue($child)
    $child = $walker.GetNextSibling($child)
  }
}
$text = ($names -join "\`n")
[pscustomobject]@{
  hasWindow = $true
  mainWindowTitle = $proc.MainWindowTitle
  observedText = $text
  showsApiRoot404 = (
    $text -match 'Cannot GET /' -or
    (($text -match 'statusCode') -and ($text -match '404')) -or
    $text -match '美观输出'
  )
} | ConvertTo-Json -Compress -Depth 4
`.trim();

    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      {
        cwd,
        encoding: "utf8",
        windowsHide: true,
      },
    );

    if (result.status !== 0 || !result.stdout.trim()) {
      return {
        hasWindow: false,
        mainWindowTitle: "",
        observedText: "",
        showsApiRoot404: false,
      };
    }

    try {
      const parsed = JSON.parse(result.stdout.trim()) as {
        hasWindow?: boolean;
        mainWindowTitle?: string;
        observedText?: string;
        showsApiRoot404?: boolean;
      };
      return {
        hasWindow: parsed.hasWindow === true,
        mainWindowTitle: parsed.mainWindowTitle ?? "",
        observedText: parsed.observedText ?? "",
        showsApiRoot404: parsed.showsApiRoot404 === true,
      };
    } catch {
      return {
        hasWindow: false,
        mainWindowTitle: "",
        observedText: "",
        showsApiRoot404: false,
      };
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

function normalizeStringValue(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeWeChatAccountWxid(value: string | null) {
  const normalized = normalizeStringValue(value);
  if (!normalized) {
    return "";
  }

  const match = normalized.match(/^(wxid_[^_]+)(?:_[a-zA-Z0-9]+)?$/i);
  return match?.[1] ?? normalized;
}

function listWeChatAccountDirectories(rootPath: string) {
  try {
    return readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => /^wxid_/i.test(entry.name))
      .map((entry) => {
        const accountPath = path.join(rootPath, entry.name);
        const modifiedTime = statSync(accountPath).mtimeMs;
        return {
          name: entry.name,
          modifiedTime: Number.isFinite(modifiedTime) ? modifiedTime : 0,
        };
      })
      .sort(
        (left, right) =>
          right.modifiedTime - left.modifiedTime ||
          left.name.localeCompare(right.name),
      );
  } catch {
    return [];
  }
}

function matchWeChatAccountWxid(dbPath: string, preferredWxid: string) {
  const normalizedPreferred = normalizeWeChatAccountWxid(preferredWxid);
  if (!normalizedPreferred) {
    return null;
  }

  const accounts = listWeChatAccountDirectories(dbPath);
  const matchedAccount = accounts.find((account) => {
    const normalizedAccount = normalizeWeChatAccountWxid(account.name);
    return normalizedAccount === normalizedPreferred;
  });

  return matchedAccount?.name ?? null;
}

function pickPreferredWeChatAccountWxid(
  dbPath: string,
  preferredWxids: Array<string | null>,
) {
  for (const preferredWxid of preferredWxids) {
    if (!preferredWxid) {
      continue;
    }

    const matched = matchWeChatAccountWxid(dbPath, preferredWxid);
    if (matched) {
      return matched;
    }
  }

  return listWeChatAccountDirectories(dbPath)[0]?.name ?? null;
}

function resolveWeChatDataCandidate(input: string | null) {
  const normalizedInput = normalizeStringValue(input);
  if (!normalizedInput) {
    return null;
  }

  let absolutePath: string;
  try {
    absolutePath = path.resolve(normalizedInput);
  } catch {
    return null;
  }

  if (!existsSync(absolutePath)) {
    return null;
  }

  try {
    const targetStat = statSync(absolutePath);
    if (!targetStat.isDirectory()) {
      return null;
    }

    const basename = path.basename(absolutePath);
    if (basename === "db_storage") {
      const accountDir = path.dirname(absolutePath);
      const rootDir = path.dirname(accountDir);
      if (listWeChatAccountDirectories(rootDir).length === 0) {
        return null;
      }
      return {
        rootPath: rootDir,
        wxid: path.basename(accountDir),
      };
    }

    if (/^wxid_/i.test(basename)) {
      const rootDir = path.dirname(absolutePath);
      if (listWeChatAccountDirectories(rootDir).length === 0) {
        return null;
      }
      return {
        rootPath: rootDir,
        wxid: basename,
      };
    }

    if (listWeChatAccountDirectories(absolutePath).length === 0) {
      return null;
    }

    return {
      rootPath: absolutePath,
      wxid: null,
    };
  } catch {
    return null;
  }
}

function isUsableWeChatDataPath(input: string | null) {
  return Boolean(resolveWeChatDataCandidate(input));
}

function resolveWeFlowDecryptKey(
  config: Record<string, unknown>,
  wxid: string | null,
) {
  const topLevelKey = normalizeStringValue(config.decryptKey);
  if (topLevelKey) {
    return topLevelKey;
  }

  const rawWxidConfigs = isRecordValue(config.wxidConfigs)
    ? config.wxidConfigs
    : null;
  if (!rawWxidConfigs) {
    return null;
  }

  const normalizedWxid = normalizeWeChatAccountWxid(wxid);
  for (const [candidateWxid, candidateConfig] of Object.entries(rawWxidConfigs)) {
    if (
      normalizedWxid &&
      normalizeWeChatAccountWxid(candidateWxid) !== normalizedWxid
    ) {
      continue;
    }

    if (!isRecordValue(candidateConfig)) {
      continue;
    }

    const candidateKey = normalizeStringValue(candidateConfig.decryptKey);
    if (candidateKey) {
      return candidateKey;
    }
  }

  return null;
}

function resolveWeFlowBootstrapInfo(): WeFlowBootstrapInfo {
  const configPath = resolveWeFlowConfigPath();
  const config = readJsonObject(configPath);
  const notes: string[] = [];
  const missingFields: string[] = [];

  const currentDbPath = normalizeStringValue(config.dbPath);
  const currentWxid = normalizeStringValue(config.myWxid);

  const candidates: Array<{
    rootPath: string;
    wxid: string | null;
    source: string;
  }> = [];
  const seenCandidates = new Set<string>();
  const addCandidate = (input: string | null, source: string) => {
    const candidate = resolveWeChatDataCandidate(input);
    if (!candidate) {
      return;
    }

    const cacheKey = `${candidate.rootPath}::${candidate.wxid ?? ""}`;
    if (seenCandidates.has(cacheKey)) {
      return;
    }

    seenCandidates.add(cacheKey);
    candidates.push({
      ...candidate,
      source,
    });
  };

  addCandidate(currentDbPath, "当前 WeFlow 配置");

  const wechatDecryptConfig = readJsonObject(
    path.join(
      WORKSPACE_ROOT,
      ".cache",
      "upstreams",
      "wechat-decrypt",
      "config.json",
    ),
  );
  addCandidate(
    normalizeStringValue(wechatDecryptConfig.db_dir),
    "wechat-decrypt 本地配置",
  );

  addCandidate(path.join(os.homedir(), "xwechat_files"), "默认用户目录");
  addCandidate(
    path.join(os.homedir(), "Documents", "xwechat_files"),
    "默认文档目录",
  );

  const selectedCandidate = candidates[0] ?? null;
  const resolvedDbPath = selectedCandidate?.rootPath ?? null;
  const resolvedWxid = resolvedDbPath
    ? pickPreferredWeChatAccountWxid(
        resolvedDbPath,
        [currentWxid, ...candidates.map((candidate) => candidate.wxid)],
      )
    : null;
  const resolvedDecryptKey = resolveWeFlowDecryptKey(
    config,
    resolvedWxid ?? currentWxid,
  );

  if (resolvedDbPath) {
    notes.push(`已识别微信数据目录：${resolvedDbPath}`);
    if (selectedCandidate?.source) {
      notes.push(`目录来源：${selectedCandidate.source}。`);
    }
  } else {
    missingFields.push("dbPath");
    notes.push(
      "还没识别到 xwechat_files 根目录。请在 WeFlow 里手动选择微信数据目录。",
    );
  }

  if (resolvedWxid) {
    notes.push(`已识别微信账号目录：${resolvedWxid}`);
  } else {
    missingFields.push("myWxid");
    notes.push(
      "还没识别到微信账号目录（wxid_*）。请在 WeFlow 里选择正确的账号。",
    );
  }

  if (resolvedDecryptKey) {
    notes.push("当前 WeFlow 配置里已经存在 decryptKey。");
  } else {
    missingFields.push("decryptKey");
    notes.push(
      "联系人为空时，通常还差 decryptKey。请在 WeFlow 桌面窗口里点击“自动获取密钥”。",
    );
  }

  return {
    configPath,
    config,
    resolvedDbPath,
    resolvedWxid,
    resolvedDecryptKey,
    missingFields,
    notes,
  };
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
