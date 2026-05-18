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

// Note: `api` is intentionally NOT in any group. With per-account isolation
// (CLOUD_LOCAL_PROCESS_PROVIDER=1), main-api children are spawned on demand
// by cloud-api per phone, on dynamic ports (3010+). Starting it here would
// fight cloud-api for port 3000 and break the per-account routing. Use
// `node scripts/dev-services.mjs start api` only for legacy single-tenant debug.
const serviceGroups = {
  workspace: ["app", "admin", "wiki", "cloud-api", "cloud-console"],
  all: ["app", "admin", "wiki", "cloud-api", "cloud-console", "site", "wechat-connector"],
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
    env: {
      VITE_CLOUD_API_BASE_URL: "http://127.0.0.1:3001",
    },
    port: 5180,
    url: "http://127.0.0.1:5180/",
  },
  admin: {
    cwd: path.join(rootDir, "apps", "admin"),
    command: nodeBinary,
    args: [path.join(rootDir, "apps", "admin", "node_modules", "vite", "bin", "vite.js")],
    env: {
      VITE_CLOUD_API_BASE_URL: "http://127.0.0.1:3001",
    },
    port: 5181,
    url: "http://127.0.0.1:5181/",
  },
  wiki: {
    cwd: path.join(rootDir, "apps", "wiki"),
    command: nodeBinary,
    args: [path.join(rootDir, "apps", "wiki", "node_modules", "vite", "bin", "vite.js")],
    port: 5184,
    url: "http://127.0.0.1:5184/",
  },
  // 公网 wiki (yinjieai.top) 走 vite preview (prod build)，避免 vite dev 按需编译首屏
  // 200+ 源模块。启动顺序：vite build → vite preview --port 5184。
  // 与 `wiki` 共用 5184 端口，互斥；切换时先 stop 另一边（参考 site / site-prod 模式）。
  "wiki-prod": {
    cwd: path.join(rootDir, "apps", "wiki"),
    command: nodeBinary,
    args: [
      path.join(rootDir, "apps", "wiki", "node_modules", "vite", "bin", "vite.js"),
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "5184",
      "--strictPort",
    ],
    env: {
      NODE_ENV: "production",
    },
    port: 5184,
    url: "http://127.0.0.1:5184/",
    prestart() {
      const result = spawnSync(
        nodeBinary,
        [path.join(rootDir, "apps", "wiki", "node_modules", "vite", "bin", "vite.js"), "build"],
        {
          cwd: path.join(rootDir, "apps", "wiki"),
          env: { ...process.env, NODE_ENV: "production" },
          shell: false,
          stdio: "inherit",
          windowsHide: true,
        },
      );

      if (result.error) {
        throw result.error;
      }

      if (result.status !== 0) {
        throw new Error(`wiki production build failed with exit code ${result.status ?? "unknown"}.`);
      }
    },
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
  site: {
    cwd: path.join(rootDir, "apps", "site"),
    command: nodeBinary,
    args: [path.join(rootDir, "apps", "site", "node_modules", "next", "dist", "bin", "next"), "dev", "-p", "5185"],
    port: 5185,
    url: "http://127.0.0.1:5185/",
    prestart() {
      const result = spawnSync(nodeBinary, [path.join(rootDir, "apps", "site", "scripts", "sync-assets.mjs")], {
        cwd: path.join(rootDir, "apps", "site"),
        env: process.env,
        shell: false,
        stdio: "inherit",
        windowsHide: true,
      });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        throw new Error(`site asset sync failed with exit code ${result.status ?? "unknown"}.`);
      }
    },
  },
  // 公网官网走的就是 next start (prod build)，避免 next dev 5-10x 性能损失。
  // 启动顺序：sync-assets → next build → next start -p 5185。
  // 与 `site` 共用 5185 端口，互斥；切换时先 stop 另一边。
  "site-prod": {
    cwd: path.join(rootDir, "apps", "site"),
    command: nodeBinary,
    args: [path.join(rootDir, "apps", "site", "node_modules", "next", "dist", "bin", "next"), "start", "-p", "5185"],
    env: {
      NODE_ENV: "production",
    },
    port: 5185,
    url: "http://127.0.0.1:5185/",
    prestart() {
      const syncResult = spawnSync(nodeBinary, [path.join(rootDir, "apps", "site", "scripts", "sync-assets.mjs")], {
        cwd: path.join(rootDir, "apps", "site"),
        env: process.env,
        shell: false,
        stdio: "inherit",
        windowsHide: true,
      });
      if (syncResult.error) throw syncResult.error;
      if (syncResult.status !== 0) {
        throw new Error(`site asset sync failed with exit code ${syncResult.status ?? "unknown"}.`);
      }

      const buildResult = spawnSync(
        nodeBinary,
        [path.join(rootDir, "apps", "site", "node_modules", "next", "dist", "bin", "next"), "build"],
        {
          cwd: path.join(rootDir, "apps", "site"),
          env: { ...process.env, NODE_ENV: "production" },
          shell: false,
          stdio: "inherit",
          windowsHide: true,
        },
      );
      if (buildResult.error) throw buildResult.error;
      if (buildResult.status !== 0) {
        throw new Error(`site production build failed with exit code ${buildResult.status ?? "unknown"}.`);
      }
    },
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
