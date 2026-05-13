#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
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
const DEFAULT_DATASET_REPO = "enclave-character-recipes";
const DEFAULT_MODEL_REPO = "enclave-character-blueprint";
const DEFAULT_GITHUB_URL = "https://github.com/yuanzui0728/enclave";
const DEFAULT_SITE_URL = "https://1gw06751dd053.vicp.fun";
const DEFAULT_CONTACT_EMAIL = "yuanzui0728@gmail.com";
const TARGETS = ["space", "dataset", "model"];

function parseArgs(argv) {
  const options = {
    command: "stage",
    dryRun: false,
    targets: new Set(TARGETS),
    owner: process.env.HF_OWNER || process.env.HUGGINGFACE_OWNER || DEFAULT_OWNER,
    spaceRepo: process.env.HF_SPACE_REPO || DEFAULT_SPACE_REPO,
    datasetRepo: process.env.HF_DATASET_REPO || DEFAULT_DATASET_REPO,
    modelRepo: process.env.HF_MODEL_REPO || DEFAULT_MODEL_REPO,
    githubUrl: process.env.HF_GITHUB_URL || DEFAULT_GITHUB_URL,
    siteUrl: process.env.HF_SITE_URL || DEFAULT_SITE_URL,
    contactEmail: process.env.HF_CONTACT_EMAIL || DEFAULT_CONTACT_EMAIL,
  };

  let targetsExplicit = false;

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    } else if (arg === "stage" || arg === "publish") {
      options.command = arg;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg.startsWith("--target=")) {
      if (!targetsExplicit) {
        options.targets = new Set();
        targetsExplicit = true;
      }
      for (const t of arg.slice("--target=".length).split(",")) {
        const v = t.trim().toLowerCase();
        if (!TARGETS.includes(v)) throw new Error(`Unknown --target value: ${v}`);
        options.targets.add(v);
      }
    } else if (arg.startsWith("--owner=")) {
      options.owner = arg.slice("--owner=".length);
    } else if (arg.startsWith("--space-repo=")) {
      options.spaceRepo = arg.slice("--space-repo=".length);
    } else if (arg.startsWith("--dataset-repo=")) {
      options.datasetRepo = arg.slice("--dataset-repo=".length);
    } else if (arg.startsWith("--model-repo=")) {
      options.modelRepo = arg.slice("--model-repo=".length);
    } else if (arg.startsWith("--github-url=")) {
      options.githubUrl = arg.slice("--github-url=".length);
    } else if (arg.startsWith("--site-url=")) {
      options.siteUrl = arg.slice("--site-url=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.targets.size) {
    throw new Error("No targets selected.");
  }

  return options;
}

function resolveRepo(input, fallbackOwner) {
  const trimmed = input.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) throw new Error("Repository name cannot be empty");
  if (trimmed.includes("/")) {
    const [owner, name, ...rest] = trimmed.split("/");
    if (!owner || !name || rest.length) throw new Error(`Invalid HF repo id: ${input}`);
    return { owner, name, repoId: `${owner}/${name}` };
  }
  return { owner: fallbackOwner, name: trimmed, repoId: `${fallbackOwner}/${trimmed}` };
}

function spaceSubdomain(owner, name) {
  return `${owner}-${name}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

function buildContext(options) {
  const space = resolveRepo(options.spaceRepo, options.owner);
  const dataset = resolveRepo(options.datasetRepo, options.owner);
  const model = resolveRepo(options.modelRepo, options.owner);
  const githubOwnerRepo = (() => {
    try {
      const u = new URL(options.githubUrl);
      return u.pathname.replace(/^\/+|\/+$/g, "");
    } catch {
      return options.githubUrl;
    }
  })();
  return {
    options,
    space,
    dataset,
    model,
    spaceUrl: `https://huggingface.co/spaces/${space.repoId}`,
    spaceAppUrl: `https://${spaceSubdomain(space.owner, space.name)}.static.hf.space`,
    datasetUrl: `https://huggingface.co/datasets/${dataset.repoId}`,
    modelUrl: `https://huggingface.co/${model.repoId}`,
    deployUrl: `${options.githubUrl}/blob/main/DEPLOY.md`,
    githubOwnerRepo,
  };
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, content, "utf8");
}

function copyFile(source, target) {
  if (!existsSync(source)) return false;
  ensureDir(path.dirname(target));
  copyFileSync(source, target);
  return true;
}

function renderTemplate(filePath, replacements) {
  const template = readFileSync(filePath, "utf8");
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    if (!(key in replacements)) throw new Error(`Missing template replacement: ${key}`);
    return replacements[key];
  });
}

