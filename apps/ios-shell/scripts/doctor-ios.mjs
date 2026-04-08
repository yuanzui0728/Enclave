import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const shellRoot = path.resolve(scriptDir, "..");

const checks = [
  {
    label: "platform",
    ok: process.platform === "darwin",
    detail: process.platform === "darwin" ? "running on macOS" : `current platform is ${process.platform}, Xcode work must run on macOS`,
  },
  {
    label: "xcode-template",
    ok: fs.existsSync(path.join(shellRoot, "xcode-template", "Info.plist.example")),
    detail: "xcode-template samples are present",
  },
  {
    label: "runtime-config-template",
    ok: fs.existsSync(path.join(shellRoot, "runtime-config.example.json")),
    detail: "runtime-config.example.json is present",
  },
  {
    label: "plugin-stubs",
    ok:
      fs.existsSync(path.join(shellRoot, "plugins", "swift-stub", "YinjieRuntimePlugin.swift")) &&
      fs.existsSync(path.join(shellRoot, "plugins", "swift-stub", "YinjieSecureStoragePlugin.swift")) &&
      fs.existsSync(path.join(shellRoot, "plugins", "swift-stub", "YinjieMobileBridgePlugin.swift")),
    detail: "native plugin stubs are present",
  },
  {
    label: "ios-project",
    ok: fs.existsSync(path.join(shellRoot, "ios")),
    detail: fs.existsSync(path.join(shellRoot, "ios"))
      ? "Capacitor iOS project directory exists"
      : "no ios/ project yet, run `pnpm ios:sync` on macOS",
  },
  {
    label: "core-api-env",
    ok: Boolean(process.env.YINJIE_IOS_CORE_API_BASE_URL),
    detail: process.env.YINJIE_IOS_CORE_API_BASE_URL
      ? `YINJIE_IOS_CORE_API_BASE_URL=${process.env.YINJIE_IOS_CORE_API_BASE_URL}`
      : "YINJIE_IOS_CORE_API_BASE_URL is not set",
  },
];

const passed = checks.filter((item) => item.ok).length;

console.log(`iOS doctor: ${passed}/${checks.length} checks passed`);
for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "WARN"}  ${item.label}: ${item.detail}`);
}

console.log("");
console.log("Next steps:");
console.log("1. Run this command on macOS.");
console.log("2. Set YINJIE_IOS_CORE_API_BASE_URL before `pnpm ios:sync`.");
console.log("3. After sync, run `pnpm ios:configure` to copy Xcode templates and plugin stubs.");
console.log(`4. Hostname: ${os.hostname()}`);
