import { execFileSync } from "node:child_process";

const TARGETS = [
  "apps/app/src/**/*.ts",
  "apps/app/src/**/*.tsx",
  "apps/admin/src/**/*.ts",
  "apps/admin/src/**/*.tsx",
  "apps/cloud-console/src/**/*.ts",
  "apps/cloud-console/src/**/*.tsx",
  "packages/ui/src/**/*.ts",
  "packages/ui/src/**/*.tsx",
  "api/src/**/*.ts",
  "apps/cloud-api/src/**/*.ts",
];

const FILE_IGNORE_PATTERNS = [/\/packages\/i18n\//];

const RULES = [
  {
    name: "jsx-literal-prop",
    message:
      "Detected a literal UI prop. Prefer <Trans>, msg(...) or a translated prop value.",
    pattern:
      /\b(?:title|label|description|placeholder|aria-label|message|subtitle|helperText)\s*=\s*["'`]/,
  },
  {
    name: "intl-locale-literal",
    message:
      "Detected a hard-coded Intl locale. Route date/number/collation formatting through shared i18n helpers.",
    pattern: /new\s+Intl\.(?:DateTimeFormat|NumberFormat|Collator)\(\s*["'`]/,
  },
  {
    name: "locale-compare-literal",
    message:
      "Detected localeCompare with a literal locale. Use a shared collator helper instead.",
    pattern: /\.localeCompare\([^,\n]+,\s*["'`]/,
  },
  {
    name: "speech-lang-literal",
    message:
      "Detected a hard-coded speech recognition language. Resolve it from locale runtime state instead.",
    pattern: /\brecognition\.lang\s*=\s*["'`]/,
  },
  {
    name: "literal-error-message",
    message:
      "Detected a literal thrown message. Prefer error codes plus translated client copy for user-facing failures.",
    pattern:
      /throw\s+new\s+(?:\w+Exception|Error)\(\s*["'`](?![A-Z0-9_.-]+["'`]\s*[),])/,
  },
];

const ALLOWLIST_PATTERNS = [/<Trans\b/, /\bt`/, /\bmsg`/, /\bdefineMessage\(/];

function printHelp() {
  console.log(`Usage: node ./scripts/i18n-audit.mjs [options]

Options:
  --staged                 Audit staged changes only.
  --changed                Audit changes since I18N_AUDIT_BASE or HEAD.
  --base <ref>             Audit changes since the given git ref.
  --github-annotations     Emit GitHub Actions error annotations.
  --no-github-annotations  Disable GitHub Actions error annotations.
  --help                   Show this help text.
`);
}

function parseArgs(argv) {
  const options = {
    baseRef: process.env.I18N_AUDIT_BASE ?? "HEAD",
    githubAnnotations: process.env.GITHUB_ACTIONS === "true",
    scope: process.env.I18N_AUDIT_SCOPE ?? "working-tree",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--staged") {
      options.scope = "staged";
      continue;
    }

    if (arg === "--changed") {
      options.scope = "changed";
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

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function normalizeBaseRef(baseRef) {
  return /^0{40}$/.test(baseRef) ? "HEAD" : baseRef;
}

function readDiff(args) {
  try {
    return execFileSync(
      "git",
      ["diff", "--unified=0", ...args, "--", ...TARGETS],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
  } catch (error) {
    if (error instanceof Error && "stdout" in error) {
      return String(error.stdout ?? "");
    }

    throw error;
  }
}

function resolveAuditTarget() {
  const options = parseArgs(process.argv.slice(2));
  const baseRef = normalizeBaseRef(options.baseRef);

  if (options.scope === "staged") {
    return {
      args: ["--cached"],
      githubAnnotations: options.githubAnnotations,
      label: "staged changes",
    };
  }

  return {
    args: [baseRef],
    githubAnnotations: options.githubAnnotations,
    label: options.scope === "changed" ? `changes since ${baseRef}` : baseRef,
  };
}

function shouldIgnoreFile(filePath) {
  return FILE_IGNORE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function isAllowedLine(line) {
  return ALLOWLIST_PATTERNS.some((pattern) => pattern.test(line));
}

function collectIssues(diffText) {
  const issues = [];
  const lines = diffText.split("\n");
  let currentFile = null;
  let currentLineNumber = 0;

  for (const line of lines) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice("+++ b/".length);
      currentLineNumber = 0;
      continue;
    }

    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLineNumber = Number(hunkMatch[1]);
      continue;
    }

    if (!currentFile || shouldIgnoreFile(currentFile)) {
      continue;
    }

    if (!line.startsWith("+") || line.startsWith("+++")) {
      if (line.startsWith(" ")) {
        currentLineNumber += 1;
      }
      continue;
    }

    const addedLine = line.slice(1);
    if (!addedLine.trim() || isAllowedLine(addedLine)) {
      currentLineNumber += 1;
      continue;
    }

    for (const rule of RULES) {
      if (!rule.pattern.test(addedLine)) {
        continue;
      }

      issues.push({
        file: currentFile,
        line: currentLineNumber,
        message: rule.message,
        source: addedLine.trim(),
      });
    }

    currentLineNumber += 1;
  }

  return issues;
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
    "title=i18n audit",
  ].join(",");
  const message = escapeGithubAnnotationData(
    `${issue.message} ${issue.source}`,
  );
  console.error(`::error ${properties}::${message}`);
}

function main() {
  const auditTarget = resolveAuditTarget();
  const diffText = readDiff(auditTarget.args);
  const issues = collectIssues(diffText);

  if (issues.length === 0) {
    console.log(`i18n audit passed against ${auditTarget.label}`);
    return;
  }

  console.error(
    `i18n audit found ${issues.length} issue(s) against ${auditTarget.label}:`,
  );
  for (const issue of issues) {
    console.error(`- ${issue.file}:${issue.line} ${issue.message}`);
    console.error(`  ${issue.source}`);
    if (auditTarget.githubAnnotations) {
      emitGithubAnnotation(issue);
    }
  }

  process.exitCode = 1;
}

main();
