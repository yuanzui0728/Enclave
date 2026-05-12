#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const artifactRoot = path.join(repoRoot, ".artifacts", "huggingface");
const templateRoot = path.join(repoRoot, "deploy", "huggingface");

const DEFAULT_OWNER = "w9000";
const DEFAULT_SPACE_REPO = "enclave";
const DEFAULT_MODEL_REPO = "enclave-character-recipes";
const DEFAULT_GITHUB_URL = "https://github.com/yuanzui0728/yinjie-app";
const DEFAULT_SITE_URL = "http://1gw06751dd053.vicp.fun";
const DEFAULT_CONTACT_EMAIL = "yuanzui0728@gmail.com";

const EXCLUDED_NAMES = new Set([
  ".cache",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "logs",
  "node_modules",
  "test-results",
]);

function parseArgs(argv) {
  const options = {
    command: "stage",
    dryRun: false,
    spaceOnly: false,
    modelOnly: false,
    owner: process.env.HF_OWNER || process.env.HUGGINGFACE_OWNER || DEFAULT_OWNER,
    spaceRepo: process.env.HF_SPACE_REPO || DEFAULT_SPACE_REPO,
    modelRepo: process.env.HF_MODEL_REPO || DEFAULT_MODEL_REPO,
    githubUrl: process.env.HF_GITHUB_URL || DEFAULT_GITHUB_URL,
    siteUrl: process.env.HF_SITE_URL || DEFAULT_SITE_URL,
    contactEmail: process.env.HF_CONTACT_EMAIL || DEFAULT_CONTACT_EMAIL,
    spaceAppUrl: process.env.HF_SPACE_APP_URL || "",
  };

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    } else if (arg === "stage" || arg === "publish") {
      options.command = arg;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--space-only") {
      options.spaceOnly = true;
    } else if (arg === "--model-only") {
      options.modelOnly = true;
    } else if (arg.startsWith("--owner=")) {
      options.owner = arg.slice("--owner=".length);
    } else if (arg.startsWith("--space-repo=")) {
      options.spaceRepo = arg.slice("--space-repo=".length);
    } else if (arg.startsWith("--model-repo=")) {
      options.modelRepo = arg.slice("--model-repo=".length);
    } else if (arg.startsWith("--github-url=")) {
      options.githubUrl = arg.slice("--github-url=".length);
    } else if (arg.startsWith("--site-url=")) {
      options.siteUrl = arg.slice("--site-url=".length);
    } else if (arg.startsWith("--space-app-url=")) {
      options.spaceAppUrl = arg.slice("--space-app-url=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.spaceOnly && options.modelOnly) {
    throw new Error("--space-only and --model-only cannot be used together");
  }

  return options;
}

function resolveRepo(input, fallbackOwner) {
  const trimmed = input.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) {
    throw new Error("Repository name cannot be empty");
  }

  if (trimmed.includes("/")) {
    const [owner, name, ...rest] = trimmed.split("/");
    if (!owner || !name || rest.length) {
      throw new Error(`Invalid Hugging Face repo id: ${input}`);
    }
    return { owner, name, repoId: `${owner}/${name}` };
  }

  return {
    owner: fallbackOwner,
    name: trimmed,
    repoId: `${fallbackOwner}/${trimmed}`,
  };
}

function spaceSubdomain(owner, name) {
  return `${owner}-${name}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

function buildContext(options) {
  const space = resolveRepo(options.spaceRepo, options.owner);
  const model = resolveRepo(options.modelRepo, options.owner);
  const spaceAppUrl =
    options.spaceAppUrl ||
    `https://${spaceSubdomain(space.owner, space.name)}.hf.space`;

  return {
    options,
    space,
    model,
    spaceAppUrl,
    spaceUrl: `https://huggingface.co/spaces/${space.repoId}`,
    modelUrl: `https://huggingface.co/${model.repoId}`,
    deployUrl: `${options.githubUrl}/blob/main/DEPLOY.md`,
  };
}

function shouldStageSpace(options) {
  return !options.modelOnly;
}

function shouldStageModel(options) {
  return !options.spaceOnly;
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, content, "utf8");
}

function copyFile(source, target) {
  if (!existsSync(source)) {
    return false;
  }
  ensureDir(path.dirname(target));
  copyFileSync(source, target);
  return true;
}

function isEnvFile(name) {
  return name === ".env" || (name.startsWith(".env.") && !name.endsWith(".example"));
}

function shouldSkipEntry(name) {
  return (
    EXCLUDED_NAMES.has(name) ||
    isEnvFile(name) ||
    name.endsWith(".log") ||
    name.endsWith(".tsbuildinfo") ||
    name.endsWith(".sqlite") ||
    name.endsWith(".sqlite-journal") ||
    name.endsWith(".sqlite-wal") ||
    name.endsWith(".sqlite-shm")
  );
}

function copyDirFiltered(source, target) {
  if (!existsSync(source)) {
    return;
  }

  const stats = statSync(source);
  if (!stats.isDirectory()) {
    copyFile(source, target);
    return;
  }

  ensureDir(target);
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (shouldSkipEntry(entry.name)) {
      continue;
    }

    const src = path.join(source, entry.name);
    const dst = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirFiltered(src, dst);
    } else if (entry.isFile()) {
      copyFile(src, dst);
    }
  }
}

function renderTemplate(filePath, replacements) {
  const template = readFileSync(filePath, "utf8");
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    if (!(key in replacements)) {
      throw new Error(`Missing template replacement: ${key}`);
    }
    return replacements[key];
  });
}

