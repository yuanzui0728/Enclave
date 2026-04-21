import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = resolvePath(
  process.env.YINJIE_CLOUD_SMOKE_ARTIFACT_ROOT,
  resolve(repoRoot, ".artifacts", "cloud-smoke"),
);
const playwrightSourceDir = resolvePath(
  process.env.YINJIE_CLOUD_SMOKE_PLAYWRIGHT_SOURCE_DIR,
  resolve(repoRoot, "apps", "cloud-console", "node_modules", ".playwright-artifacts"),
);
const browserHarnessParentDir = resolvePath(
  process.env.YINJIE_CLOUD_SMOKE_BROWSER_HARNESS_PARENT_DIR,
  tmpdir(),
);
const browserHarnessPrefix =
  process.env.YINJIE_CLOUD_SMOKE_BROWSER_HARNESS_PREFIX ??
  "yinjie-cloud-console-browser-";
const manifestFileName = "manifest.json";
const playwrightUploadName = "cloud-smoke-playwright-artifacts";
const browserHarnessUploadName = "cloud-smoke-browser-harness";
const manifestUploadName = "cloud-smoke-manifest";

await rm(artifactRoot, { recursive: true, force: true });

const playwrightSummary = await collectPlaywrightArtifacts();
const browserHarnessSummary = await collectBrowserHarnessArtifacts();
const manifest = buildManifest(playwrightSummary, browserHarnessSummary);
await writeManifest(manifest);

const summaryMarkdown = buildSummaryMarkdown(playwrightSummary, browserHarnessSummary);

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendSummaryMarkdown(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown);
}

async function collectPlaywrightArtifacts() {
  const outputDir = join(artifactRoot, "playwright");
  const sourceExists = await pathExists(playwrightSourceDir);
  if (!sourceExists) {
    return {
      collected: false,
      outputDir,
      fileCount: 0,
      tracePaths: [],
      errorContextPaths: [],
    };
  }

  await mkdir(outputDir, { recursive: true });
  await cp(playwrightSourceDir, outputDir, { recursive: true, force: true });

  const filePaths = await listRelativeFiles(outputDir);
  const tracePaths = filePaths.filter((filePath) => basename(filePath) === "trace.zip");
  const errorContextPaths = filePaths.filter(
    (filePath) => basename(filePath) === "error-context.md",
  );

  return {
    collected: true,
    outputDir,
    fileCount: filePaths.length,
    tracePaths,
    errorContextPaths,
  };
}

async function collectBrowserHarnessArtifacts() {
  const outputDir = join(artifactRoot, "browser-harness");
  const sourceDirs = await listBrowserHarnessDirs();
  if (sourceDirs.length === 0) {
    return {
      collected: false,
      outputDir,
      directories: [],
    };
  }

  await mkdir(outputDir, { recursive: true });

  const directories = [];
  for (const sourceDir of sourceDirs) {
    const directoryName = basename(sourceDir);
    const destinationDir = join(outputDir, directoryName);
    await cp(sourceDir, destinationDir, { recursive: true, force: true });
    directories.push(await inspectHarnessDirectory(sourceDir));
  }

  return {
    collected: true,
    outputDir,
    directories,
  };
}

