import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const runtimeDir = path.join(rootDir, "runtime-data", "app-web-nginx");
const confDir = path.join(runtimeDir, "conf");
const logsDir = path.join(runtimeDir, "logs");
const bodyDir = path.join(runtimeDir, "body");
const configPath = path.join(confDir, "nginx.conf");
const pidPath = path.join(runtimeDir, "nginx.pid");
const bootstrapErrorLogPath = path.join(logsDir, "bootstrap-error.log");
const appDistDir = path.join(rootDir, "apps", "app", "dist");
const apiUpstream = "http://127.0.0.1:3000";
const listenAddress = "127.0.0.1:5180";

ensureDir(runtimeDir);
ensureDir(confDir);
ensureDir(logsDir);
ensureDir(bodyDir);

if (!existsSync(appDistDir)) {
  console.error(`[web-nginx] missing app dist: ${appDistDir}`);
  process.exit(1);
}

const nextConfig = buildConfig();
const previousConfig = existsSync(configPath)
  ? readFileSync(configPath, "utf8")
  : null;

if (previousConfig !== nextConfig) {
  writeFileSync(configPath, nextConfig, "utf8");
}

restartNginx();

console.log(`[web-nginx] ready at http://${listenAddress}/`);

function ensureDir(target) {
  mkdirSync(target, { recursive: true });
}

function buildConfig() {
  return `error_log ${path.join(logsDir, "error.log")};
worker_processes 1;
pid ${pidPath};

events {
  worker_connections 1024;
}

http {
  client_max_body_size 32m;
  client_body_temp_path ${bodyDir} 1 2;

  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  sendfile on;

  access_log ${path.join(logsDir, "access.log")};
  error_log ${path.join(logsDir, "error.log")};

  map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
  }

  server {
    listen ${listenAddress};
    server_name _;

    root ${appDistDir};
    index index.html;

    location = /healthz {
      access_log off;
      add_header Content-Type text/plain;
      return 200 "ok\\n";
    }

    location /api/ {
      proxy_pass ${apiUpstream};
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
      proxy_pass ${apiUpstream};
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
      proxy_pass ${apiUpstream};
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_read_timeout 600s;
      proxy_send_timeout 600s;
    }

    location = /runtime-config.json {
      add_header Cache-Control "no-store";
      try_files $uri =404;
    }

    location /assets/ {
      add_header Cache-Control "public, max-age=31536000, immutable";
      try_files $uri =404;
    }

    location / {
      add_header Cache-Control "no-store";
      try_files $uri $uri/ /index.html;
    }
  }
}
`;
}

function runNginx(args) {
  const result = spawnSync(
    "nginx",
    ["-g", `error_log ${bootstrapErrorLogPath};`, ...args],
    {
      cwd: rootDir,
      env: process.env,
      encoding: "utf8",
      shell: false,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  const filteredStderr = filterBenignNginxWarnings(result.stderr ?? "");
  if (filteredStderr) {
    process.stderr.write(filteredStderr);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function restartNginx() {
  if (!existsSync(pidPath)) {
    runNginx(["-p", runtimeDir, "-c", configPath]);
    return;
  }

  const pid = Number.parseInt(readFileSync(pidPath, "utf8").trim(), 10);
  if (Number.isFinite(pid)) {
    try {
      process.kill(pid, "SIGTERM");
      waitForProcessExit(pid, 5_000);
    } catch (error) {
      if (!isMissingProcessError(error)) {
        throw error;
      }
    }
  }

  rmSync(pidPath, { force: true });
  runNginx(["-p", runtimeDir, "-c", configPath]);
}

function waitForProcessExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (isMissingProcessError(error)) {
        return;
      }

      throw error;
    }

    spawnSync("sleep", ["0.05"], {
      cwd: rootDir,
      env: process.env,
      stdio: "ignore",
      shell: false,
    });
  }
}

function isMissingProcessError(error) {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ESRCH"
  );
}

function filterBenignNginxWarnings(stderrText) {
  return stderrText
    .split("\n")
    .filter(
      (line) =>
        !line.includes(
          'could not open error log file: open() "/var/log/nginx/error.log" failed (13: Permission denied)',
        ),
    )
    .join("\n")
    .trim();
}
