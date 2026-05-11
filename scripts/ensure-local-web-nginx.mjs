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
const cloudUpstream = "http://127.0.0.1:3001";
const siteUpstream = "http://127.0.0.1:5185";
// 公网 HTTPS 隧道 https://1gw06751dd053.vicp.fun （Host 不带端口） 实际打到
// nginx 5180 而不是直连 5185；HTTP 隧道 :29490 也打 5180。需要在 nginx 这一
// 层把两个 Host 区分开走 site 还是 app。这个 hostname 与 :29490 端口的隧道
// 控制台配置一致；如果改隧道域名，这里也要同步。
const siteHostExact = "1gw06751dd053.vicp.fun";
// 花生壳两条隧道分别独立映射：
//   HTTPS https://1gw06751dd053.vicp.fun → 127.0.0.1:5185 (site, Next.js 直连)
//   HTTP  http://1gw06751dd053.vicp.fun:29490 → 127.0.0.1:5180 (nginx → app dist)
// nginx 5180 只服务 app；不再尝试按 Host 反代到 site。原先在 location / 中
// 的 if-Host=vicp.fun → proxy_pass 5185 写法既不可靠（"if is evil"），又因为
// nginx 在 server_name 匹配时忽略 Host 端口，会把 :29490 隧道的请求也吃进去
// 反代到 5185，导致用户 :29490 看到的是 site 而不是 app。
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
  tcp_nopush on;
  tcp_nodelay on;
  keepalive_timeout 65s;

  # 公网隧道带宽受限，所有可压缩文本类资源都走 gzip。
  # vite 构建时由 vite-plugin-compression 生成 *.gz 同名兄弟文件，
  # gzip_static on 让 nginx 直接吐预压缩文件，不再现压。
  gzip on;
  gzip_static on;
  gzip_vary on;
  gzip_proxied any;
  gzip_min_length 1024;
  gzip_comp_level 6;
  gzip_types
    text/plain
    text/css
    text/javascript
    application/javascript
    application/json
    application/manifest+json
    application/xml
    application/xhtml+xml
    application/rss+xml
    application/atom+xml
    application/wasm
    text/xml
    image/svg+xml
    font/woff2
    font/ttf
    font/otf;

  access_log ${path.join(logsDir, "access.log")};
  error_log ${path.join(logsDir, "error.log")};

  map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
  }

  # 花生壳两条隧道实际都进 nginx 5180（公网响应 Server: nginx 已确认）：
  #   HTTPS https://${siteHostExact}            (Host=${siteHostExact},        无端口) → site (5185)
  #   HTTP  http://${siteHostExact}:29490       (Host=${siteHostExact}:29490)         → app dist
  # nginx server_name 匹配会忽略 Host 端口，无法区分；改用 $http_host 精确匹配
  # 出 $route_to_site，命中时通过 error_page → named location 内部跳转做反代
  # （避开 "if + proxy_pass is evil"）。
  map $http_host $route_to_site {
    default 0;
    "${siteHostExact}" 1;
  }

  # 公网 Host（vicp.fun 隧道 / 公网域名）下禁止 /api/ + /socket.io/ 直通本机 3000。
  # 这两条路径上的 api 是单租户、无鉴权、共享 owner db 的本机开发实例；公网放开
  # 等于把本地数据公开（任何人访问都看到同一个 owner 的聊天/朋友圈/角色）。前端
  # 在远程 origin 下应当把 baseUrl 改为 \${origin}/cloud/world-api（cloud-api 反代
  # + 按 token 路由到对应账号 child）。本地直连（127.0.0.1 / localhost / 私网 IP）
  # 保持直通，单机开发体验不变。
  map $http_host $is_public_host {
    default 0;
    ~^${siteHostExact.replace(/\./g, "\\.")} 1;
  }

  server {
    listen ${listenAddress} default_server;
    server_name _;

    root ${appDistDir};
    index index.html;

    # location / 内 if 块通过 proxy_pass 反代到 5185 时不会继承 location 级
    # 的 proxy_set_header，这里在 server 级提供默认值。其他显式声明 header
    # 的 location 会按 nginx 全有或全无规则覆盖整组，不受影响。
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;

    location = /healthz {
      access_log off;
      add_header Content-Type text/plain;
      return 200 "ok\\n";
    }

    location /api/ {
      # 公网 Host 不允许直通本机 3000（共享 owner db）。前端应走 /cloud/world-api。
      if ($is_public_host) { return 403; }
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
      # 公网 Host 同理走多租户反代（前端 socket 在 baseUrl 含 /cloud/world-api
      # 时会自动 path 到 /cloud/world-api/socket.io）；本机直连保持直通。
      if ($is_public_host) { return 403; }
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

    location /cloud/ {
      # /cloud/world-api/socket.io 的 WS upgrade 也走这里，必须显式带上
      # Upgrade/Connection；不带的话浏览器 ws://<host>/cloud/world-api/socket.io
      # 握手会在 nginx 这一跳被退化成普通 HTTP，cloud-api 那边的 upgrade
      # listener 不会触发，前端就一直拿 "WebSocket connection failed"。
      # 视频/音频走的是 cloud-api HTTP 代理，普通 proxy_set_header 足够；
      # WS 升级在这里 set Upgrade 不会影响普通请求（无 Upgrade header 时
      # $connection_upgrade map 默认是 "close"，等价无此 header）。
      proxy_pass ${cloudUpstream};
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

    location /admin/cloud/ {
      proxy_pass ${cloudUpstream};
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 客户端埋点 SDK 上报到 cloud-api 的 telemetry 入口。app/site/wiki 三端
    # 都会从浏览器同源 POST /telemetry/events/batch；如果这里没接，事件全部
    # 落到 SPA fallback 上变成 405/200 HTML，cloud-console 看到的就是空数据。
    location /telemetry/ {
      proxy_pass ${cloudUpstream};
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /runtime-config.json {
      add_header Cache-Control "no-store";
      try_files $uri =404;
    }

    location /assets/ {
      add_header Cache-Control "public, max-age=31536000, immutable";
      try_files $uri =404;
    }

    # 默认 location：HTTPS 隧道 (Host=${siteHostExact} 无端口) 反代到 site (5185)；
    # 其他 Host（HTTP :29490 隧道、本机直连）走 app dist (SPA)。
    location / {
      error_page 418 = @site_proxy;
      if ($route_to_site) { return 418; }
      # no-store 会让公网每次刷新都全量传 index.html (~12KB)；
      # no-cache 允许浏览器缓存但强制每次走 If-None-Match 验证。
      # nginx 对静态文件自动发 ETag/Last-Modified，命中走 304 空响应，
      # 公网隧道下省 body 传输和解析（重访 ~200-300ms）。hash 资源仍 1y immutable，
      # 所以 index.html 改成 must-revalidate 不会导致用户拿到陈旧 chunk。
      add_header Cache-Control "no-cache";
      try_files $uri $uri/ /index.html;
    }

    location @site_proxy {
      internal;
      proxy_pass ${siteUpstream};
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header Accept-Encoding $http_accept_encoding;
      proxy_read_timeout 60s;
      proxy_send_timeout 60s;
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