function replacementsFor(context) {
  return {
    HF_OWNER: context.space.owner,
    HF_SPACE_REPO: context.space.name,
    HF_MODEL_REPO: context.model.name,
    SPACE_URL: context.spaceUrl,
    SPACE_APP_URL: context.spaceAppUrl,
    MODEL_URL: context.modelUrl,
    GITHUB_URL: context.options.githubUrl,
    DEPLOY_URL: context.deployUrl,
    SITE_URL: context.options.siteUrl,
    CONTACT_EMAIL: context.options.contactEmail,
  };
}

function stageSpace(context) {
  const destination = path.join(artifactRoot, "space");
  rmSync(destination, { recursive: true, force: true });
  ensureDir(destination);

  for (const file of [
    ".dockerignore",
    ".npmrc",
    "LICENSE",
    "lingui.config.ts",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    "turbo.json",
  ]) {
    copyFile(path.join(repoRoot, file), path.join(destination, file));
  }

  for (const dir of [
    "apps/site",
    "docs/assets",
    "docs/screenshots",
    "packages/analytics",
    "packages/config",
    "packages/contracts",
    "packages/i18n",
    "packages/ui",
  ]) {
    copyDirFiltered(path.join(repoRoot, dir), path.join(destination, dir));
  }

  copyFile(
    path.join(repoRoot, "apps/desktop/src-tauri/icons/icon.png"),
    path.join(destination, "apps/desktop/src-tauri/icons/icon.png"),
  );

  const dockerfile = readFileSync(
    path.join(repoRoot, "apps/site/Dockerfile"),
    "utf8",
  ).replace(
    /^ARG NEXT_PUBLIC_SITE_URL=.*$/m,
    `ARG NEXT_PUBLIC_SITE_URL=${context.spaceAppUrl}`,
  );
  writeText(path.join(destination, "Dockerfile"), dockerfile);

  writeText(
    path.join(destination, "README.md"),
    renderTemplate(
      path.join(templateRoot, "space", "README.template.md"),
      replacementsFor(context),
    ),
  );

  writeText(
    path.join(destination, ".hfignore"),
    [
      ".artifacts/",
      ".cache/",
      ".next/",
      ".turbo/",
      "node_modules/",
      "apps/*/node_modules/",
      "packages/*/node_modules/",
      "dist/",
      "build/",
      "*.log",
      ".env",
      ".env.*",
      "!*.env.example",
      "",
    ].join("\n"),
  );

  return destination;
}

function stageModel(context) {
  const destination = path.join(artifactRoot, "model");
  rmSync(destination, { recursive: true, force: true });
  ensureDir(destination);

  copyFile(path.join(repoRoot, "LICENSE"), path.join(destination, "LICENSE"));
  copyDirFiltered(
    path.join(templateRoot, "model", "schema"),
    path.join(destination, "schema"),
  );
  copyDirFiltered(
    path.join(templateRoot, "model", "recipes"),
    path.join(destination, "recipes"),
  );

  writeText(
    path.join(destination, "README.md"),
    renderTemplate(
      path.join(templateRoot, "model", "README.template.md"),
      replacementsFor(context),
    ),
  );

  return destination;
}

function currentHfUser() {
  const result = spawnSync("huggingface-cli", ["whoami"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("orgs:"));
}

function runHf(args, options = {}) {
  const printable = `huggingface-cli ${args.join(" ")}`;
  if (options.dryRun) {
    console.log(`[hf:dry-run] ${printable}`);
    return;
  }

  const result = spawnSync("huggingface-cli", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.status !== 0) {
    if (options.allowAlreadyExists && /already exists|409|Conflict/i.test(output)) {
      console.log(`[hf] Repository already exists: ${options.repoId}`);
      return;
    }
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`Command failed: ${printable}`);
  }
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
}

function createRepoArgs(repo, type, activeUser) {
  const args = ["repo", "create", repo.name, "-y"];
  if (type === "space") {
    args.push("--type", "space", "--space_sdk", "docker");
  }
  if (repo.owner !== activeUser) {
    args.push("--organization", repo.owner);
  }
  return args;
}

function publish(context, staged) {
  const activeUser = currentHfUser();
  if (!activeUser && !context.options.dryRun) {
    throw new Error("huggingface-cli is not logged in. Run `huggingface-cli login` first.");
  }

  if (staged.space) {
    runHf(createRepoArgs(context.space, "space", activeUser), {
      allowAlreadyExists: true,
      dryRun: context.options.dryRun,
      repoId: context.space.repoId,
    });
    runHf(
      [
        "upload",
        context.space.repoId,
        staged.space,
        ".",
        "--repo-type",
        "space",
        "--commit-message",
        "Update Enclave Space listing",
      ],
      { dryRun: context.options.dryRun },
    );
  }

  if (staged.model) {
    runHf(createRepoArgs(context.model, "model", activeUser), {
      allowAlreadyExists: true,
      dryRun: context.options.dryRun,
      repoId: context.model.repoId,
    });
    runHf(
      [
        "upload",
        context.model.repoId,
        staged.model,
        ".",
        "--repo-type",
        "model",
        "--commit-message",
        "Update Enclave character recipes",
      ],
      { dryRun: context.options.dryRun },
    );
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const context = buildContext(options);
  const staged = {};

  if (shouldStageSpace(options)) {
    staged.space = stageSpace(context);
    console.log(`[hf:stage] Space staged at ${path.relative(repoRoot, staged.space)}`);
  }

  if (shouldStageModel(options)) {
    staged.model = stageModel(context);
    console.log(`[hf:stage] Model staged at ${path.relative(repoRoot, staged.model)}`);
  }

  console.log(`[hf:stage] Space repo: ${context.space.repoId}`);
  console.log(`[hf:stage] Model repo: ${context.model.repoId}`);

  if (options.command === "publish") {
    publish(context, staged);
  }
}

try {
  main();
} catch (error) {
  console.error(`[hf] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
