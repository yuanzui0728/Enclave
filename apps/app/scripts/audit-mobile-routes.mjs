import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const viteBin = resolve(appDir, "node_modules/vite/bin/vite.js");
const defaultStartPort = 5180;
const serverTimeoutMs = 20_000;
const routeIdleTimeoutMs = 5_000;
const routeSettleMs = 700;

const now = "2026-04-28T00:00:00.000Z";
const owner = {
  id: "owner-smoke",
  username: "Mobile Smoke User",
  onboardingCompleted: true,
  avatar: "",
  signature: "Mobile smoke",
  hasCustomApiKey: true,
  customApiBase: null,
  defaultChatBackground: null,
  createdAt: now,
};
const runtimeConfigTemplate = {
  environment: "development",
  channel: "web",
  bootstrapSource: "user",
  configStatus: "validated",
  publicAppName: "Yinjie",
  worldAccessMode: "local",
};
const character = {
  id: "char-1",
  name: "Lin Shen",
  avatar: "",
  relationship: "Friend",
  relationshipType: "friend",
  personality: "Stable",
  bio: "Mobile smoke character",
  isOnline: true,
  onlineMode: "auto",
  sourceType: "manual_admin",
  sourceKey: null,
  deletionPolicy: "archive_allowed",
  isTemplate: false,
  expertDomains: ["chat"],
  profile: {
    characterId: "char-1",
    name: "Lin Shen",
    relationship: "Friend",
    expertDomains: ["chat"],
    traits: {
      speechPatterns: [],
      catchphrases: [],
      topicsOfInterest: ["mobile smoke"],
      emotionalTone: "calm",
      responseLength: "short",
      emojiUsage: "none",
    },
    memorySummary: "",
  },
  activityFrequency: "daily",
  momentsFrequency: 1,
  feedFrequency: 1,
  activeHoursStart: 8,
  activeHoursEnd: 23,
  triggerScenes: [],
  intimacyLevel: 30,
  lastActiveAt: now,
  aiRelationships: [],
  currentStatus: "Online",
  currentActivity: "Smoke test",
  activityMode: "auto",
};
const message = {
  id: "msg-1",
  conversationId: "conv-1",
  senderType: "character",
  senderId: character.id,
  senderName: character.name,
  senderAvatar: "",
  type: "text",
  text: "Mobile route smoke message",
  createdAt: now,
};
const conversation = {
  id: "conv-1",
  type: "direct",
  source: "conversation",
  title: character.name,
  avatar: "",
  participants: [character.id],
  messages: [message],
  lastMessage: message,
  unreadCount: 1,
  isPinned: false,
  isMuted: false,
  createdAt: now,
  updatedAt: now,
  lastActivityAt: now,
};
const group = {
  id: "group-1",
  name: "Mobile Smoke Group",
  avatar: "",
  creatorId: owner.id,
  creatorType: "owner",
  announcement: "Mobile smoke announcement",
  isMuted: false,
  isPinned: false,
  savedToContacts: true,
  showMemberNicknames: true,
  notifyOnAtMe: true,
  notifyOnAtAll: true,
  notifyOnAnnouncement: true,
  lastReadAt: now,
  isHidden: false,
  lastActivityAt: now,
  createdAt: now,
  updatedAt: now,
};
const groupMember = {
  id: "member-1",
  groupId: group.id,
  memberId: character.id,
  memberType: "character",
  memberName: character.name,
  memberAvatar: "",
  role: "member",
  joinedAt: now,
};
const officialAccount = {
  id: "oa-1",
  name: "Yinjie Daily",
  handle: "yinjie_daily",
  avatar: "",
  description: "Mobile smoke official account",
  accountType: "subscription",
  isVerified: true,
  isFollowing: true,
  isMuted: false,
  lastPublishedAt: now,
};
const systemStatus = {
  coreApi: { name: "Core API", healthy: true, version: "smoke" },
  desktopShell: { name: "Desktop Shell", healthy: true, version: "smoke" },
  database: { path: ":memory:", walEnabled: true, connected: true },
  inferenceGateway: {
    healthy: true,
    speechReady: false,
    queueDepth: 0,
    maxConcurrency: 1,
    inFlightRequests: 0,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
  },
  digitalHumanGateway: {
    healthy: false,
    mode: "mock_stage",
    provider: "mock_digital_human",
    ready: false,
    playerTemplateConfigured: false,
    callbackTokenConfigured: false,
    paramsValid: true,
    paramsCount: 0,
    paramsKeys: [],
    message: "smoke",
  },
  worldSurface: {
    apiPrefix: "/api",
    migratedModules: [],
    ownerCount: 1,
    charactersCount: 1,
    narrativeArcsCount: 0,
    behaviorLogsCount: 0,
  },
  scheduler: {
    healthy: true,
    mode: "production",
    coldStartEnabled: false,
    worldSnapshots: 0,
    jobs: [],
    recentRuns: [],
  },
  appMode: "development",
};

