import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

const testDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(testDir, "..");
const repoRoot = resolve(appDir, "..", "..");
const apiDir = resolve(repoRoot, "api");
const apiEntry = resolve(apiDir, "dist", "main.js");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const PRESERVE_TMP_ENV = "YINJIE_TEST_PRESERVE_TMP";

type RunningProcess = {
  child: ReturnType<typeof spawn>;
  stdout: string[];
  stderr: string[];
};

type CoreApiState = {
  baseUrl: string;
  databasePath: string;
  port: number;
  process: RunningProcess;
};

type AppServerState = {
  baseUrl: string;
  coreApiBaseUrl: string;
  port: number;
  process: RunningProcess;
};

export type DesktopBrowserStack = {
  app: AppServerState;
  coreApi: CoreApiState;
  tempDir: string;
  cleanup(): Promise<void>;
};

export type DesktopSmokeData = {
  owner: {
    id: string;
    username: string;
    onboardingCompleted: boolean;
    avatar?: string;
    signature?: string;
    hasCustomApiKey: boolean;
    customApiBase?: string | null;
    createdAt: string;
  };
  character: {
    id: string;
    name: string;
  };
  conversation: {
    id: string;
  };
};

export async function startDesktopBrowserStack() {
  if (!existsSync(apiEntry)) {
    throw new Error(
      `Missing built Core API entry at ${apiEntry}. Run pnpm --filter api build first.`,
    );
  }

  const tempDir = await mkdtemp(join(tmpdir(), "yinjie-app-desktop-browser-"));
  const coreApi = await startCoreApi(tempDir);

  try {
    const app = await startAppDevServer(coreApi.baseUrl, tempDir);
    return {
      app,
      coreApi,
      tempDir,
      async cleanup() {
        await stopProcess(app.process);
        await stopProcess(coreApi.process);
        if (process.env[PRESERVE_TMP_ENV] === "1") {
          await persistHarnessArtifacts(tempDir, coreApi, app);
          return;
        }
        await rm(tempDir, { recursive: true, force: true });
      },
    } satisfies DesktopBrowserStack;
  } catch (error) {
    await stopProcess(coreApi.process);
    if (process.env[PRESERVE_TMP_ENV] !== "1") {
      await rm(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
}

export async function prepareDesktopSmokeData(coreApiBaseUrl: string) {
  const owner = await apiFetch<DesktopSmokeData["owner"]>(
    coreApiBaseUrl,
    "/api/world/owner",
    {
      method: "PATCH",
      body: {
        username: "桌面测试主人",
        onboardingCompleted: true,
      },
    },
  );
  const characters = await apiFetch<DesktopSmokeData["character"][]>(
    coreApiBaseUrl,
    "/api/characters",
  );
  const character = characters[0];
  if (!character) {
    throw new Error("Core API did not seed any characters for desktop smoke.");
  }

  const conversation = await apiFetch<DesktopSmokeData["conversation"]>(
    coreApiBaseUrl,
    "/api/conversations",
    {
      method: "POST",
      body: {
        characterId: character.id,
      },
    },
  );

  return {
    owner,
    character,
    conversation,
  } satisfies DesktopSmokeData;
}

export async function installDesktopRuntime(
  page: Page,
  params: {
    appName?: string;
    coreApiBaseUrl: string;
    smokeData: DesktopSmokeData;
  },
) {
  await page.addInitScript((input) => {
    const runtimeConfig = {
      apiBaseUrl: input.coreApiBaseUrl,
      socketBaseUrl: input.coreApiBaseUrl,
      environment: "development",
      appPlatform: "web",
      channel: "web",
      bootstrapSource: "window",
      configStatus: "validated",
      publicAppName: input.appName ?? "Yinjie",
      worldAccessMode: "local",
    };

    window.localStorage.setItem(
      "yinjie-app-runtime-config",
      JSON.stringify(runtimeConfig),
    );
    window.localStorage.setItem(
      "yinjie-app-runtime-config-updated-at",
      new Date().toISOString(),
    );
    window.localStorage.setItem(
      "yinjie-app-world-owner",
      JSON.stringify({
        state: {
          id: input.smokeData.owner.id,
          username: input.smokeData.owner.username,
          onboardingCompleted: true,
          avatar: input.smokeData.owner.avatar ?? "",
          signature: input.smokeData.owner.signature ?? "",
          hasCustomApiKey: input.smokeData.owner.hasCustomApiKey,
          customApiBase: input.smokeData.owner.customApiBase ?? null,
          createdAt: input.smokeData.owner.createdAt,
        },
        version: 0,
      }),
    );
    window.__YINJIE_RUNTIME_CONFIG__ = runtimeConfig;
  }, params);
}

async function startCoreApi(tempDir: string) {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const databasePath = join(tempDir, "desktop-browser-core.sqlite");
  const runningProcess = spawnProcess(process.execPath, [apiEntry], {
    cwd: apiDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: databasePath,
      CORS_ALLOWED_ORIGINS: "*",
    },
  });
  const state = {
    baseUrl,
    databasePath,
    port,
    process: runningProcess,
  } satisfies CoreApiState;

  await waitForUrlReady(`${baseUrl}/health`, runningProcess, "Core API");
  await waitForJsonReady(
    `${baseUrl}/api/system/status`,
    runningProcess,
    "Core API status",
  );
  return state;
}

async function startAppDevServer(coreApiBaseUrl: string, tempDir: string) {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const runningProcess = spawnProcess(
    pnpmCommand,
    ["exec", "vite", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: appDir,
      env: {
        ...process.env,
        VITE_CORE_API_BASE_URL: coreApiBaseUrl,
        VITE_SOCKET_BASE_URL: coreApiBaseUrl,
      },
    },
  );
  const state = {
    baseUrl,
    coreApiBaseUrl,
    port,
    process: runningProcess,
  } satisfies AppServerState;

  try {
    await waitForUrlReady(baseUrl, runningProcess, "App Vite server");
  } catch (error) {
    if (process.env[PRESERVE_TMP_ENV] === "1") {
      await persistHarnessArtifacts(tempDir, undefined, state);
    }
    throw error;
  }

  return state;
}

function spawnProcess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
  },
): RunningProcess {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout.on("data", (chunk) => stdout.push(chunk.toString()));
  child.stderr.on("data", (chunk) => stderr.push(chunk.toString()));

  return {
    child,
    stdout,
    stderr,
  };
}

