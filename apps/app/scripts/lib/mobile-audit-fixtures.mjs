import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const libDir = dirname(fileURLToPath(import.meta.url));
export const appDir = resolve(libDir, "..", "..");
export const viteBin = resolve(appDir, "node_modules/vite/bin/vite.js");
export const defaultStartPort = 5180;
export const serverTimeoutMs = 20_000;
export const routeIdleTimeoutMs = 5_000;
export const routeSettleMs = 700;

export const auditNow = "2026-04-28T00:00:00.000Z";

export const owner = {
  id: "owner-smoke",
  username: "Mobile Smoke User",
  onboardingCompleted: true,
  avatar: "",
  signature: "Mobile smoke",
  hasCustomApiKey: true,
  customApiBase: null,
  defaultChatBackground: null,
  createdAt: auditNow,
};

export const runtimeConfigTemplate = {
  environment: "development",
  channel: "web",
  bootstrapSource: "user",
  configStatus: "validated",
  publicAppName: "Yinjie",
  worldAccessMode: "local",
};

export const character = {
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
  lastActiveAt: auditNow,
  aiRelationships: [],
  currentStatus: "Online",
  currentActivity: "Smoke test",
  activityMode: "auto",
};

export const message = {
  id: "msg-1",
  conversationId: "conv-1",
  senderType: "character",
  senderId: character.id,
  senderName: character.name,
  senderAvatar: "",
  type: "text",
  text: "Mobile route smoke message",
  createdAt: auditNow,
};

export const conversation = {
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
  createdAt: auditNow,
  updatedAt: auditNow,
  lastActivityAt: auditNow,
};

export const group = {
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
  lastReadAt: auditNow,
  isHidden: false,
  lastActivityAt: auditNow,
  createdAt: auditNow,
  updatedAt: auditNow,
};

export const groupMember = {
  id: "member-1",
  groupId: group.id,
  memberId: character.id,
  memberType: "character",
  memberName: character.name,
  memberAvatar: "",
  role: "member",
  joinedAt: auditNow,
};

export const officialAccount = {
  id: "oa-1",
  name: "Yinjie Daily",
  handle: "yinjie_daily",
  avatar: "",
  description: "Mobile smoke official account",
  accountType: "subscription",
  isVerified: true,
  isFollowing: true,
  isMuted: false,
  lastPublishedAt: auditNow,
};

export const systemStatus = {
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

export const routePaths = [
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

export const extendedRoutePaths = [
  ...routePaths,
  "/tabs/moments",
  "/tabs/feed",
  "/tabs/channels",
  "/tabs/games",
  "/tabs/mini-programs",
  "/chat/conv-1",
  "/chat/conv-1/background",
  "/chat/conv-1/search",
  "/group/group-1",
  "/group/group-1/announcement",
  "/friend-moments/char-1",
];

export function shouldIgnoreConsoleError(text) {
  return (
    text.includes("/socket.io/") &&
    text.includes("WebSocket connection") &&
    text.includes("failed")
  );
}

export function jsonResponse(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

// Match host-rooted /api/ only (e.g. http://host/api/foo).
// The original "**/api/**" glob also matched Vite source paths like
// /src/features/chat/api/transcriptions.ts, breaking dynamic imports.
const apiUrlPattern = /^https?:\/\/[^/]+\/api\//;

export async function installApiMocks(page, statusPayload) {
  await page.route(apiUrlPattern, async (route) => {
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
            starredAt: auditNow,
            remarkName: null,
            region: null,
            source: "smoke",
            tags: [],
            createdAt: auditNow,
            lastInteractedAt: auditNow,
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

export async function seedAuditLocalStorage(context, runtimeConfig) {
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
}

export async function resolveAuditServer({
  envBaseUrlVar = "YINJIE_MOBILE_AUDIT_BASE_URL",
  envPortVar = "YINJIE_MOBILE_AUDIT_PORT",
} = {}) {
  const configuredBaseUrl = process.env[envBaseUrlVar]?.trim();
  if (configuredBaseUrl) {
    return {
      baseUrl: configuredBaseUrl.replace(/\/+$/, ""),
      stop: async () => undefined,
    };
  }

  if (!existsSync(viteBin)) {
    throw new Error(
      `Vite binary not found at ${viteBin}. Run pnpm install before mobile audit.`,
    );
  }

  const port = await findAvailablePort(
    Number(process.env[envPortVar] || defaultStartPort),
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

export async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No available port found from ${startPort}.`);
}

export function isPortAvailable(port) {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once("error", () => resolvePort(false));
    server.once("listening", () => {
      server.close(() => resolvePort(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

export async function waitForHttp(url, timeoutMs, child, output) {
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

export function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

export function stopChild(child) {
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
