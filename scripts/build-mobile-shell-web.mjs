import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspaceDir = resolve(currentDir, "..");
const appDir = resolve(workspaceDir, "apps/app");

// 输出到 apps/app/dist-mobile，不再覆盖 apps/app/dist。
// 公网 web (nginx) 服务 apps/app/dist 要求绝对路径 /assets/...；
// 移动壳 (Capacitor / file://) 要求相对路径 ./assets/...。
// 两者共用 dist 时，一跑移动壳构建就会把公网产物换成相对路径，
// 浏览器在 /tabs/chat 等深层路径下把 ./assets/foo.js 解析成
// /tabs/assets/foo.js，nginx SPA fallback 全部回 index.html，
// strict MIME 直接 reject → 用户卡在 splash 永远进不去。
function exec(cmd, args, env) {
  const result = spawnSync(cmd, args, {
    cwd: workspaceDir,
    stdio: "inherit",
    env: env ? { ...process.env, ...env } : process.env,
  });
  if (typeof result.status === "number") {
    if (result.status !== 0) {
      process.exit(result.status);
    }
    return;
  }
  throw result.error ?? new Error(`Failed to run ${cmd} ${args.join(" ")}`);
}

exec("pnpm", ["--dir", appDir, "exec", "tsc", "-p", "tsconfig.app.json"]);
exec(
  "pnpm",
  ["--dir", appDir, "exec", "vite", "build", "--outDir", "dist-mobile"],
  { YINJIE_APP_BUILD_BASE: "relative" },
);
