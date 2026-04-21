import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { startEphemeralCloudApi } from "../../cloud-api/scripts/cloud-api-test-harness.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(testDir, "..");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const PRESERVE_TMP_ENV = "YINJIE_TEST_PRESERVE_TMP";

type RunningProcess = {
  child: ReturnType<typeof spawn>;
  stdout: string[];
  stderr: string[];
};

type ConsoleServerState = {
  baseUrl: string;
  cloudApiBaseUrl: string;
  port: number;
  process: RunningProcess;
};

export async function startBrowserSmokeStack() {
  const cloudApi = await startEphemeralCloudApi({
    tempPrefix: "yinjie-cloud-console-browser-",
    databaseFileName: "cloud-console-browser.sqlite",
    adminSecret: "cloud-console-browser-secret",
    jwtSecret: "cloud-console-browser-jwt",
    authTokenTtl: "1h",
  });

  try {
    const consoleServer = await startCloudConsoleDevServer(
      cloudApi.baseUrl,
      cloudApi.tempDir,
    );
    return {
      cloudApi,
      consoleServer,
      async cleanup() {
        await stopProcess(consoleServer.process);
        if (process.env[PRESERVE_TMP_ENV] === "1") {
          await persistBrowserHarnessArtifacts(cloudApi.tempDir, consoleServer);
        }
        await cloudApi.cleanup();
      },
    };
  } catch (error) {
    await cloudApi.cleanup();
    throw error;
  }
}

async function persistBrowserHarnessArtifacts(
  tempDir: string,
  consoleServer: ConsoleServerState,
) {
  await Promise.all([
    writeFile(
      join(tempDir, "cloud-console.stdout.log"),
      consoleServer.process.stdout.join(""),
      "utf8",
    ),
    writeFile(
      join(tempDir, "cloud-console.stderr.log"),
      consoleServer.process.stderr.join(""),
      "utf8",
    ),
    writeFile(
      join(tempDir, "cloud-console.harness.json"),
      JSON.stringify(
        {
          baseUrl: consoleServer.baseUrl,
          cloudApiBaseUrl: consoleServer.cloudApiBaseUrl,
          port: consoleServer.port,
          pid: consoleServer.process.child.pid ?? null,
        },
        null,
        2,
      ),
      "utf8",
    ),
  ]);
}

async function startCloudConsoleDevServer(
  cloudApiBaseUrl: string,
  tempDir: string,
) {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const child = spawn(
    pnpmCommand,
    ["exec", "vite", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: appDir,
      env: {
        ...process.env,
        VITE_CLOUD_API_BASE: cloudApiBaseUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  child.stdout.on("data", (chunk) => {
    stdout.push(chunk.toString());
  });
  child.stderr.on("data", (chunk) => {
    stderr.push(chunk.toString());
  });

  const serverProcess = {
    child,
    stdout,
    stderr,
  };

  const consoleServer = {
    baseUrl,
    cloudApiBaseUrl,
    port,
    process: serverProcess,
  };

  try {
    await waitForUrlReady(baseUrl, serverProcess);
  } catch (error) {
    if (process.env[PRESERVE_TMP_ENV] === "1") {
      await persistBrowserHarnessArtifacts(tempDir, consoleServer);
    }
    await stopProcess(serverProcess);
    throw error;
  }

  return consoleServer;
}

async function waitForUrlReady(baseUrl: string, process: RunningProcess) {
  const deadline = Date.now() + 20_000;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    if (process.child.exitCode !== null) {
      throw new Error(
        `cloud-console dev server exited early with code ${process.child.exitCode}\nstdout:\n${process.stdout.join("")}\nstderr:\n${process.stderr.join("")}`,
      );
    }

    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
      lastError = new Error(`unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(200);
  }

  throw new Error(
    `cloud-console dev server did not become ready: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }\nstdout:\n${process.stdout.join("")}\nstderr:\n${process.stderr.join("")}`,
  );
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

async function getAvailablePort() {
  return new Promise<number>((resolvePort, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => {
          reject(new Error("failed to resolve an ephemeral port"));
        });
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
