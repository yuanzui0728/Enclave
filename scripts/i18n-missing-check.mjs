import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const SURFACES = ["shared", "app", "admin", "cloud-console"];
const LOCALES = ["zh-CN", "en-US", "ja-JP", "ko-KR"];
const SOURCE_LOCALE = "zh-CN";
const CATALOG_ROOT = "packages/i18n/catalogs";

function printHelp() {
  console.log(`Usage: node ./scripts/i18n-missing-check.mjs [options]

Options:
  --surface <name>         Check a surface. Can be repeated. Defaults to all.
  --locale <locale>        Check a locale. Can be repeated. Defaults to non-source locales.
  --changed                Check added empty translations in changes since I18N_AUDIT_BASE or HEAD.
  --staged                 Check added empty translations in staged catalog changes.
  --base <ref>             Check changed catalog entries since the given git ref.
  --json                   Print machine-readable JSON.
  --github-annotations     Emit GitHub Actions annotations.
  --no-github-annotations  Disable GitHub Actions annotations.
  --help                   Show this help text.
`);
}

function parseArgs(argv) {
  const options = {
    baseRef: process.env.I18N_AUDIT_BASE ?? "HEAD",
    githubAnnotations: process.env.GITHUB_ACTIONS === "true",
    json: false,
    locales: [],
    scope: "full",
    surfaces: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--surface") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--surface requires a value.");
      }
      options.surfaces.push(...splitList(value));
      index += 1;
      continue;
    }

    if (arg.startsWith("--surface=")) {
      options.surfaces.push(...splitList(arg.slice("--surface=".length)));
      continue;
    }

    if (arg === "--locale") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--locale requires a value.");
      }
      options.locales.push(...splitList(value));
      index += 1;
      continue;
    }

    if (arg.startsWith("--locale=")) {
      options.locales.push(...splitList(arg.slice("--locale=".length)));
      continue;
    }

    if (arg === "--changed") {
      options.scope = "changed";
      continue;
    }

    if (arg === "--staged") {
      options.scope = "staged";
      continue;
    }

    if (arg === "--base") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--base requires a git ref.");
      }
      options.baseRef = value;
      options.scope = "changed";
      index += 1;
      continue;
    }

    if (arg.startsWith("--base=")) {
      options.baseRef = arg.slice("--base=".length);
      options.scope = "changed";
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--github-annotations") {
      options.githubAnnotations = true;
      continue;
    }

    if (arg === "--no-github-annotations") {
      options.githubAnnotations = false;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    ...options,
    locales:
      options.locales.length > 0
        ? assertKnownValues(options.locales, LOCALES, "locale")
        : LOCALES.filter((locale) => locale !== SOURCE_LOCALE),
    surfaces:
      options.surfaces.length > 0
        ? assertKnownValues(options.surfaces, SURFACES, "surface")
        : SURFACES,
  };
}

function splitList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertKnownValues(values, allowedValues, label) {
  for (const value of values) {
    if (!allowedValues.includes(value)) {
      throw new Error(
        `Unknown ${label}: ${value}. Allowed values: ${allowedValues.join(", ")}`,
      );
    }
  }

  return [...new Set(values)];
}

function normalizeBaseRef(baseRef) {
  return /^0{40}$/.test(baseRef) ? "HEAD" : baseRef;
}

function getCatalogPath(surface, locale) {
  return `${CATALOG_ROOT}/${surface}/${locale}.po`;
}

function getCatalogFiles(options) {
  const files = [];
  for (const surface of options.surfaces) {
    for (const locale of options.locales) {
      if (locale === SOURCE_LOCALE) {
        continue;
      }
      const filePath = getCatalogPath(surface, locale);
      if (existsSync(filePath)) {
        files.push({ filePath, locale, surface });
      }
    }
  }
  return files;
}

