import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolvePath(
  process.env.YINJIE_CLOUD_SMOKE_MANIFEST_PATH,
  resolve(repoRoot, ".artifacts", "cloud-smoke", "manifest.json"),
);
const diagnosisPath = resolvePath(
  process.env.YINJIE_CLOUD_SMOKE_DIAGNOSIS_PATH,
  resolve(repoRoot, ".artifacts", "cloud-smoke", "diagnosis.json"),
);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const diagnosis = buildDiagnosis(manifest);

await mkdir(dirname(diagnosisPath), { recursive: true });
await writeFile(diagnosisPath, JSON.stringify(diagnosis, null, 2), "utf8");

if (process.env.GITHUB_OUTPUT) {
  await appendGitHubOutput(process.env.GITHUB_OUTPUT, diagnosis);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendSummaryMarkdown(
    process.env.GITHUB_STEP_SUMMARY,
    buildSummaryMarkdown(diagnosis),
  );
}

function buildDiagnosis(manifest) {
  const uploadNames = {
    playwright:
      manifest.uploads?.playwright?.name ?? "cloud-smoke-playwright-artifacts",
    browserHarness:
      manifest.uploads?.browserHarness?.name ?? "cloud-smoke-browser-harness",
    manifest: manifest.uploads?.manifest?.name ?? "cloud-smoke-manifest",
    diagnosis: "cloud-smoke-diagnosis",
  };
  const playwright = manifest.uploads?.playwright ?? {
    collected: false,
    tracePaths: [],
    errorContextPaths: [],
  };
  const browserHarness = manifest.uploads?.browserHarness ?? {
    collected: false,
    directories: [],
  };

  const candidates = [];

  if (!playwright.collected && !browserHarness.collected) {
    candidates.push(
      createCandidate({
        id: "no-preserved-artifacts",
        severity: "high",
        title: "No preserved cloud smoke artifacts were produced",
        summary:
          "The cloud smoke run failed before Playwright or browser harness artifacts were written.",
        evidence: [
          `playwright.collected=${playwright.collected}`,
          `browserHarness.collected=${browserHarness.collected}`,
        ],
        recommendedArtifacts: [uploadNames.manifest],
        nextStep:
          "Inspect the cloud-smoke job logs around the first failing step; no preserved browser artifacts are available yet.",
      }),
    );
  } else {
    if (!playwright.collected && browserHarness.collected) {
      candidates.push(
        createCandidate({
          id: "missing-playwright-artifacts",
          severity: "high",
          title:
            "Browser harness data exists but Playwright artifacts are missing",
          summary:
            "The stack preserved harness temp dirs, but Playwright did not write traces or error contexts.",
          evidence: [
            `preserved temp dirs=${browserHarness.directories.length}`,
            `trace archives=${playwright.tracePaths.length}`,
          ],
          recommendedArtifacts: [
            uploadNames.manifest,
            uploadNames.browserHarness,
          ],
          nextStep:
            "Open the preserved browser harness logs and harness JSON first to see whether Playwright failed before traces could be written.",
        }),
      );
    }

    if (playwright.collected && !browserHarness.collected) {
      candidates.push(
        createCandidate({
          id: "missing-browser-harness-artifacts",
          severity: "medium",
          title:
            "Playwright artifacts exist but browser harness temp dirs are missing",
          summary:
            "Playwright captured failure context, but the browser harness did not preserve any temp directories.",
          evidence: [
            `trace archives=${playwright.tracePaths.length}`,
            `error context files=${playwright.errorContextPaths.length}`,
          ],
          recommendedArtifacts: [uploadNames.manifest, uploadNames.playwright],
          nextStep:
            "Open the Playwright trace and error-context files first; the browser harness side did not preserve runtime temp dirs.",
        }),
      );
    }
  }

  if (playwright.collected && playwright.tracePaths.length === 0) {
    candidates.push(
      createCandidate({
        id: "playwright-traces-missing",
        severity: playwright.errorContextPaths.length > 0 ? "high" : "medium",
        title: "Playwright artifacts were collected without trace archives",
        summary:
          "Playwright saved artifact files, but none of them were trace archives.",
        evidence: [
          `collected files=${playwright.fileCount ?? 0}`,
          `error context files=${playwright.errorContextPaths.length}`,
        ],
        recommendedArtifacts: [uploadNames.manifest, uploadNames.playwright],
        nextStep:
          "Open the Playwright error-context files and confirm why trace.zip was never emitted for the failing test.",
      }),
    );
  }

  const metadataIssues = [];
  const logIssues = [];
  const databaseIssues = [];

  for (const directory of browserHarness.directories ?? []) {
    const requiredFiles = directory.requiredFiles ?? {};
    const missingMetadata = [
      "cloud-api.harness.json",
      "cloud-console.harness.json",
    ].filter((fileName) => requiredFiles[fileName] === false);
    const invalidSummaries = [];

    if (directory.cloudApiSummary?.kind === "invalid") {
      invalidSummaries.push("cloud-api.harness.json");
    }
    if (directory.cloudConsoleSummary?.kind === "invalid") {
      invalidSummaries.push("cloud-console.harness.json");
    }

    if (missingMetadata.length > 0 || invalidSummaries.length > 0) {
      const evidence = [];
      if (missingMetadata.length > 0) {
        evidence.push(`missing ${missingMetadata.join(", ")}`);
      }
      if (invalidSummaries.length > 0) {
        evidence.push(`invalid ${invalidSummaries.join(", ")}`);
      }
      metadataIssues.push(`${directory.directoryName}: ${evidence.join("; ")}`);
    }

    const missingLogs = [
      "cloud-api.stdout.log",
      "cloud-api.stderr.log",
      "cloud-console.stdout.log",
      "cloud-console.stderr.log",
    ].filter((fileName) => requiredFiles[fileName] === false);
    if (missingLogs.length > 0) {
      logIssues.push(
        `${directory.directoryName}: missing ${missingLogs.join(", ")}`,
      );
    }

    if ((directory.sqliteFiles?.length ?? 0) === 0) {
      databaseIssues.push(directory.directoryName);
    }
  }

  if (metadataIssues.length > 0) {
    candidates.push(
      createCandidate({
        id: "browser-harness-metadata-incomplete",
        severity: "high",
        title: "Browser harness metadata is incomplete",
        summary:
          "At least one preserved temp dir is missing harness JSON metadata or contains invalid JSON.",
        evidence: metadataIssues,
        recommendedArtifacts: [
          uploadNames.manifest,
          uploadNames.browserHarness,
        ],
        nextStep:
          "Open the listed temp dir and fix or inspect the missing or invalid harness JSON before trusting the rest of the diagnostics.",
      }),
    );
  }

  if (logIssues.length > 0) {
    candidates.push(
      createCandidate({
        id: "browser-harness-logs-incomplete",
        severity: "medium",
        title: "Browser harness logs are incomplete",
        summary:
          "At least one preserved temp dir is missing stdout or stderr logs from cloud-api or cloud-console.",
        evidence: logIssues,
        recommendedArtifacts: [
          uploadNames.manifest,
          uploadNames.browserHarness,
        ],
        nextStep:
          "Inspect the remaining logs in the listed temp dir to determine which process exited before log piping fully initialized.",
      }),
    );
  }

  if (databaseIssues.length > 0) {
    candidates.push(
      createCandidate({
        id: "browser-harness-database-missing",
        severity: "medium",
        title: "Browser harness temp dirs are missing sqlite databases",
        summary:
          "Some preserved temp dirs never produced a sqlite database, which suggests startup failed before persistence initialized.",
        evidence: databaseIssues.map(
          (directoryName) => `${directoryName}: sqlite files=0`,
        ),
        recommendedArtifacts: [
          uploadNames.manifest,
          uploadNames.browserHarness,
        ],
        nextStep:
          "Inspect cloud-api and cloud-console startup logs for the listed temp dir; persistence likely failed before sqlite initialization completed.",
      }),
    );
  }

  const primaryCandidate = selectPrimaryCandidate(candidates);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    manifestPath,
    manifestGeneratedAt: manifest.generatedAt ?? null,
    candidateCount: candidates.length,
    highestSeverity: getHighestSeverity(candidates),
    primaryCandidate,
    candidates,
  };
}