async function listBrowserHarnessDirs() {
  const parentExists = await pathExists(browserHarnessParentDir);
  if (!parentExists) {
    return [];
  }

  const entries = await readdir(browserHarnessParentDir, { withFileTypes: true });
  return entries
    .filter(
      (entry) => entry.isDirectory() && entry.name.startsWith(browserHarnessPrefix),
    )
    .map((entry) => join(browserHarnessParentDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function inspectHarnessDirectory(directoryPath) {
  const directoryName = basename(directoryPath);
  const requiredFiles = [
    "cloud-api.harness.json",
    "cloud-console.harness.json",
    "cloud-api.stdout.log",
    "cloud-api.stderr.log",
    "cloud-console.stdout.log",
    "cloud-console.stderr.log",
  ];

  const requiredFileStates = [];
  for (const fileName of requiredFiles) {
    requiredFileStates.push({
      fileName,
      present: await pathExists(join(directoryPath, fileName)),
    });
  }

  const cloudApiSummary = await readHarnessJsonSummary(
    join(directoryPath, "cloud-api.harness.json"),
    summarizeCloudApiHarness,
  );
  const cloudConsoleSummary = await readHarnessJsonSummary(
    join(directoryPath, "cloud-console.harness.json"),
    summarizeCloudConsoleHarness,
  );

  const sqliteFiles = (await readdir(directoryPath, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sqlite"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return {
    directoryName,
    requiredFileStates,
    cloudApiSummary,
    cloudConsoleSummary,
    sqliteFiles,
  };
}

async function readHarnessJsonSummary(filePath, summarize) {
  if (!(await pathExists(filePath))) {
    return null;
  }

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return summarize(parsed);
  } catch (error) {
    return {
      kind: "invalid",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeCloudApiHarness(data) {
  return {
    kind: "valid",
    parts: [
      maybeFormat("baseUrl", data.baseUrl),
      maybeFormat("port", data.port),
      maybeFormat("database", data.databasePath ? basename(data.databasePath) : null),
      maybeFormat("authTokenTtl", data.authTokenTtl),
    ].filter(Boolean),
  };
}

function summarizeCloudConsoleHarness(data) {
  return {
    kind: "valid",
    parts: [
      maybeFormat("baseUrl", data.baseUrl),
      maybeFormat("cloudApiBaseUrl", data.cloudApiBaseUrl),
      maybeFormat("port", data.port),
      maybeFormat("pid", data.pid),
    ].filter(Boolean),
  };
}

function maybeFormat(label, value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return `${label}=${value}`;
}

function buildSummaryMarkdown(playwrightSummary, browserHarnessSummary) {
  const lines = ["## Cloud Smoke Failure Artifacts", ""];

  lines.push(`- Playwright upload: \`${playwrightUploadName}\``);
  if (playwrightSummary.collected) {
    lines.push(`  - collected files: ${playwrightSummary.fileCount}`);
    lines.push(`  - trace archives: ${playwrightSummary.tracePaths.length}`);
    lines.push(
      `  - error context files: ${playwrightSummary.errorContextPaths.length}`,
    );
    if (playwrightSummary.tracePaths.length > 0) {
      lines.push("  - trace paths:");
      for (const tracePath of playwrightSummary.tracePaths) {
        lines.push(`    - \`${tracePath}\``);
      }
    }
    if (playwrightSummary.errorContextPaths.length > 0) {
      lines.push("  - error context paths:");
      for (const errorContextPath of playwrightSummary.errorContextPaths) {
        lines.push(`    - \`${errorContextPath}\``);
      }
    }
  } else {
    lines.push("  - no Playwright artifacts were collected");
  }

  lines.push(`- Browser harness upload: \`${browserHarnessUploadName}\``);
  if (browserHarnessSummary.collected) {
    lines.push(
      `  - preserved temp dirs: ${browserHarnessSummary.directories.length}`,
    );
    for (const directory of browserHarnessSummary.directories) {
      lines.push(`  - \`${directory.directoryName}\``);
      for (const fileState of directory.requiredFileStates) {
        lines.push(
          `    - \`${fileState.fileName}\`: ${
            fileState.present ? "present" : "missing"
          }`,
        );
      }
      if (directory.cloudApiSummary) {
        lines.push(
          `    - cloud-api summary: ${formatHarnessSummary(directory.cloudApiSummary)}`,
        );
      }
      if (directory.cloudConsoleSummary) {
        lines.push(
          `    - cloud-console summary: ${formatHarnessSummary(
            directory.cloudConsoleSummary,
          )}`,
        );
      }
      lines.push(`    - sqlite files: ${directory.sqliteFiles.length}`);
      if (directory.sqliteFiles.length > 0) {
        lines.push("    - sqlite paths:");
        for (const sqliteFile of directory.sqliteFiles) {
          lines.push(`      - \`${sqliteFile}\``);
        }
      }
    }
  } else {
    lines.push("  - no preserved browser harness temp dirs were collected");
  }

  lines.push(`- Manifest upload: \`${manifestUploadName}\``);
  lines.push(`  - path: \`${manifestFileName}\``);

  lines.push("");
  return lines.join("\n");
}

function buildManifest(playwrightSummary, browserHarnessSummary) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    artifactRoot,
    sources: {
      playwrightSourceDir,
      browserHarnessParentDir,
      browserHarnessPrefix,
    },
    uploads: {
      playwright: {
        name: playwrightUploadName,
        path: "playwright",
        collected: playwrightSummary.collected,
        fileCount: playwrightSummary.fileCount,
        tracePaths: playwrightSummary.tracePaths,
        errorContextPaths: playwrightSummary.errorContextPaths,
      },
      browserHarness: {
        name: browserHarnessUploadName,
        path: "browser-harness",
        collected: browserHarnessSummary.collected,
        directories: browserHarnessSummary.directories.map((directory) => ({
          directoryName: directory.directoryName,
          requiredFiles: Object.fromEntries(
            directory.requiredFileStates.map((fileState) => [
              fileState.fileName,
              fileState.present,
            ]),
          ),
          cloudApiSummary: directory.cloudApiSummary,
          cloudConsoleSummary: directory.cloudConsoleSummary,
          sqliteFiles: directory.sqliteFiles,
        })),
      },
      manifest: {
        name: manifestUploadName,
        path: manifestFileName,
      },
    },
  };
}

async function writeManifest(manifest) {
  await mkdir(artifactRoot, { recursive: true });
  await writeFile(join(artifactRoot, manifestFileName), JSON.stringify(manifest, null, 2), {
    encoding: "utf8",
  });
}

async function appendSummaryMarkdown(summaryPath, markdown) {
  let separator = "";

  if (await pathExists(summaryPath)) {
    const existingSummary = await readFile(summaryPath, "utf8");
    if (existingSummary.length > 0) {
      separator = existingSummary.endsWith("\n") ? "\n" : "\n\n";
    }
  }

  await writeFile(summaryPath, `${separator}${markdown}`, {
    encoding: "utf8",
    flag: "a",
  });
}

function formatHarnessSummary(summary) {
  if (summary.kind === "invalid") {
    return `invalid JSON: ${summary.message}`;
  }

  return summary.parts.join(", ");
}

async function listRelativeFiles(rootDir) {
  const results = [];
  await walkFiles(rootDir, "", results);
  return results.sort((left, right) => left.localeCompare(right));
}

async function walkFiles(rootDir, relativeDir, results) {
  const targetDir = relativeDir ? join(rootDir, relativeDir) : rootDir;
  const entries = await readdir(targetDir, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = relativeDir ? join(relativeDir, entry.name) : entry.name;
    if (entry.isDirectory()) {
      await walkFiles(rootDir, relativePath, results);
      continue;
    }
    if (entry.isFile()) {
      results.push(relativePath);
    }
  }
}

function resolvePath(pathValue, fallback) {
  return resolve(pathValue ?? fallback);
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}