function parsePoString(line) {
  const match = line.match(/"(?:\\.|[^"])*"/);
  if (!match) {
    return "";
  }

  return JSON.parse(match[0]);
}

function parsePoEntries(filePath) {
  const text = readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const entries = [];
  let entry = createEntry();
  let activeField = null;

  function finalize() {
    if (
      entry.msgidLine !== null ||
      entry.msgstrLine !== null ||
      entry.references.length > 0
    ) {
      entries.push(entry);
    }
    entry = createEntry();
    activeField = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      finalize();
      continue;
    }

    if (trimmed.startsWith("#:")) {
      entry.references.push(trimmed.slice(2).trim());
      continue;
    }

    if (trimmed.startsWith("#~")) {
      continue;
    }

    if (trimmed.startsWith("msgid ")) {
      entry.msgid += parsePoString(trimmed);
      entry.msgidLine = index + 1;
      activeField = "msgid";
      continue;
    }

    const pluralMatch = trimmed.match(/^msgstr\[(\d+)]\s+/);
    if (pluralMatch) {
      const key = `msgstr[${pluralMatch[1]}]`;
      entry.msgstrs[key] = (entry.msgstrs[key] ?? "") + parsePoString(trimmed);
      entry.msgstrLine = entry.msgstrLine ?? index + 1;
      activeField = key;
      continue;
    }

    if (trimmed.startsWith("msgstr ")) {
      entry.msgstrs.msgstr =
        (entry.msgstrs.msgstr ?? "") + parsePoString(trimmed);
      entry.msgstrLine = entry.msgstrLine ?? index + 1;
      activeField = "msgstr";
      continue;
    }

    if (trimmed.startsWith('"') && activeField) {
      if (activeField === "msgid") {
        entry.msgid += parsePoString(trimmed);
      } else {
        entry.msgstrs[activeField] =
          (entry.msgstrs[activeField] ?? "") + parsePoString(trimmed);
      }
    }
  }

  finalize();
  return entries;
}

function createEntry() {
  return {
    msgid: "",
    msgidLine: null,
    msgstrLine: null,
    msgstrs: {},
    references: [],
  };
}

function isHeaderEntry(entry) {
  return entry.msgid === "" && Object.values(entry.msgstrs).some((value) =>
    value.includes("Language:"),
  );
}

function collectFullMissingIssues(options) {
  const issues = [];
  for (const { filePath, locale, surface } of getCatalogFiles(options)) {
    const entries = parsePoEntries(filePath);
    for (const entry of entries) {
      if (isHeaderEntry(entry)) {
        continue;
      }

      const msgstrValues = Object.values(entry.msgstrs);
      const hasMissingValue =
        msgstrValues.length === 0 ||
        msgstrValues.some((value) => value.trim() === "");

      if (!hasMissingValue) {
        continue;
      }

      issues.push({
        file: filePath,
        line: entry.msgstrLine ?? entry.msgidLine ?? 1,
        locale,
        msgid: entry.msgid,
        references: entry.references,
        scope: "full",
        surface,
      });
    }
  }
  return issues;
}

function readChangedCatalogDiff(options) {
  const baseRef = normalizeBaseRef(options.baseRef);
  const args =
    options.scope === "staged"
      ? ["diff", "--cached", "--unified=0", "--", CATALOG_ROOT]
      : ["diff", "--unified=0", baseRef, "--", CATALOG_ROOT];

  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
    });
  } catch (error) {
    if (error instanceof Error && "stdout" in error) {
      return String(error.stdout ?? "");
    }
    throw error;
  }
}

function parseCatalogPath(filePath) {
  const match = filePath.match(
    /^packages\/i18n\/catalogs\/([^/]+)\/([^/]+)\.po$/,
  );
  if (!match) {
    return null;
  }
  return { locale: match[2], surface: match[1] };
}