const routePaths = [
  "/tabs/chat",
  "/tabs/contacts",
  "/tabs/discover",
  "/tabs/profile",
  "/tabs/search",
  "/discover/moments",
  "/discover/moments/publish",
  "/discover/feed",
  "/discover/channels",
  "/discover/games",
  "/discover/mini-programs",
  "/discover/encounter",
  "/discover/scene",
  "/contacts/starred",
  "/contacts/world-characters",
  "/contacts/groups",
  "/contacts/tags",
  "/contacts/official-accounts",
  "/friend-requests",
  "/profile/settings",
  "/chat/conv-1/details",
  "/group/group-1/details",
  "/character/char-1",
  "/official-accounts/oa-1",
  "/chat/subscription-inbox",
];

async function main() {
  const server = await resolveAuditServer();

  try {
    await runBrowserAudit(server.baseUrl);
  } finally {
    await server.stop();
  }
}

async function resolveAuditServer() {
  const configuredBaseUrl = process.env.YINJIE_MOBILE_AUDIT_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return {
      baseUrl: configuredBaseUrl.replace(/\/+$/, ""),
      stop: async () => undefined,
    };
  }

  if (!existsSync(viteBin)) {
    throw new Error(
      `Vite binary not found at ${viteBin}. Run pnpm install before mobile route audit.`,
    );
  }

  const port = await findAvailablePort(
    Number(process.env.YINJIE_MOBILE_AUDIT_PORT || defaultStartPort),
  );
  const child = spawn(
    process.execPath,
    [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: appDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const output = [];
  child.stdout.on("data", (chunk) => {
    output.push(String(chunk));
  });
  child.stderr.on("data", (chunk) => {
    output.push(String(chunk));
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHttp(baseUrl, serverTimeoutMs, child, output);

  return {
    baseUrl,
    stop: () => stopChild(child),
  };
}

async function runBrowserAudit(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  });
  const runtimeConfig = {
    ...runtimeConfigTemplate,
    apiBaseUrl: baseUrl,
    socketBaseUrl: baseUrl,
  };

  await context.addInitScript(
    ({ ownerValue, runtimeConfigValue }) => {
      localStorage.setItem(
        "yinjie-app-world-owner",
        JSON.stringify({ state: ownerValue, version: 0 }),
      );
      localStorage.setItem(
        "yinjie-app-runtime-config",
        JSON.stringify(runtimeConfigValue),
      );
      localStorage.setItem(
        "yinjie-app-runtime-config-updated-at",
        "2026-04-28T00:00:00.000Z",
      );
    },
    { ownerValue: owner, runtimeConfigValue: runtimeConfig },
  );

  try {
    const errors = [];
    for (const routePath of routePaths) {
      const pageErrors = [];
      const page = await createAuditedPage(context, pageErrors, systemStatus);
      await auditRoute(page, baseUrl, routePath, pageErrors);
      if (pageErrors.length) {
        errors.push(`${routePath}\n  ${pageErrors.join("\n  ")}`);
      }
      await page.close();
    }

    const malformedStatusErrors = [];
    const malformedStatusPage = await createAuditedPage(
      context,
      malformedStatusErrors,
      { worldSurface: { ownerCount: 1 } },
    );
    await auditRoute(
      malformedStatusPage,
      baseUrl,
      "/tabs/chat",
      malformedStatusErrors,
    );
    if (malformedStatusErrors.length) {
      errors.push(
        `/tabs/chat with malformed system status\n  ${malformedStatusErrors.join(
          "\n  ",
        )}`,
      );
    }
    await malformedStatusPage.close();

    if (errors.length) {
      throw new Error(errors.join("\n"));
    }

    console.log(
      `mobile route audit passed: ${routePaths.length} routes + malformed status guard`,
    );
  } finally {
    await browser.close();
  }
}

async function createAuditedPage(context, errors, statusPayload) {
  const page = await context.newPage();
  await installApiMocks(page, statusPayload);
  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    const text = message.text();
    if (shouldIgnoreConsoleError(text)) {
      return;
    }

    errors.push(`console.error: ${text}`);
  });
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  return page;
}

function shouldIgnoreConsoleError(text) {
  return (
    text.includes("/socket.io/") &&
    text.includes("WebSocket connection") &&
    text.includes("failed")
  );
}

