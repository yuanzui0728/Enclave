import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsDir, "..");
const scriptPath = resolve(scriptsDir, "collect-cloud-smoke-artifacts.mjs");

test("collect-cloud-smoke-artifacts collects files and writes a detailed summary", async (t) => {
  const tempRoot = await mkdtemp(join(tmpdir(), "yinjie-cloud-smoke-script-"));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const playwrightSourceDir = join(tempRoot, "playwright-source");
  const browserHarnessParentDir = join(tempRoot, "browser-harness-parent");
  const artifactRoot = join(tempRoot, "artifacts");
  const summaryPath = join(tempRoot, "summary.md");

  await mkdir(join(playwrightSourceDir, "spec-a"), { recursive: true });
  await mkdir(join(playwrightSourceDir, "spec-b", "nested"), { recursive: true });
  await writeFile(join(playwrightSourceDir, "spec-a", "trace.zip"), "trace-a", "utf8");
  await writeFile(
    join(playwrightSourceDir, "spec-a", "error-context.md"),
    "error context",
    "utf8",
  );
  await writeFile(
    join(playwrightSourceDir, "spec-b", "nested", "trace.zip"),
    "trace-b",
    "utf8",
  );

  const validHarnessDir = join(
    browserHarnessParentDir,
    "yinjie-cloud-console-browser-valid",
  );
  const invalidHarnessDir = join(
    browserHarnessParentDir,
    "yinjie-cloud-console-browser-invalid",
  );
  await mkdir(validHarnessDir, { recursive: true });
  await mkdir(invalidHarnessDir, { recursive: true });

  await writeFile(
    join(validHarnessDir, "cloud-api.harness.json"),
    JSON.stringify({
      baseUrl: "http://127.0.0.1:3101",
      port: 3101,
      databasePath: "/tmp/cloud-console-browser.sqlite",
      authTokenTtl: "1h",
    }),
    "utf8",
  );
  await writeFile(
    join(validHarnessDir, "cloud-console.harness.json"),
    JSON.stringify({
      baseUrl: "http://127.0.0.1:4101",
      cloudApiBaseUrl: "http://127.0.0.1:3101",
      port: 4101,
      pid: 12345,
    }),
    "utf8",
  );
  await writeFile(
    join(validHarnessDir, "cloud-console-browser.sqlite"),
    "sqlite",
    "utf8",
  );
  await writeFile(join(invalidHarnessDir, "cloud-api.harness.json"), "{bad json", "utf8");

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      GITHUB_STEP_SUMMARY: summaryPath,
      YINJIE_CLOUD_SMOKE_PLAYWRIGHT_SOURCE_DIR: playwrightSourceDir,
      YINJIE_CLOUD_SMOKE_BROWSER_HARNESS_PARENT_DIR: browserHarnessParentDir,
      YINJIE_CLOUD_SMOKE_ARTIFACT_ROOT: artifactRoot,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  assert.equal(
    existsSync(join(artifactRoot, "playwright", "spec-a", "trace.zip")),
    true,
  );
  assert.equal(
    existsSync(join(artifactRoot, "playwright", "spec-b", "nested", "trace.zip")),
    true,
  );
  assert.equal(
    existsSync(
      join(
        artifactRoot,
        "browser-harness",
        "yinjie-cloud-console-browser-valid",
        "cloud-console-browser.sqlite",
      ),
    ),
    true,
  );
  assert.equal(existsSync(join(artifactRoot, "manifest.json")), true);

  const manifest = JSON.parse(
    await readFile(join(artifactRoot, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.schemaVersion, 1);
  assert.match(manifest.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(manifest.artifactRoot, artifactRoot);
  assert.equal(manifest.sources.playwrightSourceDir, playwrightSourceDir);
  assert.equal(
    manifest.sources.browserHarnessParentDir,
    browserHarnessParentDir,
  );
  assert.equal(
    manifest.sources.browserHarnessPrefix,
    "yinjie-cloud-console-browser-",
  );
  assert.equal(manifest.uploads.playwright.name, "cloud-smoke-playwright-artifacts");
  assert.deepEqual(manifest.uploads.playwright.tracePaths, [
    "spec-a/trace.zip",
    "spec-b/nested/trace.zip",
  ]);
  assert.equal(manifest.uploads.browserHarness.directories[0].directoryName, "yinjie-cloud-console-browser-invalid");
  assert.equal(
    manifest.uploads.browserHarness.directories[1].requiredFiles["cloud-console.harness.json"],
    true,
  );
  assert.deepEqual(
    manifest.uploads.browserHarness.directories[1].cloudApiSummary.parts,
    [
      "baseUrl=http://127.0.0.1:3101",
      "port=3101",
      "database=cloud-console-browser.sqlite",
      "authTokenTtl=1h",
    ],
  );
  assert.equal(manifest.uploads.manifest.name, "cloud-smoke-manifest");

  const summary = await readFile(summaryPath, "utf8");
  assert.match(summary, /trace archives: 2/);
  assert.match(summary, /error context files: 1/);
  assert.match(summary, /`spec-a\/trace\.zip`/);
  assert.match(summary, /`spec-b\/nested\/trace\.zip`/);
  assert.match(summary, /authTokenTtl=1h/);
  assert.match(summary, /Manifest upload: `cloud-smoke-manifest`/);
  assert.match(summary, /path: `manifest\.json`/);
  assert.match(
    summary,
    /cloud-console summary: baseUrl=http:\/\/127\.0\.0\.1:4101, cloudApiBaseUrl=http:\/\/127\.0\.0\.1:3101, port=4101, pid=12345/,
  );
  assert.match(summary, /invalid JSON:/);
  assert.match(summary, /`cloud-console-browser\.sqlite`/);
});

test("collect-cloud-smoke-artifacts leaves no output directory when no sources exist", async (t) => {
  const tempRoot = await mkdtemp(join(tmpdir(), "yinjie-cloud-smoke-script-empty-"));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const artifactRoot = join(tempRoot, "artifacts");
  const summaryPath = join(tempRoot, "summary.md");
  const browserHarnessParentDir = join(tempRoot, "browser-harness-parent");
  await mkdir(browserHarnessParentDir, { recursive: true });

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      GITHUB_STEP_SUMMARY: summaryPath,
      YINJIE_CLOUD_SMOKE_PLAYWRIGHT_SOURCE_DIR: join(tempRoot, "missing-playwright"),
      YINJIE_CLOUD_SMOKE_BROWSER_HARNESS_PARENT_DIR: browserHarnessParentDir,
      YINJIE_CLOUD_SMOKE_ARTIFACT_ROOT: artifactRoot,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(existsSync(artifactRoot), true);
  assert.equal(existsSync(join(artifactRoot, "manifest.json")), true);

  const manifest = JSON.parse(
    await readFile(join(artifactRoot, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.uploads.playwright.collected, false);
  assert.equal(manifest.uploads.browserHarness.collected, false);
  assert.deepEqual(manifest.uploads.browserHarness.directories, []);

  const summary = await readFile(summaryPath, "utf8");
  assert.match(summary, /no Playwright artifacts were collected/);
  assert.match(summary, /no preserved browser harness temp dirs were collected/);
  assert.match(summary, /Manifest upload: `cloud-smoke-manifest`/);
  assert.match(summary, /path: `manifest\.json`/);
});

test("collect-cloud-smoke-artifacts appends a separated section to an existing summary", async (t) => {
  const tempRoot = await mkdtemp(join(tmpdir(), "yinjie-cloud-smoke-script-append-"));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const artifactRoot = join(tempRoot, "artifacts");
  const summaryPath = join(tempRoot, "summary.md");
  const browserHarnessParentDir = join(tempRoot, "browser-harness-parent");
  await mkdir(browserHarnessParentDir, { recursive: true });
  await writeFile(summaryPath, "Existing summary block", "utf8");

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      GITHUB_STEP_SUMMARY: summaryPath,
      YINJIE_CLOUD_SMOKE_PLAYWRIGHT_SOURCE_DIR: join(tempRoot, "missing-playwright"),
      YINJIE_CLOUD_SMOKE_BROWSER_HARNESS_PARENT_DIR: browserHarnessParentDir,
      YINJIE_CLOUD_SMOKE_ARTIFACT_ROOT: artifactRoot,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const summary = await readFile(summaryPath, "utf8");
  assert.match(summary, /^Existing summary block\n\n## Cloud Smoke Failure Artifacts/m);
});