async function waitForUrlReady(
  url: string,
  process: RunningProcess,
  label: string,
) {
  const deadline = Date.now() + 30_000;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    throwIfExited(process, label);

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(200);
  }

  throw new Error(formatProcessFailure(process, label, lastError));
}

async function waitForJsonReady(
  url: string,
  process: RunningProcess,
  label: string,
) {
  const deadline = Date.now() + 30_000;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    throwIfExited(process, label);

    try {
      const response = await fetch(url);
      if (response.ok) {
        await response.json();
        return;
      }
      lastError = new Error(`unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(200);
  }

  throw new Error(formatProcessFailure(process, label, lastError));
}

function throwIfExited(process: RunningProcess, label: string) {
  if (process.child.exitCode === null) {
    return;
  }

  throw new Error(
    `${label} exited early with code ${process.child.exitCode}\nstdout:\n${process.stdout.join("")}\nstderr:\n${process.stderr.join("")}`,
  );
}

function formatProcessFailure(
  process: RunningProcess,
  label: string,
  lastError: unknown,
) {
  return `${label} did not become ready: ${
    lastError instanceof Error ? lastError.message : String(lastError)
  }\nstdout:\n${process.stdout.join("")}\nstderr:\n${process.stderr.join("")}`;
}

async function stopProcess(process: RunningProcess) {
  if (process.child.exitCode !== null) {
    return;
  }

  process.child.kill("SIGTERM");
  const deadline = Date.now() + 5_000;
  while (process.child.exitCode === null && Date.now() < deadline) {
    await sleep(100);
  }

  if (process.child.exitCode === null) {
    process.child.kill("SIGKILL");
  }
}

async function persistHarnessArtifacts(
  tempDir: string,
  coreApi?: CoreApiState,
  app?: AppServerState,
) {
  await mkdir(tempDir, { recursive: true });
  await Promise.all([
    coreApi
      ? writeFile(
          join(tempDir, "core-api.stdout.log"),
          coreApi.process.stdout.join(""),
          "utf8",
        )
      : Promise.resolve(),
    coreApi
      ? writeFile(
          join(tempDir, "core-api.stderr.log"),
          coreApi.process.stderr.join(""),
          "utf8",
        )
      : Promise.resolve(),
    app
      ? writeFile(
          join(tempDir, "app.stdout.log"),
          app.process.stdout.join(""),
          "utf8",
        )
      : Promise.resolve(),
    app
      ? writeFile(
          join(tempDir, "app.stderr.log"),
          app.process.stderr.join(""),
          "utf8",
        )
      : Promise.resolve(),
    writeFile(
      join(tempDir, "desktop-browser-harness.json"),
      JSON.stringify(
        {
          appBaseUrl: app?.baseUrl ?? null,
          coreApiBaseUrl: coreApi?.baseUrl ?? app?.coreApiBaseUrl ?? null,
          databasePath: coreApi?.databasePath ?? null,
        },
        null,
        2,
      ),
      "utf8",
    ),
  ]);
}

async function apiFetch<T>(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const headers = new Headers(options.headers ?? {});
  let body: BodyInit | undefined;

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });
  const rawBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Request ${path} failed with ${response.status}: ${rawBody}`,
    );
  }

  return (rawBody ? JSON.parse(rawBody) : undefined) as T;
}

async function getAvailablePort() {
  return new Promise<number>((resolvePort, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to resolve a free port")));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePort(address.port);
      });
    });
  });
}

declare global {
  interface Window {
    __YINJIE_RUNTIME_CONFIG__?: Record<string, unknown>;
  }
}
