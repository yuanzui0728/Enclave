import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_SCOPES = [
  "apps/app/src",
  "apps/admin/src",
  "apps/cloud-console/src",
  "packages/ui/src",
  "api/src",
  "apps/cloud-api/src",
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

const FILE_IGNORE_PATTERNS = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)\.turbo\//,
  /(^|\/)packages\/i18n\/catalogs\//,
];

const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const I18N_LINE_PATTERNS = [
  /<Trans\b/,
  /<\/Trans>/,
  /\bmsg`/,
  /\bt`/,
  /\bdefineMessage\(/,
  /\bi18n\._\(/,
  /\bTrans\s*}/,
];

const UI_PROP_NAMES = [
  "title",
  "label",
  "name",
  "description",
  "placeholder",
  "aria-label",
  "ariaLabel",
  "message",
  "subtitle",
  "helperText",
  "emptyText",
  "emptyLabel",
  "confirmText",
  "cancelText",
  "okText",
  "submitText",
  "searchPlaceholder",
  "hint",
  "summary",
  "cta",
  "statusLabel",
].join("|");

const RULES = [
  {
    name: "jsx-literal-prop",
    message:
      "Literal UI prop. Use <Trans>, msg, or a translated runtime value.",
    test: (line) =>
      new RegExp(
        `\\b(?:${UI_PROP_NAMES})\\s*=\\s*(?:"[^"]*"|'[^']*'|\`[^\`]*\`)`,
      ).test(line),
  },
  {
    name: "object-ui-string",
    message:
      "Literal UI field in an object or config array. Store a message descriptor instead.",
    test: (line) =>
      new RegExp(
        `\\b(?:${UI_PROP_NAMES})\\s*:\\s*(?:"[^"]*"|'[^']*'|\`[^\`]*\`)`,
      ).test(line),
  },
  {
    name: "jsx-cjk-text",
    message: "CJK text node outside a known i18n wrapper.",
    test: (line) => />[^<>{}]*[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff][^<>{}]*</.test(line),
  },
  {
    name: "toast-dialog-string",
    message:
      "Literal toast/dialog copy. Use a message descriptor and translate before display.",
    test: (line) =>
      /\b(?:toast\.(?:success|error|warning|info|message)|alert|confirm|prompt)\(\s*["'`]/.test(
        line,
      ),
  },
  {
    name: "setter-message-string",
    message:
      "Literal setter message. Store a message descriptor or translate at the call site.",
    test: (line) =>
      /\bset(?:Error|Message|StatusMessage|Toast|Notice)\(\s*["'`]/.test(
        line,
      ),
  },
  {
    name: "literal-error-message",
    message:
      "Literal thrown message. Prefer error codes plus translated client copy for user-facing failures.",
    test: (line) =>
      /throw\s+new\s+(?:\w+Exception|Error)\(\s*["'`](?![A-Z0-9_.-]+["'`]\s*[),])/.test(
        line,
      ),
  },
  {
    name: "intl-locale-literal",
    message:
      "Hard-coded Intl locale. Route formatting through shared i18n helpers.",
    test: (line) =>
      /new\s+Intl\.(?:DateTimeFormat|NumberFormat|Collator|RelativeTimeFormat|ListFormat)\(\s*["'`]/.test(
        line,
      ),
  },
  {
    name: "locale-compare-literal",
    message: "Hard-coded localeCompare locale. Use a shared collator helper.",
    test: (line) => /\.localeCompare\([^,\n]+,\s*["'`]/.test(line),
  },
  {
    name: "speech-lang-literal",
    message:
      "Hard-coded speech language. Resolve it from locale/content-locale runtime state.",
    test: (line) => /\brecognition\.lang\s*=\s*["'`]/.test(line),
  },
  {
    name: "prompt-locale-instruction",
    message:
      "Prompt appears to hard-code an output language. Inject contentLocale instead.",
    test: (line) =>
      /\b(?:prompt|Prompt|systemPrompt|instruction|instructions|template)\b/.test(
        line,
      ) &&
      /(?:中文|英文|日文|韩文|English|Japanese|Korean|用.*回复|回复.*语言)/.test(
        line,
      ),
  },
  {
    name: "raw-cjk-line",
    message:
      "Raw CJK line outside known i18n wrappers. Classify it as UI copy, data, prompt, or allowlisted non-user text.",
    test: (line) => CJK_PATTERN.test(line),
  },
];

function printHelp() {
  console.log(`Usage: node ./scripts/i18n-hardcode-scan.mjs [options]

Options:
  --all                    Scan all default source scopes. This is the default.
  --scope <path>           Scan a specific path. Can be repeated.
  --baseline <file>        Compare results with a baseline JSON file.
  --ratchet                Fail when any rule count exceeds the baseline.
  --json                   Print machine-readable JSON.
  --include-issues         Include individual issues in JSON output.
  --top <count>            Number of top files to print. Default: 12.
  --help                   Show this help text.

Ignore comments:
  // i18n-ignore-line: reason
  // i18n-ignore-next-line: reason
`);
}

function parseArgs(argv) {
  const options = {
    baselinePath: null,
    includeIssues: false,
    json: false,
    ratchet: false,
    scopes: [],
    topCount: 12,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--all") {
      options.scopes = [];
      continue;
    }

    if (arg === "--scope") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--scope requires a path.");
      }
      options.scopes.push(normalizePath(value));
      index += 1;
      continue;
    }

    if (arg.startsWith("--scope=")) {
      options.scopes.push(normalizePath(arg.slice("--scope=".length)));
      continue;
    }

    if (arg === "--baseline") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--baseline requires a file path.");
      }
      options.baselinePath = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--baseline=")) {
      options.baselinePath = arg.slice("--baseline=".length);
      continue;
    }

    if (arg === "--ratchet") {
      options.ratchet = true;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--include-issues") {
      options.includeIssues = true;
      continue;
    }

    if (arg === "--top") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 0) {
        throw new Error("--top requires a non-negative integer.");
      }
      options.topCount = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--top=")) {
      const value = Number(arg.slice("--top=".length));
      if (!Number.isInteger(value) || value < 0) {
        throw new Error("--top requires a non-negative integer.");
      }
      options.topCount = value;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.ratchet && !options.baselinePath) {
    options.baselinePath = "scripts/i18n-hardcode-baseline.json";
  }

  return {
    ...options,
    scopes: options.scopes.length > 0 ? options.scopes : DEFAULT_SCOPES,
  };
}

function normalizePath(value) {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function shouldIgnoreFile(filePath) {
  const normalized = normalizePath(filePath);
  const extension = path.extname(normalized);
  return (
    !SOURCE_EXTENSIONS.has(extension) ||
    FILE_IGNORE_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

function listCandidateFiles(scopes) {
  const output = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...scopes,
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  return output
    .split("\n")
    .map(normalizePath)
    .filter(Boolean)
    .filter((filePath) => !shouldIgnoreFile(filePath))
    .sort((a, b) => a.localeCompare(b));
}

function resolveScope(filePath, scopes) {
  const normalized = normalizePath(filePath);
  return (
    scopes
      .filter(
        (scope) => normalized === scope || normalized.startsWith(`${scope}/`),
      )
      .sort((a, b) => b.length - a.length)[0] ?? "other"
  );
}

function isCommentOnly(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("*/")
  );
}

function isKnownI18nLine(line) {
  return I18N_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

function shouldIgnoreLine(line, previousLine) {
  return (
    line.includes("i18n-ignore-line") ||
    previousLine.includes("i18n-ignore-next-line") ||
    !line.trim() ||
    isCommentOnly(line) ||
    isKnownI18nLine(line)
  );
}

function makeEmptyRuleCounts() {
  return Object.fromEntries(RULES.map((rule) => [rule.name, 0]));
}

function addIssue(summary, fileSummary, issue) {
  summary.totalIssues += 1;
  summary.rules[issue.rule] = (summary.rules[issue.rule] ?? 0) + 1;
  fileSummary.totalIssues += 1;
  fileSummary.rules[issue.rule] = (fileSummary.rules[issue.rule] ?? 0) + 1;
}

function scanFile(filePath, scope, includeIssues) {
  const text = readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const fileSummary = {
    file: filePath,
    rules: makeEmptyRuleCounts(),
    scope,
    totalIssues: 0,
  };
  const issues = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const previousLine = index > 0 ? (lines[index - 1] ?? "") : "";

    if (shouldIgnoreLine(line, previousLine)) {
      continue;
    }

    for (const rule of RULES) {
      if (!rule.test(line)) {
        continue;
      }

      const issue = {
        file: filePath,
        line: index + 1,
        message: rule.message,
        rule: rule.name,
        source: line.trim(),
      };
      addIssue({ rules: {}, totalIssues: 0 }, fileSummary, issue);
      if (includeIssues) {
        issues.push(issue);
      }
    }
  }

  return { fileSummary, issues };
}

function scan(scopes, includeIssues) {
  const files = listCandidateFiles(scopes);
  const scopeSummaries = Object.fromEntries(
    scopes.map((scope) => [
      scope,
      {
        files: 0,
        rules: makeEmptyRuleCounts(),
        topFiles: [],
        totalIssues: 0,
      },
    ]),
  );
  const issues = [];

  for (const filePath of files) {
    const scope = resolveScope(filePath, scopes);
    const scopeSummary =
      scopeSummaries[scope] ??
      (scopeSummaries[scope] = {
        files: 0,
        rules: makeEmptyRuleCounts(),
        topFiles: [],
        totalIssues: 0,
      });
    const { fileSummary, issues: fileIssues } = scanFile(
      filePath,
      scope,
      includeIssues,
    );

    scopeSummary.files += 1;
    scopeSummary.totalIssues += fileSummary.totalIssues;
    for (const [ruleName, count] of Object.entries(fileSummary.rules)) {
      scopeSummary.rules[ruleName] =
        (scopeSummary.rules[ruleName] ?? 0) + count;
    }
    if (fileSummary.totalIssues > 0) {
      scopeSummary.topFiles.push(fileSummary);
    }
    if (includeIssues) {
      issues.push(...fileIssues);
    }
  }

  return {
    rules: RULES.map(({ name, message }) => ({ name, message })),
    scopes: scopeSummaries,
    issues,
  };
}

function finalizeTopFiles(result, topCount) {
  for (const scopeSummary of Object.values(result.scopes)) {
    scopeSummary.topFiles = scopeSummary.topFiles
      .sort((a, b) => {
        if (b.totalIssues !== a.totalIssues) {
          return b.totalIssues - a.totalIssues;
        }
        return a.file.localeCompare(b.file);
      })
      .slice(0, topCount);
  }
}

function loadBaseline(baselinePath) {
  if (!baselinePath || !existsSync(baselinePath)) {
    throw new Error(`Baseline file not found: ${baselinePath}`);
  }

  return JSON.parse(readFileSync(baselinePath, "utf8"));
}

function getBaselineRulesForScope(baseline, scope) {
  const scopeBaseline = baseline.scopes?.[scope];
  if (!scopeBaseline) {
    return {};
  }

  return scopeBaseline.rules ?? scopeBaseline;
}

function compareWithBaseline(result, baseline) {
  const violations = [];
  const improvements = [];

  for (const [scope, summary] of Object.entries(result.scopes)) {
    const baselineRules = getBaselineRulesForScope(baseline, scope);
    for (const [ruleName, count] of Object.entries(summary.rules)) {
      const expected = Number(baselineRules[ruleName] ?? 0);
      if (count > expected) {
        violations.push({ count, expected, rule: ruleName, scope });
      } else if (count < expected) {
        improvements.push({ count, expected, rule: ruleName, scope });
      }
    }
  }

  return { improvements, violations };
}

function printHumanSummary(result, comparison) {
  for (const [scope, summary] of Object.entries(result.scopes)) {
    console.log(
      `${scope}: ${summary.totalIssues} issue(s) across ${summary.files} file(s)`,
    );
    const nonZeroRules = Object.entries(summary.rules).filter(
      ([, count]) => count > 0,
    );
    for (const [ruleName, count] of nonZeroRules) {
      console.log(`  ${ruleName}: ${count}`);
    }
    if (summary.topFiles.length > 0) {
      console.log("  top files:");
      for (const file of summary.topFiles) {
        console.log(`    ${file.file}: ${file.totalIssues}`);
      }
    }
  }

  if (!comparison) {
    return;
  }

  if (comparison.violations.length === 0) {
    console.log("i18n hardcode ratchet passed.");
  } else {
    console.error("i18n hardcode ratchet failed:");
    for (const violation of comparison.violations) {
      console.error(
        `- ${violation.scope} ${violation.rule}: ${violation.count} > baseline ${violation.expected}`,
      );
    }
  }

  if (comparison.improvements.length > 0) {
    console.log("ratchet improvement candidates:");
    for (const improvement of comparison.improvements) {
      console.log(
        `- ${improvement.scope} ${improvement.rule}: ${improvement.count} < baseline ${improvement.expected}`,
      );
    }
  }
}

function stripIssuesIfNeeded(result, includeIssues) {
  if (includeIssues) {
    return result;
  }

  const { issues: _issues, ...summaryOnly } = result;
  return summaryOnly;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = scan(options.scopes, options.includeIssues);
  finalizeTopFiles(result, options.topCount);

  const baseline = options.baselinePath ? loadBaseline(options.baselinePath) : null;
  const comparison = baseline ? compareWithBaseline(result, baseline) : null;
  const output = {
    ...stripIssuesIfNeeded(result, options.includeIssues),
    comparison: comparison ?? undefined,
  };

  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    printHumanSummary(result, comparison);
  }

  if (options.ratchet && comparison && comparison.violations.length > 0) {
    process.exitCode = 1;
  }
}

main();
