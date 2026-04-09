import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve(process.cwd(), "runtime-config.example.json");
const outputPath = path.resolve(process.cwd(), "../app/dist/runtime-config.json");

if (!fs.existsSync(sourcePath)) {
  console.error(`Missing runtime config template: ${sourcePath}`);
  process.exit(1);
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

const template = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const apiBaseUrl = normalizeOptionalString(process.env.YINJIE_IOS_CORE_API_BASE_URL);

if (!apiBaseUrl) {
  console.error("Missing YINJIE_IOS_CORE_API_BASE_URL. Set it before `pnpm ios:sync`.");
  process.exit(1);
}

const socketBaseUrl = normalizeOptionalString(process.env.YINJIE_IOS_SOCKET_BASE_URL) || apiBaseUrl;
const environment = normalizeOptionalString(process.env.YINJIE_IOS_ENVIRONMENT) || template.environment || "production";
const publicAppName = normalizeOptionalString(process.env.YINJIE_IOS_PUBLIC_APP_NAME) || template.publicAppName || "Yinjie";

const runtimeConfig = {
  ...template,
  apiBaseUrl,
  socketBaseUrl,
  environment,
  publicAppName,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(runtimeConfig, null, 2)}\n`);
console.log(`Injected iOS runtime config into ${outputPath}`);
