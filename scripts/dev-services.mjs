import { spawn, spawnSync } from "node:child_process";
import { openSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const stateDir = path.join(rootDir, "logs", "dev-services");
const nodeBinary = process.execPath;
const pnpmBinary = "pnpm";

const command = process.argv[2] ?? "status";
const target = process.argv[3] ?? "workspace";

const serviceGroups = {
  workspace: ["app", "admin", "cloud-api", "cloud-console"],
  all: ["api", "app", "admin", "cloud-api", "cloud-console", "wechat-connector"],
};

const services = {
  api: {
    cwd: path.join(rootDir, "api"),
    command: nodeBinary,
    args: [path.join(rootDir, "api", "node_modules", "@nestjs", "cli", "bin", "nest.js"), "start", "--watch"],
    port: 3000,
    url: "http://127.0.0.1:3000/",
  },
  app: {
    cwd: path.join(rootDir, "apps", "app"),
    command: nodeBinary,
    args: [path.join(rootDir, "apps", "app", "node_modules", "vite", "bin", "vite.js")],
    port: 5180,
    url: "http://127.0.0.1:5180/",
  },
  admin: {
    cwd: path.join(rootDir, "apps", "admin"),
    command: nodeBinary,
    args: [path.join(rootDir, "apps", "admin", "node_modules", "vite", "bin", "vite.js")],
    port: 5181,
    url: "http://127.0.0.1:5181/",
  },
  "cloud-api": {
    cwd: rootDir,
    command: nodeBinary,
    args: [path.join(rootDir, "apps", "cloud-api", "dist", "apps", "cloud-api", "src", "main.js")],
    port: 3001,
    url: "http://127.0.0.1:3001/",
    prestart() {
      const result = spawnSync(nodeBinary, [path.join(rootDir, "apps", "cloud-api", "node_modules", "@nestjs", "cli", "bin", "nest.js"), "build"], {
        cwd: path.join(rootDir, "apps", "cloud-api"),
        env: process.env,
        shell: false,
        stdio: "inherit",
        windowsHide: true,
      });

      if (result.error) {
        throw result.error;
      }

      if (result.status !== 0) {
        throw new Error(`cloud-api build failed with exit code ${result.status ?? "unknown"}.`);
      }
    },
  },
  "cloud-console": {
    cwd: path.join(rootDir, "apps", "cloud-console"),
    command: nodeBinary,
    args: [path.join(rootDir, "apps", "cloud-console", "node_modules", "vite", "bin", "vite.js")],
    env: {
      VITE_CLOUD_API_BASE: "http://127.0.0.1:3001",
    },
    port: 5182,
    url: "http://127.0.0.1:5182/",
  },
  "wechat-connector": {
    cwd: rootDir,
    command: nodeBinary,
    args: [path.join(rootDir, "apps", "wechat-connector", "dist", "main.js")],
    port: 17364,
    url: "http://127.0.0.1:17364/",
    prestart() {
      const pnpmArgs = ["--filter", "@yinjie/wechat-connector", "build"];
      const result =
        process.platform === "win32"
          ? spawnSync(`${pnpmBinary} ${pnpmArgs.join(" ")}`, {
              cwd: rootDir,
              env: process.env,
              shell: true,
              stdio: "inherit",
              windowsHide: true,
            })
          : spawnSync(pnpmBinary, pnpmArgs, {
              cwd: rootDir,
              env: process.env,
              shell: false,
              stdio: "inherit",
              windowsHide: true,
            });

      if (result.error) {
        throw result.error;
      }

      if (result.status !== 0) {
        throw new Error(`wechat-connector build failed with exit code ${result.status ?? "unknown"}.`);
      }
    },
  },
};

function ensureStateDir() {
  mkdirSync(stateDir, { recursive: true });
}

function resolveServiceNames(name) {
  if (serviceGroups[name]) {
    return serviceGroups[name];
  }

  if (services[name]) {
    return [name];
  }

  throw new Error(`Unknown target: ${name}`);
}

function statePath(name) {
  return path.join(stateDir, `${name}.json`);
}

function logPaths(name) {
  return {
    out: path.join(stateDir, `${name}.out.log`),
    err: path.join(stateDir, `${name}.err.log`),
  };
}

function loadState(name) {
  const file = statePath(name);
  if (!existsSync(file)) {
    return null;
  }

  return JSON.parse(readFileSync(file, "utf8"));
}

function saveState(name, state) {
  writeFileSync(statePath(name), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function clearState(name) {
  const file = statePath(name);
  if (existsSync(file)) {
    unlinkSync(file);
  }
}

function isPidRunning(pid) {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSpawnOptions(serviceName) {
  const service = services[serviceName];
  const logs = logPaths(serviceName);

  rmSync(logs.out, { force: true });
  rmSync(logs.err, { force: true });

  const env = {
    ...process.env,
    ...service.env,
  };

  return {
    cwd: service.cwd,
    env,
    detached: true,
    stdio: ["ignore", openSync(logs.out, "w"), openSync(logs.err, "w")],
    windowsHide: true,
  };
}

async function startService(serviceName) {
  const service = services[serviceName];
  if (!service) {
    throw new Error(`Unknown service: ${serviceName}`);
  }

  const current = loadState(serviceName);
  if (current && isPidRunning(current.pid)) {
    console.log(`[${serviceName}] already running on ${service.url}`);
    return;
  }

  if (current) {
    clearState(serviceName);
  }

  if (service.prestart) {
    console.log(`[${serviceName}] preparing...`);
    service.prestart();
  }

  const child = spawn(service.command, service.args, buildSpawnOptions(serviceName));
  child.unref();

  await sleep(1200);

  if (!isPidRunning(child.pid)) {
    const logs = logPaths(serviceName);
    const errorOutput = existsSync(logs.err) ? readFileSync(logs.err, "utf8").trim() : "";
    throw new Error(`[${serviceName}] exited early.${errorOutput ? `\n${errorOutput}` : ""}`);
  }

  saveState(serviceName, {
    pid: child.pid,
    command: service.command,
    args: service.args,
    cwd: service.cwd,
    port: service.port,
    url: service.url,
    startedAt: new Date().toISOString(),
    logs: logPaths(serviceName),
  });

  console.log(`[${serviceName}] started at ${service.url}`);
}

function stopService(serviceName) {
  const state = loadState(serviceName);
  if (!state) {
    console.log(`[${serviceName}] not running (no state file).`);
    return;
  }

  if (isPidRunning(state.pid)) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(state.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      try {
        process.kill(-state.pid, "SIGTERM");
      } catch {
        process.kill(state.pid, "SIGTERM");
      }
    }
  }

  clearState(serviceName);
  console.log(`[${serviceName}] stopped.`);
}

function statusService(serviceName) {
  const service = services[serviceName];
  const state = loadState(serviceName);
  const running = state ? isPidRunning(state.pid) : false;
  const logs = logPaths(serviceName);
  const status = running ? "running" : state ? "stale" : "stopped";

  console.log(
    [
      `[${serviceName}] ${status}`,
      `url=${service.url}`,
      `pid=${state?.pid ?? "-"}`,
      `out=${path.relative(rootDir, logs.out)}`,
      `err=${path.relative(rootDir, logs.err)}`,
    ].join(" | "),
  );
}

async function run() {
  ensureStateDir();

  const serviceNames = resolveServiceNames(target);

  switch (command) {
    case "start":
      for (const serviceName of serviceNames) {
        await startService(serviceName);
      }
      break;
    case "stop":
      for (const serviceName of [...serviceNames].reverse()) {
        stopService(serviceName);
      }
      break;
    case "restart":
      for (const serviceName of [...serviceNames].reverse()) {
        stopService(serviceName);
      }
      for (const serviceName of serviceNames) {
        await startService(serviceName);
      }
      break;
    case "status":
      for (const serviceName of serviceNames) {
        statusService(serviceName);
      }
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