function collectChangedMissingIssues(options) {
  const issues = [];
  const diffText = readChangedCatalogDiff(options);
  const lines = diffText.split("\n");
  let currentFile = null;
  let currentLineNumber = 0;
  let currentCatalog = null;

  for (const line of lines) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice("+++ b/".length);
      currentCatalog = parseCatalogPath(currentFile);
      currentLineNumber = 0;
      continue;
    }

    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLineNumber = Number(hunkMatch[1]);
      continue;
    }

    if (!currentFile || !currentCatalog) {
      continue;
    }

    const { locale, surface } = currentCatalog;
    const shouldCheck =
      locale !== SOURCE_LOCALE &&
      options.locales.includes(locale) &&
      options.surfaces.includes(surface);

    if (!shouldCheck) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      const addedLine = line.slice(1).trim();
      if (
        currentLineNumber > 2 &&
        /^msgstr(?:\[\d+])?\s+""$/.test(addedLine)
      ) {
        issues.push({
          file: currentFile,
          line: currentLineNumber,
          locale,
          msgid: null,
          references: [],
          scope: options.scope,
          surface,
        });
      }
      currentLineNumber += 1;
      continue;
    }

    if (line.startsWith(" ")) {
      currentLineNumber += 1;
    }
  }

  return issues;
}

function summarizeIssues(issues) {
  const summary = {};
  for (const issue of issues) {
    const surfaceSummary =
      summary[issue.surface] ??
      (summary[issue.surface] = {
        locales: {},
        total: 0,
      });
    const localeSummary =
      surfaceSummary.locales[issue.locale] ??
      (surfaceSummary.locales[issue.locale] = 0);
    surfaceSummary.locales[issue.locale] = localeSummary + 1;
    surfaceSummary.total += 1;
  }
  return summary;
}

function escapeGithubAnnotationValue(value) {
  return value
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

function escapeGithubAnnotationData(value) {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function emitGithubAnnotation(issue) {
  const properties = [
    `file=${escapeGithubAnnotationValue(issue.file)}`,
    `line=${issue.line}`,
    "title=i18n missing translation",
  ].join(",");
  const message = escapeGithubAnnotationData(
    issue.msgid
      ? `Missing ${issue.locale} translation for: ${issue.msgid}`
      : `New empty ${issue.locale} translation.`,
  );
  console.error(`::error ${properties}::${message}`);
}

function printHumanSummary(issues, summary, options) {
  const label =
    options.scope === "full"
      ? "catalogs"
      : options.scope === "staged"
        ? "staged catalog changes"
        : `catalog changes since ${normalizeBaseRef(options.baseRef)}`;

  if (issues.length === 0) {
    console.log(`i18n missing check passed for ${label}.`);
    return;
  }

  console.error(
    `i18n missing check found ${issues.length} issue(s) in ${label}:`,
  );
  for (const [surface, surfaceSummary] of Object.entries(summary)) {
    const localeText = Object.entries(surfaceSummary.locales)
      .map(([locale, count]) => `${locale}: ${count}`)
      .join(", ");
    console.error(`- ${surface}: ${surfaceSummary.total} (${localeText})`);
  }

  for (const issue of issues.slice(0, 40)) {
    console.error(
      `  ${issue.file}:${issue.line} missing ${issue.locale}${
        issue.msgid ? `: ${issue.msgid}` : ""
      }`,
    );
  }
  if (issues.length > 40) {
    console.error(`  ...and ${issues.length - 40} more.`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const issues =
    options.scope === "full"
      ? collectFullMissingIssues(options)
      : collectChangedMissingIssues(options);
  const summary = summarizeIssues(issues);

  if (options.json) {
    console.log(JSON.stringify({ issues, summary }, null, 2));
  } else {
    printHumanSummary(issues, summary, options);
  }

  if (options.githubAnnotations) {
    for (const issue of issues) {
      emitGithubAnnotation(issue);
    }
  }

  if (issues.length > 0) {
    process.exitCode = 1;
  }
}

main();