async function auditRoute(page, baseUrl, routePath, errors) {
  await page.goto(`${baseUrl}${routePath}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: routeIdleTimeoutMs })
    .catch(() => undefined);
  await page.waitForTimeout(routeSettleMs);

  const bodyText = (await page.locator("body").innerText()).trim();
  if (!bodyText) {
    errors.push("empty body text");
  }

  const rootText = await page.locator("#root").innerText().catch(() => "");
  if (
    /Maximum update depth exceeded|Cannot read properties|The above error occurred|Minified React error/.test(
      rootText,
    )
  ) {
    errors.push(`error text rendered: ${rootText.slice(0, 300)}`);
  }
}

async function installApiMocks(page, statusPayload) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === "/api/world/owner") return jsonResponse(route, owner);
    if (path === "/api/system/status") {
      return jsonResponse(route, statusPayload);
    }
    if (path === "/api/conversations") {
      return jsonResponse(route, [conversation]);
    }
    if (path === "/api/conversations/conv-1/messages") {
      return jsonResponse(route, [message]);
    }
    if (path === "/api/conversations/conv-1/message-search") {
      return jsonResponse(route, []);
    }
    if (path === "/api/characters") return jsonResponse(route, [character]);
    if (path === "/api/characters/char-1") {
      return jsonResponse(route, character);
    }
    if (path === "/api/social/friends") {
      return jsonResponse(route, [
        {
          friendship: {
            id: "friend-1",
            characterId: character.id,
            intimacyLevel: 30,
            status: "active",
            isStarred: true,
            starredAt: now,
            remarkName: null,
            region: null,
            source: "smoke",
            tags: [],
            createdAt: now,
            lastInteractedAt: now,
          },
          character,
        },
      ]);
    }
    if (
      path === "/api/social/friend-requests" ||
      path === "/api/social/blocks" ||
      path === "/api/social/blocked-characters"
    ) {
      return jsonResponse(route, []);
    }
    if (path === "/api/groups" || path === "/api/groups/saved") {
      return jsonResponse(route, [group]);
    }
    if (path === "/api/groups/group-1") return jsonResponse(route, group);
    if (path === "/api/groups/group-1/members") {
      return jsonResponse(route, [groupMember]);
    }
    if (
      path === "/api/groups/group-1/messages" ||
      path === "/api/groups/group-1/message-search" ||
      path === "/api/moments"
    ) {
      return jsonResponse(route, []);
    }
    if (path === "/api/feed") {
      return jsonResponse(route, {
        posts: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });
    }
    if (path === "/api/feed/channels/home") {
      return jsonResponse(route, {
        sections: [
          { key: "recommended", label: "Recommended", count: 0 },
          { key: "friends", label: "Friends", count: 0 },
          { key: "following", label: "Following", count: 0 },
          { key: "live", label: "Live", count: 0 },
        ],
        activeSection: url.searchParams.get("section") || "recommended",
        posts: [],
        authors: [],
        liveEntries: [],
        total: 0,
      });
    }
    if (path === "/api/games/home" || path === "/api/games/owner-state") {
      return jsonResponse(route, {});
    }
    if (path === "/api/official-accounts") {
      return jsonResponse(route, [officialAccount]);
    }
    if (path === "/api/official-accounts/oa-1") {
      return jsonResponse(route, { ...officialAccount, articles: [] });
    }
    if (path === "/api/official-accounts/oa-1/articles") {
      return jsonResponse(route, []);
    }
    if (path === "/api/official-accounts/message-entries") {
      return jsonResponse(route, {
        subscriptionInbox: null,
        serviceConversations: [],
      });
    }
    if (path === "/api/official-accounts/subscription-inbox") {
      return jsonResponse(route, { summary: null, feedItems: [], groups: [] });
    }
    if (
      path === "/api/official-accounts/service-conversations" ||
      path === "/api/official-accounts/oa-1/service-messages" ||
      path === "/api/favorites" ||
      path === "/api/favorites/notes" ||
      path === "/api/reminders/messages"
    ) {
      return jsonResponse(route, []);
    }

    return jsonResponse(route, []);
  });
}

function jsonResponse(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No available port found from ${startPort}.`);
}

function isPortAvailable(port) {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once("error", () => resolvePort(false));
    server.once("listening", () => {
      server.close(() => resolvePort(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function waitForHttp(url, timeoutMs, child, output) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Vite exited before mobile audit started.\n${output.join("")}`,
      );
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }

    await sleep(200);
  }

  throw new Error(`Timed out waiting for Vite at ${url}.\n${output.join("")}`);
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function stopChild(child) {
  return new Promise((resolveStop) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveStop();
      return;
    }

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
    child.kill("SIGTERM");
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