function replacementsFor(context) {
  return {
    HF_OWNER: context.space.owner,
    HF_SPACE_REPO: context.space.name,
    HF_DATASET_REPO: context.dataset.name,
    HF_MODEL_REPO: context.model.name,
    SPACE_REPO: context.space.repoId,
    DATASET_REPO: context.dataset.repoId,
    MODEL_REPO: context.model.repoId,
    SPACE_URL: context.spaceUrl,
    SPACE_APP_URL: context.spaceAppUrl,
    DATASET_URL: context.datasetUrl,
    MODEL_URL: context.modelUrl,
    GITHUB_URL: context.options.githubUrl,
    GITHUB_OWNER_REPO: context.githubOwnerRepo,
    DEPLOY_URL: context.deployUrl,
    SITE_URL: context.options.siteUrl,
    CONTACT_EMAIL: context.options.contactEmail,
    LANGS: "zh / en / ja / ko",
  };
}

// ---------- STAGE: SPACE (static landing) ----------

const SPACE_SCREENSHOTS = [
  "core-feed", "core-feed.en", "core-feed.ja", "core-feed.ko",
  "core-chat", "core-chat.en", "core-chat.ja", "core-chat.ko",
  "core-group", "core-group.en", "core-group.ja", "core-group.ko",
  "core-moments", "core-moments.en", "core-moments.ja", "core-moments.ko",
  "core-self-character", "core-self-character.en", "core-self-character.ja", "core-self-character.ko",
  "core-onboarding", "core-onboarding.en", "core-onboarding.ja", "core-onboarding.ko",
];

const SPACE_LOOP_GIFS = [
  "yinjie-core-loop.gif",
  "yinjie-core-loop.en.gif",
  "yinjie-core-loop.ja.gif",
  "yinjie-core-loop.ko.gif",
];

function stageSpace(context) {
  const destination = path.join(artifactRoot, "space");
  rmSync(destination, { recursive: true, force: true });
  ensureDir(destination);

  const reps = replacementsFor(context);

  // index.html with placeholder substitution
  const indexHtml = renderTemplate(
    path.join(templateRoot, "space", "static", "index.html"),
    reps,
  );
  writeText(path.join(destination, "index.html"), indexHtml);

  // README.md (Space card, front-matter drives SDK)
  writeText(
    path.join(destination, "README.md"),
    renderTemplate(path.join(templateRoot, "space", "README.template.md"), reps),
  );

  // LICENSE
  copyFile(path.join(repoRoot, "LICENSE"), path.join(destination, "LICENSE"));

  // assets: screenshots
  ensureDir(path.join(destination, "assets", "screenshots"));
  for (const base of SPACE_SCREENSHOTS) {
    const src = path.join(repoRoot, "docs", "screenshots", `${base}.png`);
    const dst = path.join(destination, "assets", "screenshots", `${base}.png`);
    if (!copyFile(src, dst)) {
      console.warn(`[hf:stage:space] missing screenshot: ${src}`);
    }
  }

  // assets: loop gifs
  ensureDir(path.join(destination, "assets", "loop"));
  for (const name of SPACE_LOOP_GIFS) {
    const src = path.join(repoRoot, "docs", "assets", name);
    const dst = path.join(destination, "assets", "loop", name);
    if (!copyFile(src, dst)) {
      console.warn(`[hf:stage:space] missing loop gif: ${src}`);
    }
  }

  // .gitattributes for LFS-friendly handling of binary assets on HF
  writeText(
    path.join(destination, ".gitattributes"),
    [
      "*.gif filter=lfs diff=lfs merge=lfs -text",
      "*.png filter=lfs diff=lfs merge=lfs -text",
      "*.jpg filter=lfs diff=lfs merge=lfs -text",
      "",
    ].join("\n"),
  );

  return destination;
}

// ---------- STAGE: DATASET (recipes + viewer) ----------

function stageDataset(context) {
  const destination = path.join(artifactRoot, "dataset");
  rmSync(destination, { recursive: true, force: true });
  ensureDir(destination);

  const reps = replacementsFor(context);

  // README with Datasets-Viewer-driving front-matter
  writeText(
    path.join(destination, "README.md"),
    renderTemplate(path.join(templateRoot, "dataset", "README.template.md"), reps),
  );

  // LICENSE
  copyFile(path.join(repoRoot, "LICENSE"), path.join(destination, "LICENSE"));

  // schema (so users can validate without jumping to model repo)
  ensureDir(path.join(destination, "schema"));
  copyFile(
    path.join(templateRoot, "model", "schema", "character-blueprint.schema.json"),
    path.join(destination, "schema", "character-blueprint.schema.json"),
  );

  // per-recipe JSON files (human-readable)
  ensureDir(path.join(destination, "recipes"));
  const recipeDir = path.join(templateRoot, "dataset", "recipes");
  const recipeFiles = readdirSync(recipeDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (!recipeFiles.length) {
    throw new Error(`No recipe files in ${recipeDir}`);
  }

  const recipes = [];
  for (const f of recipeFiles) {
    const src = path.join(recipeDir, f);
    const raw = readFileSync(src, "utf8");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(`Invalid JSON in ${f}: ${e.message}`);
    }
    if (!parsed.id || !parsed.name || !parsed.blueprint) {
      throw new Error(`Recipe ${f} missing required fields (id/name/blueprint)`);
    }
    copyFileSync(src, path.join(destination, "recipes", f));
    recipes.push(parsed);
  }

  // recipes.jsonl for HF Datasets Viewer
  // Column order = property insertion order: id, name, lang, summary, tags, blueprint.
  const jsonl = recipes
    .map((r) => {
      const row = {
        id: r.id,
        name: r.name,
        lang: r.lang || "en",
        summary: r.summary || "",
        tags: r.tags || [],
        blueprint: r.blueprint,
      };
      return JSON.stringify(row);
    })
    .join("\n") + "\n";
  writeText(path.join(destination, "recipes.jsonl"), jsonl);

  console.log(`[hf:stage:dataset] packaged ${recipes.length} recipes into recipes.jsonl`);

  return destination;
}