function createCandidate(candidate) {
  return {
    ...candidate,
    recommendedArtifacts: dedupeStrings(candidate.recommendedArtifacts ?? []),
    nextStep: candidate.nextStep ?? "",
  };
}

function selectPrimaryCandidate(candidates) {
  if (candidates.length === 0) {
    return null;
  }

  const severityRank = {
    high: 3,
    medium: 2,
    low: 1,
  };

  let primaryCandidate = candidates[0];
  let highestRank = severityRank[primaryCandidate.severity] ?? 0;

  for (const candidate of candidates.slice(1)) {
    const rank = severityRank[candidate.severity] ?? 0;
    if (rank > highestRank) {
      primaryCandidate = candidate;
      highestRank = rank;
    }
  }

  return {
    id: primaryCandidate.id,
    severity: primaryCandidate.severity,
    title: primaryCandidate.title,
    recommendedArtifacts: primaryCandidate.recommendedArtifacts,
    nextStep: primaryCandidate.nextStep,
  };
}

function getHighestSeverity(candidates) {
  const severityRank = {
    high: 3,
    medium: 2,
    low: 1,
  };

  let highestSeverity = "none";
  let highestRank = 0;

  for (const candidate of candidates) {
    const rank = severityRank[candidate.severity] ?? 0;
    if (rank > highestRank) {
      highestRank = rank;
      highestSeverity = candidate.severity;
    }
  }

  return highestSeverity;
}

