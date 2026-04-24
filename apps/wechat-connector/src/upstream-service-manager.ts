import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ConnectorConfig } from "./config.js";
import type {
  LocalUpstreamServiceInfo,
  LocalUpstreamServiceKey,
  LocalUpstreamServiceStartResponse,
} from "./contracts.js";

interface ManagedUpstreamProcessState {
  child: ChildProcess;
  pid: number;
  startedAt: string;
  lastExitedAt: string | null;
  lastError: string | null;
  logs: {
    stdout: string;
    stderr: string;
  };
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

    if (key === "weflow" && !existsSync(path.join(spec.cwd, "node_modules"))) {
      throw new Error(
        `检测到 WeFlow 仓库还没有安装依赖。先在 ${spec.cwd} 执行 npm install，再回来点击启动。`,
      );
    }

    this.ensureLogDir();

    const existing = this.processes.get(key);
    if (existing && this.isPidRunning(existing.pid)) {
      return {
        ok: true,
        message: `${spec.label} 启动请求已发出，正在等待服务就绪。`,
        service: await this.describeService(key, config),
      };
    }

    const logs = {
      stdout: path.join(LOG_DIR, `${key}.out.log`),
      stderr: path.join(LOG_DIR, `${key}.err.log`),
    };
    rmSync(logs.stdout, { force: true });
    rmSync(logs.stderr, { force: true });

    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: process.env,
      detached: true,
      stdio: ["ignore", openSync(logs.stdout, "w"), openSync(logs.stderr, "w")],
      windowsHide: true,
    });

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
        this.readProcessError(
          logs.stderr,
          `${spec.label} 启动失败，请检查日志。`,
        ),
      );
    }

    return {
      ok: true,
      message: `已发起 ${spec.label} 启动请求，请等待本地服务就绪。`,
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
      logs: processState
        ? processState.logs
        : {
            stdout: path.join(LOG_DIR, `${key}.out.log`),
            stderr: path.join(LOG_DIR, `${key}.err.log`),
          },
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
      const healthUrl = new URL("/api/history?limit=1", withTrailingSlash(baseUrl)).toString();
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
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const args = ["run", "electron:dev"];
    const baseUrl = config.weflowBaseUrl ?? "http://127.0.0.1:5031";
    const healthUrl = new URL("/health", withTrailingSlash(baseUrl)).toString();
    const notes = [
      "会在本地 clone 的 WeFlow 目录里执行 npm run electron:dev，拉起桌面应用本体。",
      "WeFlow 的 HTTP API 是否真正可用，仍取决于应用内是否已开启 API 服务。",
    ];
    if (!existsSync(cwd)) {
      notes.unshift(`未找到本地目录：${cwd}`);
    } else if (!existsSync(path.join(cwd, "node_modules"))) {
      notes.push("检测到 WeFlow 依赖尚未安装，首次使用前需要先在该目录执行 npm install。");
    }

    return {
      key,
      label: "WeFlow",
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

function withTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
