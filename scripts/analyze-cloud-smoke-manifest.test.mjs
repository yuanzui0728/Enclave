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
const scriptPath = resolve(scriptsDir, "analyze-cloud-smoke-manifest.mjs");

test("analyze-cloud-smoke-manifest derives candidates from incomplete harness data", async (t) => {
  const tempRoot = await mkdtemp(
    join(tmpdir(), "yinjie-cloud-smoke-diagnosis-"),
  );
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const manifestPath = join(tempRoot, "manifest.json");
  const diagnosisPath = join(tempRoot, "diagnosis.json");
  const summaryPath = join(tempRoot, "summary.md");
  const outputPath = join(tempRoot, "github-output.txt");
  await writeFile(summaryPath, "Existing summary block", "utf8");
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: "2026-04-20T12:00:00.000Z",
        uploads: {
          playwright: {
            name: "cloud-smoke-playwright-artifacts",
            path: "playwright",
            collected: false,
            fileCount: 0,
            tracePaths: [],
            errorContextPaths: [],
          },
          browserHarness: {
            name: "cloud-smoke-browser-harness",
            path: "browser-harness",
            collected: true,
            directories: [
              {
                directoryName: "yinjie-cloud-console-browser-bad",
                requiredFiles: {
                  "cloud-api.harness.json": true,
                  "cloud-console.harness.json": false,
                  "cloud-api.stdout.log": false,
                  "cloud-api.stderr.log": true,
                  "cloud-console.stdout.log": false,
                  "cloud-console.stderr.log": true,
                },
                cloudApiSummary: {
                  kind: "invalid",
                  message: "Unexpected token",
                },
                cloudConsoleSummary: null,
                sqliteFiles: [],
              },
            ],
          },
          manifest: {
            name: "cloud-smoke-manifest",
            path: "manifest.json",
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      GITHUB_STEP_SUMMARY: summaryPath,
      GITHUB_OUTPUT: outputPath,
      YINJIE_CLOUD_SMOKE_MANIFEST_PATH: manifestPath,
      YINJIE_CLOUD_SMOKE_DIAGNOSIS_PATH: diagnosisPath,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(existsSync(diagnosisPath), true);

  const diagnosis = JSON.parse(await readFile(diagnosisPath, "utf8"));
  assert.equal(diagnosis.schemaVersion, 1);
  assert.equal(diagnosis.highestSeverity, "high");
  assert.equal(diagnosis.primaryCandidate.id, "missing-playwright-artifacts");
  assert.deepEqual(diagnosis.primaryCandidate.recommendedArtifacts, [
    "cloud-smoke-manifest",
    "cloud-smoke-browser-harness",
  ]);
  assert.match(
    diagnosis.primaryCandidate.nextStep,
    /Open the preserved browser harness logs and harness JSON first/,
  );
  assert.ok(
    diagnosis.candidates.some(
      (candidate) => candidate.id === "missing-playwright-artifacts",
    ),
  );
  assert.ok(
    diagnosis.candidates.some(
      (candidate) => candidate.id === "browser-harness-metadata-incomplete",
    ),
  );
  assert.ok(
    diagnosis.candidates.some(
      (candidate) => candidate.id === "browser-harness-logs-incomplete",
    ),
  );
  assert.ok(
    diagnosis.candidates.some(
      (candidate) => candidate.id === "browser-harness-database-missing",
    ),
  );

  const githubOutput = parseGitHubOutput(await readFile(outputPath, "utf8"));
  assert.equal(githubOutput.candidate_count, "4");
  assert.equal(githubOutput.highest_severity, "high");
  assert.equal(
    githubOutput.primary_candidate_id,
    "missing-playwright-artifacts",
  );
  assert.equal(githubOutput.primary_candidate_severity, "high");
  assert.equal(
    githubOutput.primary_candidate_title,
    "Browser harness data exists but Playwright artifacts are missing",
  );
  assert.equal(
    githubOutput.primary_candidate_recommended_artifacts,
    "cloud-smoke-manifest,cloud-smoke-browser-harness",
  );
  assert.match(
    githubOutput.primary_candidate_next_step,
    /Open the preserved browser harness logs and harness JSON first/,
  );

  const summary = await readFile(summaryPath, "utf8");
  assert.match(summary, /^Existing summary block\n\n## Cloud Smoke Verdict/m);
  assert.match(summary, /Highest severity: `high`/);
  assert.match(
    summary,
    /Primary candidate: `high` Browser harness data exists but Playwright artifacts are missing/,
  );
  assert.match(
    summary,
    /Start with: `cloud-smoke-manifest`, `cloud-smoke-browser-harness`/,
  );
  assert.match(
    summary,
    /Next step: Open the preserved browser harness logs and harness JSON first/,
  );
  assert.match(summary, /\n## Cloud Smoke Diagnosis\n/);
  assert.match(summary, /Browser harness metadata is incomplete/);
});

test("analyze-cloud-smoke-manifest reports the no-artifacts case", async (t) => {
  const tempRoot = await mkdtemp(
    join(tmpdir(), "yinjie-cloud-smoke-diagnosis-empty-"),
  );
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const manifestPath = join(tempRoot, "manifest.json");
  const diagnosisPath = join(tempRoot, "diagnosis.json");
  const outputPath = join(tempRoot, "github-output.txt");
  await mkdir(tempRoot, { recursive: true });
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: "2026-04-20T12:00:00.000Z",
        uploads: {
          playwright: {
            name: "cloud-smoke-playwright-artifacts",
            path: "playwright",
            collected: false,
            fileCount: 0,
            tracePaths: [],
            errorContextPaths: [],
          },
          browserHarness: {
            name: "cloud-smoke-browser-harness",
            path: "browser-harness",
            collected: false,
            directories: [],
          },
          manifest: {
            name: "cloud-smoke-manifest",
            path: "manifest.json",
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      GITHUB_OUTPUT: outputPath,
      YINJIE_CLOUD_SMOKE_MANIFEST_PATH: manifestPath,
      YINJIE_CLOUD_SMOKE_DIAGNOSIS_PATH: diagnosisPath,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const diagnosis = JSON.parse(await readFile(diagnosisPath, "utf8"));
  assert.equal(diagnosis.highestSeverity, "high");
  assert.equal(diagnosis.candidateCount, 1);
  assert.equal(diagnosis.candidates[0].id, "no-preserved-artifacts");
  assert.equal(diagnosis.primaryCandidate.id, "no-preserved-artifacts");
  assert.deepEqual(diagnosis.primaryCandidate.recommendedArtifacts, [
    "cloud-smoke-manifest",
  ]);

  const githubOutput = parseGitHubOutput(await readFile(outputPath, "utf8"));
  assert.equal(githubOutput.primary_candidate_id, "no-preserved-artifacts");
  assert.equal(githubOutput.primary_candidate_severity, "high");
  assert.equal(
    githubOutput.primary_candidate_title,
    "No preserved cloud smoke artifacts were produced",
  );
  assert.equal(
    githubOutput.primary_candidate_recommended_artifacts,
    "cloud-smoke-manifest",
  );
});

function parseGitHubOutput(rawOutput) {
  const result = {};
  const lines = rawOutput.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }

    const delimiterIndex = line.indexOf("<<");
    if (delimiterIndex === -1) {
      continue;
    }

    const key = line.slice(0, delimiterIndex);
    const delimiter = line.slice(delimiterIndex + 2);
    const valueLines = [];
    index += 1;

    while (index < lines.length && lines[index] !== delimiter) {
      valueLines.push(lines[index]);
      index += 1;
    }

    result[key] = valueLines.join("\n");
  }

  return result;
}