function buildSummaryMarkdown(diagnosis) {
  const lines = ["## Cloud Smoke Verdict", ""];
  lines.push(`- Highest severity: \`${diagnosis.highestSeverity}\``);
  lines.push(`- Candidate count: ${diagnosis.candidateCount}`);

  if (diagnosis.primaryCandidate) {
    lines.push(
      `- Primary candidate: \`${diagnosis.primaryCandidate.severity}\` ${diagnosis.primaryCandidate.title}`,
    );
    if (diagnosis.primaryCandidate.recommendedArtifacts.length > 0) {
      lines.push(
        `  - Start with: ${formatArtifactList(
          diagnosis.primaryCandidate.recommendedArtifacts,
        )}`,
      );
    }
    if (diagnosis.primaryCandidate.nextStep) {
      lines.push(`  - Next step: ${diagnosis.primaryCandidate.nextStep}`);
    }
  }

  if (diagnosis.candidates.length === 0) {
    lines.push("- No diagnosis candidates were inferred from the manifest.");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("");
  lines.push("## Cloud Smoke Diagnosis");
  lines.push("");

  for (const candidate of diagnosis.candidates) {
    lines.push(`- \`${candidate.severity}\` ${candidate.title}`);
    lines.push(`  - ${candidate.summary}`);
    for (const evidence of candidate.evidence) {
      lines.push(`  - ${evidence}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

async function appendGitHubOutput(outputPath, diagnosis) {
  const entries = [
    ["candidate_count", String(diagnosis.candidateCount)],
    ["highest_severity", diagnosis.highestSeverity],
    ["diagnosis_path", diagnosisPath],
    ["manifest_path", manifestPath],
    ["diagnosis_generated_at", diagnosis.generatedAt],
    ["manifest_generated_at", diagnosis.manifestGeneratedAt ?? ""],
    ["primary_candidate_id", diagnosis.primaryCandidate?.id ?? ""],
    ["primary_candidate_severity", diagnosis.primaryCandidate?.severity ?? ""],
    ["primary_candidate_title", diagnosis.primaryCandidate?.title ?? ""],
    [
      "primary_candidate_recommended_artifacts",
      (diagnosis.primaryCandidate?.recommendedArtifacts ?? []).join(","),
    ],
    ["primary_candidate_next_step", diagnosis.primaryCandidate?.nextStep ?? ""],
  ];

  const chunks = entries.map(([key, value], index) =>
    formatGitHubOutputEntry(key, value, `YINJIE_CLOUD_SMOKE_OUTPUT_${index}`),
  );
  await writeFile(outputPath, chunks.join(""), {
    encoding: "utf8",
    flag: "a",
  });
}

function formatGitHubOutputEntry(key, value, delimiter) {
  return `${key}<<${delimiter}\n${value}\n${delimiter}\n`;
}

function formatArtifactList(artifactNames) {
  return artifactNames.map((artifactName) => `\`${artifactName}\``).join(", ");
}

function dedupeStrings(values) {
  return Array.from(new Set(values));
}

async function appendSummaryMarkdown(summaryPath, markdown) {
  let separator = "";
  try {
    const existingSummary = await readFile(summaryPath, "utf8");
    if (existingSummary.length > 0) {
      separator = existingSummary.endsWith("\n") ? "\n" : "\n\n";
    }
  } catch {}

  await writeFile(summaryPath, `${separator}${markdown}`, {
    encoding: "utf8",
    flag: "a",
  });
}

function resolvePath(pathValue, fallback) {
  return resolve(pathValue ?? fallback);
}