// ---------- STAGE: MODEL (schema-only) ----------

function stageModel(context) {
  const destination = path.join(artifactRoot, "model");
  rmSync(destination, { recursive: true, force: true });
  ensureDir(destination);

  const reps = replacementsFor(context);

  copyFile(path.join(repoRoot, "LICENSE"), path.join(destination, "LICENSE"));

  ensureDir(path.join(destination, "schema"));
  copyFile(
    path.join(templateRoot, "model", "schema", "character-blueprint.schema.json"),
    path.join(destination, "schema", "character-blueprint.schema.json"),
  );

  writeText(
    path.join(destination, "README.md"),
    renderTemplate(path.join(templateRoot, "model", "README.template.md"), reps),
  );

  return destination;
}

// ---------- PUBLISH ----------

function currentHfUser() {
  const result = spawnSync("huggingface-cli", ["whoami"], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("orgs:"));
}

function runHf(args, options = {}) {
  const printable = `huggingface-cli ${args.join(" ")}`;
  if (options.dryRun) {
    console.log(`[hf:dry-run] ${printable}`);
    return;
  }
  const result = spawnSync("huggingface-cli", args, { cwd: repoRoot, encoding: "utf8", stdio: "pipe" });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.status !== 0) {
    if (options.allowAlreadyExists && /already exists|409|Conflict|You already created/i.test(output)) {
      console.log(`[hf] Repository already exists: ${options.repoId || ""}`);
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
  // huggingface-cli repo create <name> --type {model|dataset|space} [--space_sdk static] [--organization X]
  const args = ["repo", "create", repo.name, "-y"];
  if (type === "space") {
    args.push("--type", "space", "--space_sdk", "static");
  } else if (type === "dataset") {
    args.push("--type", "dataset");
  }
  // model is the default --type, omit
  if (repo.owner !== activeUser) {
    args.push("--organization", repo.owner);
  }
  return args;
}

function uploadArgs(repo, type, dir, message) {
  const args = ["upload", repo.repoId, dir, "."];
  if (type === "space") args.push("--repo-type", "space");
  else if (type === "dataset") args.push("--repo-type", "dataset");
  args.push("--commit-message", message);
  return args;
}

function publish(context, staged) {
  const activeUser = currentHfUser();
  if (!activeUser && !context.options.dryRun) {
    throw new Error("huggingface-cli is not logged in. Run `huggingface-cli login` first.");
  }

  const order = [
    ["space",   context.space,   staged.space,   "Update Enclave Space landing"],
    ["dataset", context.dataset, staged.dataset, "Update Enclave character recipes dataset"],
    ["model",   context.model,   staged.model,   "Update Enclave character blueprint schema"],
  ];

  for (const [type, repo, dir, msg] of order) {
    if (!dir) continue;
    console.log(`[hf:publish] ${type} → ${repo.repoId}`);
    runHf(createRepoArgs(repo, type, activeUser), {
      allowAlreadyExists: true,
      dryRun: context.options.dryRun,
      repoId: repo.repoId,
    });
    runHf(uploadArgs(repo, type, dir, msg), { dryRun: context.options.dryRun });
  }
}

// ---------- MAIN ----------

function main() {
  const options = parseArgs(process.argv.slice(2));
  const context = buildContext(options);
  const staged = {};

  if (options.targets.has("space")) {
    staged.space = stageSpace(context);
    console.log(`[hf:stage] Space staged at ${path.relative(repoRoot, staged.space)} → ${context.space.repoId}`);
  }
  if (options.targets.has("dataset")) {
    staged.dataset = stageDataset(context);
    console.log(`[hf:stage] Dataset staged at ${path.relative(repoRoot, staged.dataset)} → ${context.dataset.repoId}`);
  }
  if (options.targets.has("model")) {
    staged.model = stageModel(context);
    console.log(`[hf:stage] Model staged at ${path.relative(repoRoot, staged.model)} → ${context.model.repoId}`);
  }

  if (options.command === "publish") {
    publish(context, staged);
    console.log(`[hf:publish] done.`);
    console.log(`  Space:   ${context.spaceUrl}`);
    console.log(`  Dataset: ${context.datasetUrl}`);
    console.log(`  Model:   ${context.modelUrl}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`[hf] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
