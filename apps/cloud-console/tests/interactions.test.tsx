import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { CloudWorldLifecycleStatus } from "@yinjie/contracts";
import {
  DASHBOARD_ACTIVE_JOB_ACTIONS,
  DASHBOARD_FAILED_JOB_ACTIONS,
  JOBS_PAGE_ACTIONS,
  WORLDS_PAGE_ACTIONS,
  WORLD_LIFECYCLE_ACTION_RULES,
  createWorldActionAriaLabel,
  type WorldLifecycleAction,
} from "../src/lib/world-lifecycle-actions";
import {
  type CloudAdminRequestLog,
  installCloudAdminApiMock,
  mockAdminSessions,
  mockWaitingSessionSyncTasks,
  renderRoute,
} from "./test-helpers";

const MOCK_WORLD_LABEL = { name: "Mock World" };
const DASHBOARD_ACTIVE_WORLD_LABEL = { name: "Dashboard Active World" };
const DASHBOARD_FAILED_WORLD_LABEL = { name: "Dashboard Failed World" };
const JOB_ACTION_STATUSES: CloudWorldLifecycleStatus[] = [
  "ready",
  "queued",
  "failed",
  "sleeping",
  "stopping",
  "starting",
];
const WORLD_ACTION_STATUSES: CloudWorldLifecycleStatus[] = [
  "ready",
  "queued",
  "failed",
  "sleeping",
  "stopping",
  "starting",
];
const DASHBOARD_ACTIVE_ACTION_STATUSES: CloudWorldLifecycleStatus[] = [
  "ready",
  "sleeping",
];
const DASHBOARD_FAILED_ACTION_STATUSES: CloudWorldLifecycleStatus[] = [
  "ready",
  "failed",
];

function buildActionVisibilityCases(
  statuses: readonly CloudWorldLifecycleStatus[],
  visibleActions: readonly WorldLifecycleAction[],
  worldLabel = MOCK_WORLD_LABEL,
) {
  return statuses.map((status) => {
    const allowed = WORLD_LIFECYCLE_ACTION_RULES[
      status
    ] as readonly WorldLifecycleAction[];

    return {
      status,
      present: visibleActions
        .filter((action) => allowed.includes(action))
        .map((action) => createWorldActionAriaLabel(action, worldLabel)),
      absent: visibleActions
        .filter((action) => !allowed.includes(action))
        .map((action) => createWorldActionAriaLabel(action, worldLabel)),
    };
  });
}

function hasAdminSessionsRequest(
  requests: CloudAdminRequestLog[],
  expectedParams: Record<string, string>,
) {
  return requests.some((entry) => {
    if (entry.url !== "GET /admin/cloud/admin-sessions") {
      return false;
    }

    const path = entry.pathWithSearch.slice("GET ".length);
    const search = path.includes("?") ? path.slice(path.indexOf("?")) : "";
    const params = new URLSearchParams(search);

    return Object.entries(expectedParams).every(
      ([key, value]) => params.get(key) === value,
    );
  });
}

function expectAdminSessionsBulkRevokeRequest(
  requests: CloudAdminRequestLog[],
  {
    expectedCount,
    requiredIds,
    excludedIds = [],
  }: {
    expectedCount?: number;
    requiredIds: string[];
    excludedIds?: string[];
  },
) {
  expect(
    requests.some((entry) => {
      if (entry.url !== "POST /admin/cloud/admin-sessions/revoke") {
        return false;
      }
      if (!Array.isArray(entry.body?.sessionIds)) {
        return false;
      }

      const sessionIds = entry.body.sessionIds.filter(
        (value): value is string => typeof value === "string",
      );

      if (expectedCount !== undefined && sessionIds.length !== expectedCount) {
        return false;
      }

      return (
        requiredIds.every((sessionId) => sessionIds.includes(sessionId)) &&
        excludedIds.every((sessionId) => !sessionIds.includes(sessionId))
      );
    }),
  ).toBe(true);
}

function expectAdminSessionRevokeRequest(
  requests: CloudAdminRequestLog[],
  sessionId: string,
) {
  expect(
    requests.some(
      (entry) =>
        entry.url === `POST /admin/cloud/admin-sessions/${sessionId}/revoke`,
    ),
  ).toBe(true);
}

function expectAdminSessionsFilteredRevokeRequest(
  requests: CloudAdminRequestLog[],
  {
    query,
    body = {},
  }: {
    query: string;
    body?: Record<string, unknown>;
  },
) {
  expect(
    requests.some(
      (entry) =>
        entry.url === "POST /admin/cloud/admin-sessions/revoke-filtered" &&
        entry.body?.query === query &&
        Object.entries(body).every(
          ([key, value]) =>
            (entry.body as Record<string, unknown> | undefined)?.[key] === value,
        ),
    ),
  ).toBe(true);
}

async function expectAdminSessionsQuery(
  requests: CloudAdminRequestLog[],
  expectedParams: Record<string, string>,
) {
  await waitFor(() => {
    expect(hasAdminSessionsRequest(requests, expectedParams)).toBe(true);
  });
}

function hasAdminSessionSourceGroupsRequest(
  requests: CloudAdminRequestLog[],
  expectedParams: Record<string, string>,
) {
  return requests.some((entry) => {
    if (entry.url !== "GET /admin/cloud/admin-session-source-groups") {
      return false;
    }

    const path = entry.pathWithSearch.slice("GET ".length);
    const search = path.includes("?") ? path.slice(path.indexOf("?")) : "";
    const params = new URLSearchParams(search);

    return Object.entries(expectedParams).every(
      ([key, value]) => params.get(key) === value,
    );
  });
}

function hasWaitingSessionSyncTasksRequest(
  requests: CloudAdminRequestLog[],
  expectedParams: Record<string, string>,
) {
  return requests.some((entry) => {
    if (entry.url !== "GET /admin/cloud/waiting-session-sync-tasks") {
      return false;
    }

    const path = entry.pathWithSearch.slice("GET ".length);
    const search = path.includes("?") ? path.slice(path.indexOf("?")) : "";
    const params = new URLSearchParams(search);

    return Object.entries(expectedParams).every(
      ([key, value]) => params.get(key) === value,
    );
  });
}

function hasJobsRequest(
  requests: CloudAdminRequestLog[],
  expectedParams: Record<string, string>,
) {
  return requests.some((entry) => {
    if (entry.url !== "GET /admin/cloud/jobs") {
      return false;
    }

    const path = entry.pathWithSearch.slice("GET ".length);
    const search = path.includes("?") ? path.slice(path.indexOf("?")) : "";
    const params = new URLSearchParams(search);

    return Object.entries(expectedParams).every(
      ([key, value]) => params.get(key) === value,
    );
  });
}

const JOB_ACTION_VISIBILITY_CASES = buildActionVisibilityCases(
  JOB_ACTION_STATUSES,
  JOBS_PAGE_ACTIONS,
);

const WORLD_ACTION_VISIBILITY_CASES = buildActionVisibilityCases(
  WORLD_ACTION_STATUSES,
  WORLDS_PAGE_ACTIONS,
);

const DASHBOARD_ACTIVE_ACTION_VISIBILITY_CASES = buildActionVisibilityCases(
  DASHBOARD_ACTIVE_ACTION_STATUSES,
  DASHBOARD_ACTIVE_JOB_ACTIONS,
  DASHBOARD_ACTIVE_WORLD_LABEL,
);

const DASHBOARD_FAILED_ACTION_VISIBILITY_CASES = buildActionVisibilityCases(
  DASHBOARD_FAILED_ACTION_STATUSES,
  DASHBOARD_FAILED_JOB_ACTIONS,
  DASHBOARD_FAILED_WORLD_LABEL,
);
type ScreenTextMatcher = string | RegExp;

const WAITING_SYNC_REVIEW_CONTEXT = "runtime.heartbeat";
const WAITING_SYNC_REVIEW_TASK_ID =
  "77777777-7777-4777-8777-777777777777";
const WAITING_SYNC_REVIEW_TASK_KEY = "refresh-phone:+8613800138099";
const WAITING_SYNC_REVIEW_PATH =
  "/waiting-sync?reviewContext=runtime.heartbeat";
const WAITING_SYNC_REVIEW_TASK_PATH =
  "/waiting-sync?reviewContext=runtime.heartbeat&reviewTaskId=77777777-7777-4777-8777-777777777777";
const WAITING_SYNC_HIGHLIGHTED_TASK_ID =
  "44444444-4444-4444-8444-444444444444";
const WAITING_SYNC_HIGHLIGHTED_TASK_KEY = "refresh-world:world-1";
const WAITING_SYNC_HIGHLIGHTED_TASK_PATH =
  "/waiting-sync?reviewContext=runtime.heartbeat&reviewTaskId=44444444-4444-4444-8444-444444444444";
const WAITING_SYNC_FOCUSED_TARGET_TASK_KEY = "refresh-phone:+8613800138001";
const WAITING_SYNC_LINKED_PHONE = "+8613800138000";
const WAITING_SYNC_LINKED_REQUEST_NAME = "Linked Phone Request";
const WAITING_SYNC_UNRELATED_REQUEST_NAME = "Unrelated Request";
const ADMIN_SESSION_CURRENT_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_SESSION_SECONDARY_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_SESSION_FOCUSED_SOURCE_TITLE = "Focused Source Browser";
const ADMIN_SESSION_FOCUSED_SOURCE_IP = "203.0.113.188";
const ADMIN_SESSION_FOCUSED_SOURCE_CURRENT_ID =
  "77777777-7777-4777-8777-777777777777";
const ADMIN_SESSION_FOCUSED_SOURCE_SECONDARY_ID =
  "88888888-8888-4888-8888-888888888888";
const ADMIN_SESSION_FOCUSED_SOURCE_OTHER_ID =
  "99999999-9999-4999-8999-999999999999";

function buildAdminSessionSourceKey(
  issuedFromIp: string,
  issuedUserAgent: string,
) {
  return Buffer.from(
    JSON.stringify([issuedFromIp, issuedUserAgent]),
    "utf8",
  ).toString("base64url");
}

function buildAdminSessionSourceSession({
  template = mockAdminSessions[1],
  issuedFromIp,
  issuedUserAgent,
  lastUsedIp = issuedFromIp,
  lastUsedUserAgent = issuedUserAgent,
  ...overrides
}: {
  template?: (typeof mockAdminSessions)[number];
  id: string;
  issuedFromIp: string;
  issuedUserAgent: string;
  lastUsedIp?: string;
  lastUsedUserAgent?: string;
  isCurrent?: boolean;
  status?: "active" | "revoked";
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revocationReason?: string | null;
  revokedAt?: string | null;
  revokedBySessionId?: string | null;
}) {
  return {
    ...template,
    ...overrides,
    issuedFromIp,
    issuedUserAgent,
    lastUsedIp,
    lastUsedUserAgent,
  };
}

type AdminSessionSourceSessionInput = Parameters<
  typeof buildAdminSessionSourceSession
>[0];

function buildAdminSessionSourceScenario({
  issuedFromIp,
  issuedUserAgent,
  sourceSessions,
  otherSessions = [],
}: {
  issuedFromIp: string;
  issuedUserAgent: string;
  sourceSessions: Array<
    Omit<AdminSessionSourceSessionInput, "issuedFromIp" | "issuedUserAgent">
  >;
  otherSessions?: AdminSessionSourceSessionInput[];
}) {
  return {
    sourceKey: buildAdminSessionSourceKey(issuedFromIp, issuedUserAgent),
    adminSessions: [
      ...sourceSessions.map((session) =>
        buildAdminSessionSourceSession({
          ...session,
          issuedFromIp,
          issuedUserAgent,
        }),
      ),
      ...otherSessions.map((session) => buildAdminSessionSourceSession(session)),
    ],
  };
}

function buildAdminSessionFocusedSourceScenario({
  includeOtherSessions = false,
}: {
  includeOtherSessions?: boolean;
} = {}) {
  return buildAdminSessionSourceScenario({
    issuedFromIp: ADMIN_SESSION_FOCUSED_SOURCE_IP,
    issuedUserAgent: ADMIN_SESSION_FOCUSED_SOURCE_TITLE,
    sourceSessions: [
      {
        template: mockAdminSessions[0],
        id: ADMIN_SESSION_FOCUSED_SOURCE_CURRENT_ID,
        isCurrent: true,
        status: "active",
      },
      {
        id: ADMIN_SESSION_FOCUSED_SOURCE_SECONDARY_ID,
        isCurrent: false,
        status: "active",
      },
    ],
    otherSessions: includeOtherSessions
      ? [
          {
            id: ADMIN_SESSION_FOCUSED_SOURCE_OTHER_ID,
            issuedFromIp: "198.51.100.188",
            issuedUserAgent: "Other Source Browser",
            isCurrent: false,
            status: "active",
          },
        ]
      : [],
  });
}

function installFocusedAdminSessionScenario({
  includeOtherSessions = false,
}: {
  includeOtherSessions?: boolean;
} = {}) {
  const scenario = buildAdminSessionFocusedSourceScenario({
    includeOtherSessions,
  });
  return {
    ...scenario,
    ...installCloudAdminApiMock({
      adminSessions: scenario.adminSessions,
    }),
  };
}

async function renderInstalledFocusedAdminSessionSourceGroup({
  includeOtherSessions = false,
  title,
  showMatches = false,
}: {
  includeOtherSessions?: boolean;
  title?: string;
  showMatches?: boolean;
} = {}) {
  const scenario = installFocusedAdminSessionScenario({
    includeOtherSessions,
  });
  await renderFocusedAdminSessionSourceGroup({
    title,
    showMatches,
  });
  return scenario;
}

async function renderInstalledFocusedAdminSessionOverview({
  includeOtherSessions = false,
  title,
  overviewOptions,
}: {
  includeOtherSessions?: boolean;
  title?: string;
  overviewOptions?: Parameters<typeof renderFocusedAdminSessionOverview>[0]["overviewOptions"];
} = {}) {
  const scenario = installFocusedAdminSessionScenario({
    includeOtherSessions,
  });
  await renderFocusedAdminSessionOverview({
    requests: scenario.requests,
    sourceKey: scenario.sourceKey,
    title,
    overviewOptions,
  });
  return scenario;
}

async function renderInstalledFocusedAdminSessionTimelineSessionDetail({
  includeOtherSessions = false,
  sessionId,
  detailOptions,
}: {
  includeOtherSessions?: boolean;
  sessionId?: string;
  detailOptions?: Parameters<typeof renderFocusedAdminSessionTimelineSessionDetail>[0]["detailOptions"];
} = {}) {
  const scenario = installFocusedAdminSessionScenario({
    includeOtherSessions,
  });
  await renderFocusedAdminSessionTimelineSessionDetail({
    requests: scenario.requests,
    sourceKey: scenario.sourceKey,
    sessionId,
    detailOptions,
  });
  return scenario;
}

function buildAdminSessionActiveSourcePairScenario({
  issuedFromIp,
  issuedUserAgent,
  sourceSessionIds,
  otherSessions = [],
}: {
  issuedFromIp: string;
  issuedUserAgent: string;
  sourceSessionIds: [string, string];
  otherSessions?: AdminSessionSourceSessionInput[];
}) {
  return buildAdminSessionSourceScenario({
    issuedFromIp,
    issuedUserAgent,
    sourceSessions: [
      {
        template: mockAdminSessions[0],
        id: sourceSessionIds[0],
        isCurrent: false,
        status: "active",
      },
      {
        id: sourceSessionIds[1],
        isCurrent: false,
        status: "active",
      },
    ],
    otherSessions,
  });
}

function buildAdminSessionGeneratedQuerySessions({
  count,
  idSuffix,
  issuedFromIpPrefix,
  issuedFromIpStart,
  issuedUserAgentPrefix,
  currentIndex = 0,
  revokedIndexes = [],
  revokedAt = "2026-04-20T00:40:00.000Z",
  revocationReason = "manual-revocation" as const,
  createdAt,
  updatedAt,
  lastUsedAt,
  expiresAt,
}: {
  count: number;
  idSuffix: string;
  issuedFromIpPrefix: string;
  issuedFromIpStart: number;
  issuedUserAgentPrefix: string;
  currentIndex?: number;
  revokedIndexes?: number[];
  revokedAt?: string;
  revocationReason?: "manual-revocation";
  createdAt: (index: number) => string;
  updatedAt: (index: number) => string;
  lastUsedAt: (index: number) => string;
  expiresAt: (index: number) => string;
}) {
  const firstSessionId = `${String(1).padStart(8, "0")}-${idSuffix}`;

  return Array.from({ length: count }, (_, index) => {
    const isRevoked = revokedIndexes.includes(index);

    return buildAdminSessionSourceSession({
      id: `${String(index + 1).padStart(8, "0")}-${idSuffix}`,
      issuedFromIp: `${issuedFromIpPrefix}${index + issuedFromIpStart}`,
      issuedUserAgent: `${issuedUserAgentPrefix} ${index + 1}`,
      isCurrent: index === currentIndex,
      status: isRevoked ? "revoked" : "active",
      createdAt: createdAt(index),
      updatedAt: updatedAt(index),
      lastUsedAt: lastUsedAt(index),
      expiresAt: expiresAt(index),
      revokedAt: isRevoked ? revokedAt : null,
      revokedBySessionId: isRevoked ? firstSessionId : null,
      revocationReason: isRevoked ? revocationReason : null,
    });
  });
}

function buildAdminSessionDescendingQuerySessions({
  count,
  idSuffix,
  issuedFromIpPrefix,
  issuedFromIpStart,
  issuedUserAgentPrefix,
  currentIndex = 0,
  revokedIndexes = [],
}: {
  count: number;
  idSuffix: string;
  issuedFromIpPrefix: string;
  issuedFromIpStart: number;
  issuedUserAgentPrefix: string;
  currentIndex?: number;
  revokedIndexes?: number[];
}) {
  return buildAdminSessionGeneratedQuerySessions({
    count,
    idSuffix,
    issuedFromIpPrefix,
    issuedFromIpStart,
    issuedUserAgentPrefix,
    currentIndex,
    revokedIndexes,
    createdAt: (index) =>
      new Date(Date.UTC(2026, 3, 20, 0, 0, 0) - index * 60_000).toISOString(),
    updatedAt: (index) =>
      new Date(Date.UTC(2026, 3, 20, 1, 0, 0) - index * 60_000).toISOString(),
    lastUsedAt: (index) =>
      new Date(Date.UTC(2026, 3, 20, 2, 0, 0) - index * 60_000).toISOString(),
    expiresAt: (index) =>
      new Date(
        Date.UTC(2026, 3, 21, 0, 0, 0) + (count - 1 - index) * 60_000,
      ).toISOString(),
  });
}

function buildWaitingSessionSyncReviewTasks() {
  return [
    mockWaitingSessionSyncTasks[0],
    {
      ...mockWaitingSessionSyncTasks[1],
      id: WAITING_SYNC_REVIEW_TASK_ID,
      taskKey: WAITING_SYNC_REVIEW_TASK_KEY,
      targetValue: "+8613800138099",
      context: WAITING_SYNC_REVIEW_CONTEXT,
      status: "pending" as const,
    },
    mockWaitingSessionSyncTasks[2],
  ];
}

function installWaitingSessionSyncReviewMock() {
  return installCloudAdminApiMock({
    waitingSessionSyncTasks: buildWaitingSessionSyncReviewTasks(),
  });
}

async function findWaitingSessionSyncContextCard(
  context = WAITING_SYNC_REVIEW_CONTEXT,
) {
  await waitFor(() => {
    expect(screen.getAllByText(context).length).toBeGreaterThan(0);
  });

  const contextLabel = screen
    .getAllByText(context)
    .find((element) => element.closest("article"));
  expect(contextLabel).toBeTruthy();

  const contextCard = contextLabel?.closest("article");
  expect(contextCard).toBeTruthy();

  return contextCard as HTMLElement;
}

async function expectWaitingSessionSyncContextGroupsReady(
  context = WAITING_SYNC_REVIEW_CONTEXT,
) {
  expect(await screen.findByText("Context groups")).toBeTruthy();
  expect((await screen.findAllByText(context)).length).toBeGreaterThan(0);
}

async function openWaitingSessionSyncContextReview() {
  const contextCard = await findWaitingSessionSyncContextCard();

  fireEvent.click(
    within(contextCard).getByRole("button", {
      name: "Review tasks",
    }),
  );

  return {
    contextCard,
    reviewPanel: await screen.findByLabelText("Context task review"),
  };
}

async function openWaitingSessionSyncReviewRoute(path: string) {
  renderRoute(path);
  return screen.findByLabelText("Context task review");
}

function getWaitingSessionSyncReviewedTaskCard(
  reviewPanel: HTMLElement,
  taskKey = WAITING_SYNC_REVIEW_TASK_KEY,
) {
  const taskLabel = within(reviewPanel).getByText(taskKey);
  const taskCard = taskLabel.closest("article");
  expect(taskCard).toBeTruthy();
  return taskCard as HTMLElement;
}

function expectWaitingSessionSyncReviewPermalink(
  reviewPanel: HTMLElement,
  path: string,
) {
  const reviewPermalinkLink = within(reviewPanel).getByRole("link", {
    name: "Open review permalink",
  });
  expect(reviewPermalinkLink.getAttribute("href")).toBe(path);
  return reviewPermalinkLink;
}

function expectWaitingSessionSyncTaskPermalink(
  scope: HTMLElement,
  path: string,
) {
  const taskPermalinkLink = within(scope).getByRole("link", {
    name: "Open task permalink",
  });
  expect(taskPermalinkLink.getAttribute("href")).toBe(path);
  return taskPermalinkLink;
}

async function focusWaitingSessionSyncContext(
  scope: HTMLElement,
  requests?: CloudAdminRequestLog[],
) {
  fireEvent.click(
    within(scope).getByRole("button", {
      name: "Focus context",
    }),
  );

  if (requests) {
    await waitFor(() => {
      expect(
        hasWaitingSessionSyncTasksRequest(requests, {
          query: WAITING_SYNC_REVIEW_CONTEXT,
          page: "1",
          pageSize: "20",
        }),
      ).toBe(true);
    });
  }

  expect(await screen.findByText("Focused context")).toBeTruthy();
}

async function renderHighlightedWaitingSessionSyncTaskRoute() {
  renderRoute(WAITING_SYNC_HIGHLIGHTED_TASK_PATH);

  expect(await screen.findByText("Waiting session sync")).toBeTruthy();
  await waitFor(() => {
    expect(
      screen.getAllByText(WAITING_SYNC_HIGHLIGHTED_TASK_KEY).length,
    ).toBeGreaterThan(0);
  });
}

async function renderWaitingSessionSyncPageWithTaskKey(taskKey: string) {
  renderRoute("/waiting-sync");

  expect(await screen.findByText("Waiting session sync")).toBeTruthy();
  expect(await screen.findByText(taskKey)).toBeTruthy();
}

async function renderWaitingSessionSyncPage(
  taskKey = WAITING_SYNC_HIGHLIGHTED_TASK_KEY,
) {
  await renderWaitingSessionSyncPageWithTaskKey(taskKey);
}

async function renderWaitingSessionSyncContextGroupsPage() {
  renderRoute("/waiting-sync");
  await expectWaitingSessionSyncContextGroupsReady();
}

async function focusWaitingSessionSyncTarget({
  taskKey = WAITING_SYNC_FOCUSED_TARGET_TASK_KEY,
  buttonIndex = 1,
}: {
  taskKey?: string;
  buttonIndex?: number;
} = {}) {
  await renderWaitingSessionSyncPageWithTaskKey(taskKey);

  await waitFor(() => {
    expect(
      screen.getAllByRole("button", { name: "Focus target" }).length,
    ).toBeGreaterThan(buttonIndex);
  });

  fireEvent.click(screen.getAllByRole("button", { name: "Focus target" })[buttonIndex]);

  expect(await screen.findByText("Focused target")).toBeTruthy();
  expect(
    await screen.findByRole("button", { name: "Export focus snapshot" }),
  ).toBeTruthy();
}

async function exportWaitingSessionSyncFocusArtifact({
  buttonName,
  message,
  buttonIndex = 0,
}: {
  buttonName: string;
  message: string;
  buttonIndex?: number;
}) {
  fireEvent.click(
    screen.getAllByRole("button", { name: buttonName })[buttonIndex],
  );
  expect(await screen.findByText(message)).toBeTruthy();
}

async function findWaitingSessionSyncReceiptsRegion() {
  return screen.findByRole("region", {
    name: "Recent task receipts",
  });
}

async function expectWaitingSessionSyncHighlightedTaskReceipt({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  await waitFor(() => {
    expect(screen.getAllByText(message).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Request id").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^mock-request-/).length).toBeGreaterThan(0);
  });

  const receiptsRegion = await findWaitingSessionSyncReceiptsRegion();
  expect(within(receiptsRegion).getByText(title)).toBeTruthy();
  expect(within(receiptsRegion).getByText(message)).toBeTruthy();
  expect(within(receiptsRegion).getByText("Task key")).toBeTruthy();
  expect(
    within(receiptsRegion).getByText(WAITING_SYNC_HIGHLIGHTED_TASK_KEY),
  ).toBeTruthy();
  expect(within(receiptsRegion).getByText("Request id")).toBeTruthy();
  expect(within(receiptsRegion).getByText(/^mock-request-/)).toBeTruthy();

  const taskPermalinkLink = within(receiptsRegion).getByRole("link", {
    name: "Open task permalink",
  });
  expect(taskPermalinkLink.getAttribute("href")).toBe(
    WAITING_SYNC_HIGHLIGHTED_TASK_PATH,
  );

  return receiptsRegion;
}

async function expectWaitingSessionSyncLinkedRequestsView({
  phone = WAITING_SYNC_LINKED_PHONE,
  worldName = WAITING_SYNC_LINKED_REQUEST_NAME,
  hiddenWorldName = WAITING_SYNC_UNRELATED_REQUEST_NAME,
}: {
  phone?: string;
  worldName?: string;
  hiddenWorldName?: string;
} = {}) {
  expect(await screen.findByText("World requests")).toBeTruthy();
  expect((screen.getByLabelText("Request search") as HTMLInputElement).value).toBe(
    phone,
  );
  expect(await screen.findByText(worldName)).toBeTruthy();
  expect(screen.queryByText(hiddenWorldName)).toBeNull();
  expect(window.location.pathname).toBe("/requests");
}

async function expectWaitingSessionSyncLinkedWorldsView({
  phone = WAITING_SYNC_LINKED_PHONE,
  worldName = "Mock World",
}: {
  phone?: string;
  worldName?: string;
} = {}) {
  expect(await screen.findByText("Managed worlds")).toBeTruthy();
  expect((screen.getByLabelText("World search") as HTMLInputElement).value).toBe(
    phone,
  );
  expect(
    (await screen.findAllByRole("link", { name: worldName })).length,
  ).toBeGreaterThan(0);
  expect(window.location.pathname).toBe("/worlds");
}

async function renderAdminSessionsPage() {
  renderRoute("/sessions");
  expect(await screen.findByText("Admin sessions")).toBeTruthy();
}

async function expectAdminSessionsSummary(summary: string) {
  expect(await screen.findAllByText(summary)).toHaveLength(2);
}

function expectAdminSessionsFirstDataRowContains(text: string) {
  expect(screen.getAllByRole("row")[1]?.textContent).toContain(text);
}

async function expectAdminSessionsRevokeNotice(
  message: string,
  { includeRequestId = false }: { includeRequestId?: boolean } = {},
) {
  expect((await screen.findAllByText(message)).length).toBeGreaterThan(0);

  if (includeRequestId) {
    await expectAdminSessionRequestIdNotice();
  }

  expect(
    (await screen.findAllByText("Manual revoke", { selector: "div" })).length,
  ).toBeGreaterThan(0);
}

async function expectAdminSessionsErrorNotice(
  message: string,
  { dialogTitle }: { dialogTitle?: string } = {},
) {
  expect(await screen.findByText(message)).toBeTruthy();

  if (dialogTitle) {
    expectAdminSessionsDialogClosed(dialogTitle);
  }
}

async function expectAdminSessionRequestIdNotice() {
  expect(await screen.findByText("Request id")).toBeTruthy();
  expect(await screen.findByText(/^mock-request-/)).toBeTruthy();
}

async function expectAdminSessionSourceGroupNotice(
  message: string,
  { includeRequestId = false }: { includeRequestId?: boolean } = {},
) {
  expect(await screen.findByText(message)).toBeTruthy();

  if (includeRequestId) {
    await expectAdminSessionRequestIdNotice();
  }
}

async function setAdminSessionsSearch(query: string) {
  fireEvent.change(screen.getByLabelText("Search"), {
    target: { value: query },
  });
}

async function renderAdminSessionSourceGroupsPage({
  search,
  requests,
  riskFilter,
}: {
  search?: string;
  requests?: CloudAdminRequestLog[];
  riskFilter?: string;
} = {}) {
  await renderAdminSessionsPage();
  expect(await screen.findByText("Source groups")).toBeTruthy();

  if (search !== undefined) {
    await setAdminSessionsSearch(search);
  }

  if (riskFilter !== undefined) {
    if (!requests) {
      throw new Error("Missing admin session requests for source-group risk filter.");
    }
    await setAdminSessionSourceGroupRiskFilter(requests, riskFilter);
  }
}

async function expectAdminSessionSourceGroupsQuery(
  requests: CloudAdminRequestLog[],
  expectedParams: Record<string, string>,
) {
  await waitFor(() => {
    expect(
      hasAdminSessionSourceGroupsRequest(requests, expectedParams),
    ).toBe(true);
  });
}

async function findAdminSessionSourceGroupCard(title: string) {
  const sourceGroupCard = (await screen.findAllByTitle(title))
    .map((element) => element.closest("div.rounded-2xl"))
    .find(
      (card): card is HTMLElement =>
        Boolean(
          card &&
            within(card).queryByRole("button", {
              name: "View sessions",
            }),
        ),
    );
  expect(sourceGroupCard).toBeTruthy();
  return sourceGroupCard as HTMLElement;
}

async function focusAdminSessionSourceGroup(title = ADMIN_SESSION_FOCUSED_SOURCE_TITLE) {
  const sourceGroupCard = await findAdminSessionSourceGroupCard(title);
  fireEvent.click(
    within(sourceGroupCard).getByRole("button", {
      name: "View sessions",
    }),
  );
  expect(await screen.findByText("Viewing source group")).toBeTruthy();
  return sourceGroupCard;
}

async function renderFocusedAdminSessionSourceGroup({
  title = ADMIN_SESSION_FOCUSED_SOURCE_TITLE,
  showMatches = false,
}: {
  title?: string;
  showMatches?: boolean;
} = {}) {
  await renderAdminSessionSourceGroupsPage();
  const sourceGroupCard = await focusAdminSessionSourceGroup(title);
  if (showMatches) {
    await showAdminSessionCurrentSnapshotMatches();
  }
  return sourceGroupCard;
}

async function renderAdminSessionRiskQuickViewPage(
  requests: CloudAdminRequestLog[],
  {
    buttonName = "Watch risk",
    riskLevel = "watch",
  }: {
    buttonName?: string;
    riskLevel?: string;
  } = {},
) {
  await renderAdminSessionSourceGroupsPage();
  await switchAdminSessionRiskQuickView(requests, {
    buttonName,
    riskLevel,
  });
}

async function showAdminSessionCurrentSnapshotMatches() {
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Show matched sessions for Current snapshot",
    }),
  );
  expect(await screen.findByText("Matched sessions at this point")).toBeTruthy();
}

async function exportAdminSessionFocusedSourceSnapshot(sessionCount: number) {
  fireEvent.click(
    screen.getByRole("button", { name: "Export focused source snapshot" }),
  );
  expect(
    (
      await screen.findAllByText(
        `Downloaded focused source snapshot for ${sessionCount} session(s).`,
      )
    ).length,
      ).toBeGreaterThan(0);
}

async function expectAdminSessionFocusedSourceOverview({
  includeThresholds = false,
  includeCurrentRationale = false,
}: {
  includeThresholds?: boolean;
  includeCurrentRationale?: boolean;
} = {}) {
  expect(await screen.findByText("Risk timeline")).toBeTruthy();
  expect(await screen.findByText("Current snapshot")).toBeTruthy();

  if (includeThresholds) {
    expect(
      await screen.findByText("Watch threshold: 2+ active or 2+ revoked"),
    ).toBeTruthy();
    expect(
      await screen.findByText(
        "Critical threshold: 4+ active or any refresh reuse",
      ),
    ).toBeTruthy();
  }

  if (includeCurrentRationale) {
    expect(await screen.findByText("Current rationale")).toBeTruthy();
  }
}

async function expectAdminSessionFocusedSourceMatches(summary = "Showing 1-2 of 2") {
  expect((await screen.findAllByText("Active threshold match")).length).toBeGreaterThan(
    0,
  );
  expect((await screen.findAllByText(summary)).length).toBeGreaterThan(0);
}

async function expectAdminSessionFocusedSourceTimelineDetail({
  includeLastRefreshed = false,
  includeLatestSnapshot = false,
  includeSyncedLabel = false,
  includeWatchRisk = false,
}: {
  includeLastRefreshed?: boolean;
  includeLatestSnapshot?: boolean;
  includeSyncedLabel?: boolean;
  includeWatchRisk?: boolean;
} = {}) {
  expect(await screen.findByText("Timeline focus")).toBeTruthy();
  expect(await screen.findByText("Timeline audit detail")).toBeTruthy();
  expect(await screen.findByText("Focused source risk")).toBeTruthy();

  if (includeLastRefreshed) {
    expect(await screen.findByText("Last refreshed")).toBeTruthy();
  }
  if (includeLatestSnapshot) {
    expect(await screen.findByText("Latest timeline snapshot")).toBeTruthy();
  }
  if (includeSyncedLabel) {
    expect(await screen.findByText("Synced with Event view.")).toBeTruthy();
  }
  if (includeWatchRisk) {
    expect(await screen.findByText("Watch risk")).toBeTruthy();
  }
}

async function openAdminSessionTimelineSessionInList({
  requests,
  sourceKey,
  sessionId,
  status = "active",
  currentOnly = true,
}: {
  requests: CloudAdminRequestLog[];
  sourceKey: string;
  sessionId: string;
  status?: string;
  currentOnly?: boolean;
}) {
  fireEvent.click(
    await screen.findByRole("button", {
      name: `View ${sessionId} in sessions list`,
    }),
  );

  await waitFor(() => {
    expect((screen.getByLabelText("Search") as HTMLInputElement).value).toBe(sessionId);
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(status);
    expect((screen.getByLabelText("Scope") as HTMLSelectElement).value).toBe(
      currentOnly ? "current" : "all",
    );
    expect(
      hasAdminSessionsRequest(requests, {
        sourceKey,
        status,
        currentOnly: currentOnly ? "true" : "false",
        query: sessionId,
        page: "1",
        pageSize: "10",
      }),
    ).toBe(true);
  });
}

async function expectAdminSessionFocusedSourceOverviewQueries(
  requests: CloudAdminRequestLog[],
  sourceKey: string,
) {
  await waitFor(() => {
    expect(
      hasAdminSessionsRequest(requests, {
        sourceKey,
        page: "1",
        pageSize: "10",
      }),
    ).toBe(true);
    expect(
      hasAdminSessionSourceGroupsRequest(requests, {
        sourceKey,
        page: "1",
        pageSize: "6",
      }),
    ).toBe(true);
    expectAdminSessionSourceGroupSnapshotRequest(requests, sourceKey);
  });
}

async function renderFocusedAdminSessionOverview({
  requests,
  sourceKey,
  title = ADMIN_SESSION_FOCUSED_SOURCE_TITLE,
  overviewOptions = {
    includeThresholds: true,
    includeCurrentRationale: true,
  },
}: {
  requests: CloudAdminRequestLog[];
  sourceKey: string;
  title?: string;
  overviewOptions?: Parameters<typeof expectAdminSessionFocusedSourceOverview>[0];
}) {
  await renderFocusedAdminSessionSourceGroup({ title });
  await expectAdminSessionFocusedSourceOverview(overviewOptions);
  await showAdminSessionCurrentSnapshotMatches();
  await expectAdminSessionFocusedSourceMatches();
  await expectAdminSessionTimelineSummaryViews();
  await expectAdminSessionFocusedSourceOverviewQueries(requests, sourceKey);
}

async function renderFocusedAdminSessionTimelineSessionDetail({
  requests,
  sourceKey,
  sessionId = ADMIN_SESSION_FOCUSED_SOURCE_CURRENT_ID,
  detailOptions,
}: {
  requests: CloudAdminRequestLog[];
  sourceKey: string;
  sessionId?: string;
  detailOptions?: Parameters<typeof expectAdminSessionFocusedSourceTimelineDetail>[0];
}) {
  await renderFocusedAdminSessionSourceGroup({ showMatches: true });
  await openAdminSessionTimelineSessionInList({
    requests,
    sourceKey,
    sessionId,
  });
  await expectAdminSessionFocusedSourceTimelineDetail(detailOptions);
}

async function expectAdminSessionFocusedSourceSnapshotReceipt({
  receiptCount,
  sessionId,
  labels = ["Focused source snapshot"],
  repeatedEntries = 1,
}: {
  receiptCount: number;
  sessionId: string;
  labels?: string[];
  repeatedEntries?: number;
}) {
  const receiptsRegion = await expectAdminSessionFocusedSourceReceiptsSummary({
    receiptCount,
    labels,
  });
  expectAdminSessionFocusedSourceReceiptContext(receiptsRegion, {
    sessionId,
    repeatedEntries,
  });
  return receiptsRegion;
}

async function expectAdminSessionFocusedSourceReceiptsSummary({
  receiptCount,
  labels = ["Focused source snapshot"],
}: {
  receiptCount: number;
  labels?: string[];
}) {
  expect(await screen.findByText("Recent operation receipts")).toBeTruthy();
  expect(
    await screen.findByText(
      `Showing the latest ${receiptCount} of up to 3 receipt(s) for this focused session.`,
    ),
  ).toBeTruthy();
  for (const label of labels) {
    expect(await screen.findByText(label)).toBeTruthy();
  }
  return screen.getByRole("region", {
    name: "Recent operation receipts",
  });
}

function expectAdminSessionFocusedSourceReceiptContext(
  receiptsRegion: HTMLElement,
  {
    sessionId,
    repeatedEntries = 1,
    sourceIp = ADMIN_SESSION_FOCUSED_SOURCE_IP,
    sourceTitle = ADMIN_SESSION_FOCUSED_SOURCE_TITLE,
  }: {
    sessionId: string;
    repeatedEntries?: number;
    sourceIp?: string;
    sourceTitle?: string;
  },
) {
  expect(within(receiptsRegion).getAllByText("Session context")).toHaveLength(
    repeatedEntries,
  );
  expect(within(receiptsRegion).getAllByText(sessionId).length).toBeGreaterThan(0);
  expect(within(receiptsRegion).getAllByText("Source context")).toHaveLength(
    repeatedEntries,
  );
  expect(within(receiptsRegion).getAllByText(sourceIp).length).toBeGreaterThanOrEqual(
    repeatedEntries,
  );
  expect(within(receiptsRegion).getAllByText("Request id")).toHaveLength(
    repeatedEntries,
  );
  expect(
    within(receiptsRegion).getAllByText(/^mock-request-/).length,
  ).toBeGreaterThanOrEqual(repeatedEntries);
  expect(
    within(receiptsRegion).getAllByTitle(sourceTitle).length,
  ).toBeGreaterThanOrEqual(repeatedEntries);
}

function clearAdminSessionReceipts() {
  fireEvent.click(screen.getByRole("button", { name: "Clear receipts" }));
}

async function clearAdminSessionSourceFocusAndExpectSummary(summary = "Showing 1-3 of 3") {
  fireEvent.click(screen.getByRole("button", { name: "Clear source focus" }));
  await waitFor(() => {
    expect(screen.queryByText("Viewing source group")).toBeNull();
  });
  expect((await screen.findAllByText(summary)).length).toBeGreaterThan(0);
}

async function clearAdminSessionReceiptsAndExpectClosed() {
  clearAdminSessionReceipts();
  await waitFor(() => {
    expect(screen.queryByText("Recent operation receipts")).toBeNull();
  });
}

function installAdminSessionSourceGroupsMock({
  adminSessions,
  includeDefaultAdminSessions = false,
}: {
  adminSessions: typeof mockAdminSessions;
  includeDefaultAdminSessions?: boolean;
}) {
  return installCloudAdminApiMock({
    adminSessions: includeDefaultAdminSessions
      ? [...mockAdminSessions, ...adminSessions]
      : adminSessions,
  });
}

async function renderInstalledAdminSessionSourceGroupsPage({
  adminSessions,
  includeDefaultAdminSessions = false,
  search,
  riskFilter,
}: {
  adminSessions: typeof mockAdminSessions;
  includeDefaultAdminSessions?: boolean;
  search?: string;
  riskFilter?: string;
}) {
  const { requests } = installAdminSessionSourceGroupsMock({
    adminSessions,
    includeDefaultAdminSessions,
  });
  await renderAdminSessionSourceGroupsPage({
    requests,
    search,
    riskFilter,
  });
  return { requests };
}

async function renderInstalledAdminSessionRiskQuickViewPage({
  adminSessions,
  buttonName = "Watch risk",
  riskLevel = "watch",
}: {
  adminSessions: typeof mockAdminSessions;
  buttonName?: string;
  riskLevel?: string;
}) {
  const { requests } = await renderInstalledAdminSessionSourceGroupsPage({
    adminSessions,
  });
  await switchAdminSessionRiskQuickView(requests, {
    buttonName,
    riskLevel,
  });
  return { requests };
}

async function expectAdminSessionDownloadNotice(message: ScreenTextMatcher) {
  expect(await screen.findByText(message)).toBeTruthy();
  await expectAdminSessionRequestIdNotice();
}

async function exportAdminSessionDownloadArtifact({
  buttonName,
  message,
}: {
  buttonName: string;
  message: ScreenTextMatcher;
}) {
  fireEvent.click(screen.getByRole("button", { name: buttonName }));
  await expectAdminSessionDownloadNotice(message);
}

async function exportAdminSessionSourceGroupArtifact({
  buttonName,
  message,
  requests,
  sourceKey,
  includeRequestId = true,
}: {
  buttonName: string;
  message: ScreenTextMatcher;
  requests: CloudAdminRequestLog[];
  sourceKey: string;
  includeRequestId?: boolean;
}) {
  fireEvent.click(screen.getByRole("button", { name: buttonName }));
  expect(await screen.findByText(message)).toBeTruthy();
  if (includeRequestId) {
    await expectAdminSessionRequestIdNotice();
  }
  expectAdminSessionSourceGroupSnapshotRequest(requests, sourceKey);
}

async function exportAdminSessionSourceGroupScenario({
  adminSessions,
  sourceKey,
  buttonName,
  message,
  includeRequestId = true,
  search,
  title,
  beforeExport,
}: {
  adminSessions: typeof mockAdminSessions;
  sourceKey: string;
  buttonName: string;
  message: ScreenTextMatcher;
  includeRequestId?: boolean;
  search?: string;
  title?: string;
  beforeExport?: () => Promise<void> | void;
}) {
  const { requests } = installAdminSessionSourceGroupsMock({
    adminSessions,
  });

  if (title) {
    await renderFocusedAdminSessionSourceGroup({ title });
  } else {
    await renderAdminSessionSourceGroupsPage({ requests, search });
  }

  await beforeExport?.();

  await exportAdminSessionSourceGroupArtifact({
    buttonName,
    message,
    requests,
    sourceKey,
    includeRequestId,
  });
}

async function switchAdminSessionRiskQuickView(
  requests: CloudAdminRequestLog[],
  {
    buttonName = "Watch risk",
    riskLevel = "watch",
  }: {
    buttonName?: string;
    riskLevel?: string;
  } = {},
) {
  fireEvent.click(screen.getByRole("button", { name: buttonName }));
  await expectAdminSessionSourceGroupsQuery(requests, {
    riskLevel,
    page: "1",
    pageSize: "6",
  });
}

async function setAdminSessionSourceGroupRiskFilter(
  requests: CloudAdminRequestLog[],
  riskLevel: string,
) {
  fireEvent.change(screen.getByLabelText("Source risk"), {
    target: { value: riskLevel },
  });
  await expectAdminSessionSourceGroupsQuery(requests, {
    riskLevel,
    page: "1",
    pageSize: "6",
  });
}

async function setAdminSessionSourceGroupSortAndDirection(
  requests: CloudAdminRequestLog[],
  {
    sortBy,
    sortDirection,
    page = "1",
    pageSize = "6",
  }: {
    sortBy: string;
    sortDirection: string;
    page?: string;
    pageSize?: string;
  },
) {
  fireEvent.change(screen.getByLabelText("Source sort"), {
    target: { value: sortBy },
  });
  fireEvent.change(screen.getByLabelText("Source direction"), {
    target: { value: sortDirection },
  });
  await expectAdminSessionSourceGroupsQuery(requests, {
    sortBy,
    sortDirection,
    page,
    pageSize,
  });
}

function expectAdminSessionSourceGroupSnapshotRequest(
  requests: CloudAdminRequestLog[],
  sourceKey: string,
) {
  expect(
    requests.some(
      (entry) =>
        entry.url === "POST /admin/cloud/admin-session-source-groups/snapshot" &&
        entry.body?.sourceKey === sourceKey,
    ),
  ).toBe(true);
}

function expectAdminSessionSourceGroupRevokeRequest(
  requests: CloudAdminRequestLog[],
  {
    body,
    absentKeys = [],
  }: {
    body: Record<string, unknown>;
    absentKeys?: string[];
  },
) {
  expect(
    requests.some((entry) => {
      if (entry.url !== "POST /admin/cloud/admin-session-source-groups/revoke") {
        return false;
      }

      if (
        !Object.entries(body).every(
          ([key, value]) =>
            (entry.body as Record<string, unknown> | undefined)?.[key] === value,
        )
      ) {
        return false;
      }

      return absentKeys.every(
        (key) => !Object.prototype.hasOwnProperty.call(entry.body ?? {}, key),
      );
    }),
  ).toBe(true);
}

function expectAdminSessionRiskSnapshotRequest(
  requests: CloudAdminRequestLog[],
  riskLevel = "watch",
) {
  expect(
    requests.some(
      (entry) =>
        entry.url ===
          "POST /admin/cloud/admin-session-source-groups/risk-snapshot" &&
        entry.body?.riskLevel === riskLevel,
    ),
  ).toBe(true);
}

function expectAdminSessionSourceGroupRiskRevokeRequest(
  requests: CloudAdminRequestLog[],
  riskLevel = "watch",
) {
  expect(
    requests.some(
      (entry) =>
        entry.url === "POST /admin/cloud/admin-session-source-groups/revoke-risk" &&
        entry.body?.riskLevel === riskLevel,
    ),
  ).toBe(true);
}

async function exportAdminSessionRiskQuickViewArtifact(
  requests: CloudAdminRequestLog[],
  {
    buttonName,
    message,
    quickViewButtonName = "Watch risk",
    riskLevel = "watch",
  }: {
    buttonName: string;
    message: string;
    quickViewButtonName?: string;
    riskLevel?: string;
  },
) {
  await switchAdminSessionRiskQuickView(requests, {
    buttonName: quickViewButtonName,
    riskLevel,
  });
  await exportAdminSessionDownloadArtifact({
    buttonName,
    message,
  });
  expectAdminSessionRiskSnapshotRequest(requests, riskLevel);
}

async function exportAdminSessionRiskQuickViewScenario({
  adminSessions,
  buttonName,
  message,
  quickViewButtonName = "Watch risk",
  riskLevel = "watch",
}: {
  adminSessions: typeof mockAdminSessions;
  buttonName: string;
  message: string;
  quickViewButtonName?: string;
  riskLevel?: string;
}) {
  const { requests } = await renderInstalledAdminSessionRiskQuickViewPage({
    adminSessions,
    buttonName: quickViewButtonName,
    riskLevel,
  });
  await exportAdminSessionDownloadArtifact({
    buttonName,
    message,
  });
  expectAdminSessionRiskSnapshotRequest(requests, riskLevel);
}

async function expectAdminSessionTimelineSummaryViews() {
  fireEvent.click(screen.getByRole("button", { name: "Daily summary" }));
  expect(
    await screen.findByText(/\d+ event point\(s\) grouped into \d+ day\(s\)\./),
  ).toBeTruthy();
  expect(
    (await screen.findAllByText(/Daily summary of \d+ timeline point\(s\)/))
      .length,
  ).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("button", { name: "Weekly summary" }));
  expect(
    await screen.findByText(/\d+ event point\(s\) grouped into \d+ week\(s\)\./),
  ).toBeTruthy();
  expect(
    (await screen.findAllByText(/Weekly summary of \d+ timeline point\(s\)/))
      .length,
  ).toBeGreaterThan(0);
}

async function selectAdminSessionsForBulkAction(sessionIds: string[]) {
  for (const sessionId of sessionIds) {
    fireEvent.click(screen.getByLabelText(`Select ${sessionId}`));
  }
}

async function expectAdminSessionsBulkSelectionSummary(count: number) {
  expect(
    await screen.findByText(`${count} active session(s) selected on this page.`),
  ).toBeTruthy();
}

async function openAdminSessionsBulkRevokeDialog({
  sessionIds,
  selectedCount = sessionIds.length,
}: {
  sessionIds: string[];
  selectedCount?: number;
}) {
  await selectAdminSessionsForBulkAction(sessionIds);
  await expectAdminSessionsBulkSelectionSummary(selectedCount);

  fireEvent.click(screen.getByRole("button", { name: "Revoke selected" }));
  expect(
    await screen.findByText("Revoke selected admin sessions?"),
  ).toBeTruthy();
}

function confirmAdminSessionsBulkRevoke() {
  fireEvent.click(screen.getAllByRole("button", { name: "Revoke selected" })[1]);
}

async function openAdminSessionRevokeDialog({
  buttonIndex = 1,
  trigger,
}: {
  buttonIndex?: number;
  trigger?: HTMLElement;
} = {}) {
  if (trigger) {
    fireEvent.click(trigger);
  } else {
    fireEvent.click(screen.getAllByRole("button", { name: "Revoke" })[buttonIndex]);
  }
  expect(await screen.findByText("Revoke admin session?")).toBeTruthy();
}

function confirmAdminSessionRevoke() {
  fireEvent.click(screen.getByRole("button", { name: "Revoke session" }));
}

async function openAdminSessionsFilteredRevokeDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Revoke all matching" }));
  expect(
    await screen.findByText("Revoke all matching admin sessions?"),
  ).toBeTruthy();
}

function confirmAdminSessionsFilteredRevoke() {
  fireEvent.click(screen.getByRole("button", { name: "Revoke matching sessions" }));
}

function expectAdminSessionsDialogClosed(title: string) {
  expect(screen.queryByText(title)).toBeNull();
}

async function openAdminSessionSourceGroupRevokeDialog(trigger: HTMLElement) {
  fireEvent.click(trigger);
  expect(await screen.findByText("Revoke source group?")).toBeTruthy();
}

function confirmAdminSessionSourceGroupRevoke(buttonIndex = -1) {
  fireEvent.click(
    screen.getAllByRole("button", { name: "Revoke group" }).at(
      buttonIndex,
    ) as HTMLElement,
  );
}

async function openAdminSessionRiskGroupRevokeDialog() {
  fireEvent.click(
    screen.getByRole("button", { name: "Revoke matching risk groups" }),
  );
  expect(await screen.findByText("Revoke matching risk groups?")).toBeTruthy();
}

function confirmAdminSessionRiskGroupRevoke() {
  fireEvent.click(screen.getByRole("button", { name: "Revoke risk groups" }));
}

async function revokeAdminSessionAndAssert({
  requests,
  sessionId,
  buttonIndex,
  trigger,
  successMessage,
  errorMessage,
  includeRequestId = false,
  beforeConfirm,
  afterSuccess,
}: {
  requests: CloudAdminRequestLog[];
  sessionId: string;
  buttonIndex?: number;
  trigger?: HTMLElement;
  successMessage?: string;
  errorMessage?: string;
  includeRequestId?: boolean;
  beforeConfirm?: () => Promise<void> | void;
  afterSuccess?: () => Promise<void> | void;
}) {
  await openAdminSessionRevokeDialog({ buttonIndex, trigger });
  await beforeConfirm?.();
  confirmAdminSessionRevoke();

  if (errorMessage) {
    await expectAdminSessionsErrorNotice(errorMessage, {
      dialogTitle: "Revoke admin session?",
    });
  } else if (successMessage) {
    await expectAdminSessionsRevokeNotice(successMessage, {
      includeRequestId,
    });
    await afterSuccess?.();
  }

  expectAdminSessionRevokeRequest(requests, sessionId);
}

async function revokeAdminSessionsBulkAndAssert({
  requests,
  sessionIds,
  successMessage,
  errorMessage,
  includeRequestId = false,
  selectedCount = sessionIds.length,
  expectedCount,
  requiredIds = sessionIds,
  excludedIds = [],
}: {
  requests: CloudAdminRequestLog[];
  sessionIds: string[];
  successMessage?: string;
  errorMessage?: string;
  includeRequestId?: boolean;
  selectedCount?: number;
  expectedCount?: number;
  requiredIds?: string[];
  excludedIds?: string[];
}) {
  await openAdminSessionsBulkRevokeDialog({
    sessionIds,
    selectedCount,
  });
  confirmAdminSessionsBulkRevoke();

  if (errorMessage) {
    await expectAdminSessionsErrorNotice(errorMessage, {
      dialogTitle: "Revoke selected admin sessions?",
    });
  } else if (successMessage) {
    await expectAdminSessionsRevokeNotice(successMessage, {
      includeRequestId,
    });
  }

  expectAdminSessionsBulkRevokeRequest(requests, {
    expectedCount,
    requiredIds,
    excludedIds,
  });
}

async function revokeAdminSessionsFilteredAndAssert({
  requests,
  query,
  successMessage,
  errorMessage,
  includeRequestId = false,
  body = {},
}: {
  requests: CloudAdminRequestLog[];
  query: string;
  successMessage?: string;
  errorMessage?: string;
  includeRequestId?: boolean;
  body?: Record<string, unknown>;
}) {
  await openAdminSessionsFilteredRevokeDialog();
  confirmAdminSessionsFilteredRevoke();

  if (errorMessage) {
    await expectAdminSessionsErrorNotice(errorMessage, {
      dialogTitle: "Revoke all matching admin sessions?",
    });
  } else if (successMessage) {
    await expectAdminSessionsRevokeNotice(successMessage, {
      includeRequestId,
    });
  }

  expectAdminSessionsFilteredRevokeRequest(requests, {
    query,
    body,
  });
}

async function revokeAdminSessionSourceGroupAndAssert({
  requests,
  trigger,
  message,
  requestBody,
  absentKeys = [],
  includeRequestId = false,
  confirmButtonIndex = -1,
}: {
  requests: CloudAdminRequestLog[];
  trigger: HTMLElement;
  message: string;
  requestBody: Record<string, unknown>;
  absentKeys?: string[];
  includeRequestId?: boolean;
  confirmButtonIndex?: number;
}) {
  await openAdminSessionSourceGroupRevokeDialog(trigger);
  confirmAdminSessionSourceGroupRevoke(confirmButtonIndex);
  await expectAdminSessionSourceGroupNotice(message, {
    includeRequestId,
  });
  expectAdminSessionSourceGroupRevokeRequest(requests, {
    body: requestBody,
    absentKeys,
  });
}

async function revokeAdminSessionRiskGroupAndAssert(
  requests: CloudAdminRequestLog[],
  {
    message,
    riskLevel = "watch",
    includeRequestId = true,
  }: {
    message: string;
    riskLevel?: string;
    includeRequestId?: boolean;
  },
) {
  await openAdminSessionRiskGroupRevokeDialog();
  confirmAdminSessionRiskGroupRevoke();
  await expectAdminSessionSourceGroupNotice(message, {
    includeRequestId,
  });
  expectAdminSessionSourceGroupRiskRevokeRequest(requests, riskLevel);
}

describe("cloud-console interactions", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    installCloudAdminApiMock();
    Object.defineProperty(window.URL, "createObjectURL", {
      value: vi.fn(() => "blob:cloud-console-test"),
      configurable: true,
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      value: vi.fn(),
      configurable: true,
    });
    Object.defineProperty(HTMLAnchorElement.prototype, "click", {
      value: vi.fn(),
      configurable: true,
    });
    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("locks endpoint edits for rejected requests and only submits allowed fields", async () => {
    const { requests } = installCloudAdminApiMock();
    renderRoute("/requests/request-1");

    expect(await screen.findByText("Request guidance")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "rejected" },
    });

    const apiInput = screen.getByLabelText("World API base URL");
    const adminInput = screen.getByLabelText("World admin URL");
    const noteInput = screen.getByLabelText("Ops note");
    const saveButton = screen.getByRole("button", { name: "Save request" });

    expect(apiInput).toHaveProperty("disabled", true);
    expect(adminInput).toHaveProperty("disabled", true);

    fireEvent.change(noteInput, {
      target: { value: "" },
    });

    expect(
      await screen.findByText(
        "Rejected or disabled requests need an ops note.",
      ),
    ).toBeTruthy();
    expect(saveButton).toHaveProperty("disabled", true);

    fireEvent.change(noteInput, {
      target: { value: "Rejected after manual verification." },
    });

    await waitFor(() => {
      expect(saveButton).toHaveProperty("disabled", false);
    });

    fireEvent.click(saveButton);

    expect(await screen.findByText("World request saved.")).toBeTruthy();
    expect(await screen.findByText("Request id")).toBeTruthy();
    expect(await screen.findByText(/^mock-request-/)).toBeTruthy();

    const patchRequest = requests.find(
      (entry) => entry.url === "PATCH /admin/cloud/world-requests/request-1",
    );
    expect(patchRequest?.body?.status).toBe("rejected");
    expect(patchRequest?.body?.note).toBe(
      "Rejected after manual verification.",
    );
    expect(patchRequest?.body).not.toHaveProperty("apiBaseUrl");
    expect(patchRequest?.body).not.toHaveProperty("adminUrl");
  });

  it("shows notice errors when saving request details fails", async () => {
    const { requests } = installCloudAdminApiMock({
      updateRequestError: "Request save failed.",
    });
    renderRoute("/requests/request-1");

    expect(await screen.findByText("Request guidance")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("World name"), {
      target: { value: "Broken Request World" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save request" }));

    expect(await screen.findByText("Request save failed.")).toBeTruthy();
    expect(await screen.findByText("Request id")).toBeTruthy();
    expect(await screen.findByText(/^mock-request-/)).toBeTruthy();
    expect(
      requests.some(
        (entry) => entry.url === "PATCH /admin/cloud/world-requests/request-1",
      ),
    ).toBe(true);
  });

  it("shows request ids in error blocks for failed request loads", async () => {
    installCloudAdminApiMock();
    renderRoute("/requests/missing-request");

    expect(await screen.findByText("Not found")).toBeTruthy();
    expect(await screen.findByText("Request id")).toBeTruthy();
    expect(await screen.findByText(/^mock-request-/)).toBeTruthy();
  });

  it("filters requests by projected world status and desired state", async () => {
    installCloudAdminApiMock({
      requests: [
        {
          id: "request-1",
          worldName: "Queued Approval Request",
          status: "pending",
          displayStatus: "世界申请审核中。",
          failureReason: "Still waiting for review.",
          projectedWorldStatus: "queued",
          projectedDesiredState: "running",
        },
        {
          id: "request-2",
          worldName: "Ready Delivery Request",
          status: "active",
          displayStatus: "人工交付的世界已准备好。",
          failureReason: null,
          projectedWorldStatus: "ready",
          projectedDesiredState: "running",
        },
        {
          id: "request-3",
          worldName: "Disabled Request",
          status: "disabled",
          displayStatus: "世界当前已被停用。",
          failureReason: "Paused by ops.",
          projectedWorldStatus: "disabled",
          projectedDesiredState: "sleeping",
        },
      ],
    });
    renderRoute("/requests");

    expect(
      (await screen.findByRole("button", { name: "All" })).getAttribute(
        "data-tone",
      ),
    ).toBe("neutral");
    expect(
      screen.getByRole("button", { name: "Pending" }).getAttribute("data-tone"),
    ).toBe("warning");
    expect(
      screen.getByRole("button", { name: "Active" }).getAttribute("data-tone"),
    ).toBe("success");
    expect(
      screen
        .getByRole("button", { name: "Disabled" })
        .getAttribute("data-tone"),
    ).toBe("danger");

    const queuedApprovalRow = (
      await screen.findByText("Queued Approval Request")
    ).closest("tr");
    const readyDeliveryRow = (
      await screen.findByText("Ready Delivery Request")
    ).closest("tr");
    const disabledRequestRow = (
      await screen.findByText("Disabled Request")
    ).closest("tr");
    const queuedApprovalCells = within(
      queuedApprovalRow as HTMLElement,
    ).getAllByRole("cell");
    const readyDeliveryCells = within(
      readyDeliveryRow as HTMLElement,
    ).getAllByRole("cell");
    const disabledRequestCells = within(
      disabledRequestRow as HTMLElement,
    ).getAllByRole("cell");

    expect(
      within(queuedApprovalCells[2] as HTMLElement)
        .getByText("Pending")
        .getAttribute("data-tone"),
    ).toBe("warning");
    expect(
      within(readyDeliveryCells[2] as HTMLElement)
        .getByText("Active")
        .getAttribute("data-tone"),
    ).toBe("success");
    expect(
      within(disabledRequestCells[2] as HTMLElement)
        .getByText("Disabled")
        ?.getAttribute("data-tone"),
    ).toBe("danger");
    expect(
      within(queuedApprovalCells[3] as HTMLElement)
        .getByText("Queued")
        .getAttribute("data-tone"),
    ).toBe("warning");
    expect(
      within(queuedApprovalCells[3] as HTMLElement)
        .getAllByText("Running")
        .find((element) => element.hasAttribute("data-tone"))
        ?.getAttribute("data-tone"),
    ).toBe("success");
    expect(
      within(readyDeliveryCells[3] as HTMLElement)
        .getByText("Ready")
        .getAttribute("data-tone"),
    ).toBe("success");
    expect(
      within(disabledRequestCells[3] as HTMLElement)
        .getByText("Disabled")
        ?.getAttribute("data-tone"),
    ).toBe("danger");
    expect(
      within(disabledRequestCells[3] as HTMLElement)
        .getByText("Sleeping")
        .getAttribute("data-tone"),
    ).toBe("neutral");

    fireEvent.change(screen.getByLabelText("Projected world status"), {
      target: { value: "disabled" },
    });
    fireEvent.change(screen.getByLabelText("Projected desired state"), {
      target: { value: "sleeping" },
    });

    expect(await screen.findByText("Disabled Request")).toBeTruthy();
    expect(screen.queryByText("Queued Approval Request")).toBeNull();
    expect(screen.queryByText("Ready Delivery Request")).toBeNull();

    fireEvent.change(screen.getByLabelText("Projected desired state"), {
      target: { value: "running" },
    });

    expect(await screen.findByText("No requests match this filter.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Projected world status"), {
      target: { value: "ready" },
    });

    expect(await screen.findByText("Ready Delivery Request")).toBeTruthy();
    expect(screen.queryByText("Disabled Request")).toBeNull();
  });

  it("filters requests by the local request search query", async () => {
    installCloudAdminApiMock({
      requests: [
        {
          id: "request-1",
          phone: "+8613800138000",
          worldName: "Searchable Target Request",
          status: "pending",
          displayStatus: "Waiting for runtime reconciliation.",
          failureReason: "Runtime follow-up pending.",
          projectedWorldStatus: "queued",
          projectedDesiredState: "running",
        },
        {
          id: "request-2",
          phone: "+8613800138999",
          worldName: "Other Request",
          status: "active",
          displayStatus: "Already delivered.",
          failureReason: null,
          projectedWorldStatus: "ready",
          projectedDesiredState: "running",
        },
      ],
    });
    renderRoute("/requests");

    expect(await screen.findByText("Searchable Target Request")).toBeTruthy();
    expect(await screen.findByText("Other Request")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Request search"), {
      target: { value: "+8613800138000" },
    });

    expect(await screen.findByText("Searchable Target Request")).toBeTruthy();
    expect(screen.queryByText("Other Request")).toBeNull();

    fireEvent.change(screen.getByLabelText("Request search"), {
      target: { value: "missing-request" },
    });

    expect(await screen.findByText("No requests match this filter.")).toBeTruthy();
  });

  it("filters worlds by the local world search query", async () => {
    renderRoute("/worlds");

    expect(await screen.findByText("Managed worlds")).toBeTruthy();
    expect(
      (await screen.findAllByRole("link", { name: "Mock World" })).length,
    ).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("World search"), {
      target: { value: "missing-world" },
    });

    expect(await screen.findByText("No worlds match this filter.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("World search"), {
      target: { value: "+8613800138000" },
    });

    expect(
      (await screen.findAllByRole("link", { name: "Mock World" })).length,
    ).toBeGreaterThan(0);
  });

  it("refreshes the admin session from a stored refresh token", async () => {
    const { requests } = installCloudAdminApiMock();
    renderRoute("/", {
      adminAccessToken: "expired-admin-access-token",
      adminAccessTokenExpiresAt: "2026-04-19T00:00:00.000Z",
      adminRefreshToken: "test-admin-refresh-token",
      adminRefreshTokenExpiresAt: "2026-04-27T01:00:00.000Z",
    });

    expect(await screen.findByText("Fleet Dashboard")).toBeTruthy();
    expect(
      requests.some((entry) => entry.url === "POST /admin/cloud/auth/refresh"),
    ).toBe(true);
    expect(
      requests.some((entry) => entry.url === "POST /admin/cloud/auth/token"),
    ).toBe(false);
  });

  it("lists admin sessions and revokes a non-current session", async () => {
    const { requests } = installCloudAdminApiMock();
    await renderAdminSessionsPage();
    expect(await screen.findByText("Current")).toBeTruthy();
    expect((await screen.findAllByText("198.51.100.10")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Cloud Console/1.0")).length).toBeGreaterThan(0);
    expect(
      (
        await screen.findAllByText("Manual revoke", { selector: "div" })
      ).length,
    ).toBeGreaterThan(0);
    expect(
      await screen.findByText(
        "By 11111111-1111-4111-8111-111111111111",
      ),
    ).toBeTruthy();

    await revokeAdminSessionAndAssert({
      requests,
      sessionId: "22222222-2222-4222-8222-222222222222",
      successMessage: "Admin session revoked.",
    });
  });

  it("bulk revokes selected admin sessions on the current page", async () => {
    const { requests } = installCloudAdminApiMock();
    await renderAdminSessionsPage();

    await revokeAdminSessionsBulkAndAssert({
      requests,
      sessionIds: [ADMIN_SESSION_CURRENT_ID, ADMIN_SESSION_SECONDARY_ID],
      successMessage:
        "Revoked 2 selected session(s). The current console session was included, so the next admin request will re-issue a short-lived token.",
    });
  });

  it("bulk revokes active admin sessions matching the current filters", async () => {
    const { requests } = installCloudAdminApiMock();
    await renderAdminSessionsPage();

    await setAdminSessionsSearch("Mobile Safari");

    expect(await screen.findAllByText("Showing 1-1 of 1")).toHaveLength(2);

    await revokeAdminSessionsFilteredAndAssert({
      requests,
      query: "Mobile Safari",
      successMessage: "Revoked 1 matching active session(s).",
      includeRequestId: true,
    });
  });

  it("revokes a matching admin session source group", async () => {
    const {
      adminSessions: sharedSourceSessions,
      sourceKey: expectedSourceKey,
    } = buildAdminSessionSourceScenario({
      issuedFromIp: "203.0.113.88",
      issuedUserAgent: "Shared Source Browser",
      sourceSessions: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          isCurrent: false,
          createdAt: "2026-04-20T00:10:00.000Z",
          updatedAt: "2026-04-20T00:20:00.000Z",
          lastUsedAt: "2026-04-20T00:20:00.000Z",
          expiresAt: "2026-04-27T01:00:00.000Z",
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          isCurrent: false,
          createdAt: "2026-04-20T00:15:00.000Z",
          updatedAt: "2026-04-20T00:25:00.000Z",
          lastUsedAt: "2026-04-20T00:25:00.000Z",
          expiresAt: "2026-04-27T02:00:00.000Z",
        },
      ],
    });
    const { requests } = await renderInstalledAdminSessionSourceGroupsPage({
      adminSessions: sharedSourceSessions,
      includeDefaultAdminSessions: true,
      search: "Shared Source Browser",
    });

    expect(await screen.findAllByText("2 active")).toHaveLength(1);
    expect(await screen.findAllByText("2 total")).toHaveLength(1);

    await revokeAdminSessionSourceGroupAndAssert({
      requests,
      trigger: screen.getByRole("button", { name: "Revoke group" }),
      message: "Revoked 2 matching active session(s) in the selected source group.",
      requestBody: {
        query: "Shared Source Browser",
        sourceKey: expectedSourceKey,
      },
      confirmButtonIndex: 1,
    });
  });

  it("issues source-group sorting and pagination query params", async () => {
    const generatedSessions = buildAdminSessionGeneratedQuerySessions({
      count: 7,
      idSuffix: "6666-4666-8666-666666666666",
      issuedFromIpPrefix: "203.0.113.",
      issuedFromIpStart: 140,
      issuedUserAgentPrefix: "Source Group Query",
      createdAt: (index) =>
        new Date(Date.UTC(2026, 3, 20, 0, index, 0)).toISOString(),
      updatedAt: (index) =>
        new Date(Date.UTC(2026, 3, 20, 1, index, 0)).toISOString(),
      lastUsedAt: (index) =>
        new Date(Date.UTC(2026, 3, 20, 2, index, 0)).toISOString(),
      expiresAt: (index) =>
        new Date(Date.UTC(2026, 3, 21, 0, index, 0)).toISOString(),
    });
    const { requests } = installCloudAdminApiMock({
      adminSessions: generatedSessions,
    });
    await renderAdminSessionSourceGroupsPage();
    await expectAdminSessionSourceGroupsQuery(requests, {
      sortBy: "activeSessions",
      sortDirection: "desc",
      page: "1",
      pageSize: "6",
    });

    await setAdminSessionSourceGroupSortAndDirection(requests, {
      sortBy: "latestCreatedAt",
      sortDirection: "asc",
    });

    fireEvent.click(screen.getByRole("button", { name: "Next groups" }));

    expect(
      (await screen.findAllByText("Showing 7-7 of 7 groups")).length,
    ).toBeGreaterThan(0);
    await expectAdminSessionSourceGroupsQuery(requests, {
      sortBy: "latestCreatedAt",
      sortDirection: "asc",
      page: "2",
      pageSize: "6",
    });
  });

  it("focuses sessions on a selected source group and can clear the focus", async () => {
    await renderInstalledFocusedAdminSessionOverview({
      includeOtherSessions: true,
    });

    await clearAdminSessionSourceFocusAndExpectSummary();
  });

  it("can jump from a matched timeline session into the admin session list filters", async () => {
    const { requests, sourceKey: expectedSourceKey } =
      await renderInstalledFocusedAdminSessionTimelineSessionDetail({
        includeOtherSessions: true,
        detailOptions: {
          includeLastRefreshed: true,
          includeLatestSnapshot: true,
          includeSyncedLabel: true,
          includeWatchRisk: true,
        },
      });
    expect((await screen.findAllByText("Showing 1-1 of 1")).length).toBeGreaterThan(0);

    await exportAdminSessionFocusedSourceSnapshot(1);
    await expectAdminSessionFocusedSourceSnapshotReceipt({
      receiptCount: 1,
      sessionId: ADMIN_SESSION_FOCUSED_SOURCE_CURRENT_ID,
    });
  });

  it("can revoke the focused source group from the highlighted session detail row", async () => {
    const { requests, sourceKey: expectedSourceKey } =
      await renderInstalledFocusedAdminSessionTimelineSessionDetail();

    await revokeAdminSessionSourceGroupAndAssert({
      requests,
      trigger: screen.getByRole("button", { name: "Revoke focused source" }),
      message:
        "Revoked 2 matching active session(s) in the selected source group. The current console session was included, so the next admin request will re-issue a short-lived token.",
      requestBody: {
        sourceKey: expectedSourceKey,
        status: "active",
      },
      absentKeys: ["query", "currentOnly"],
    });
  });

  it("can open revoke confirmation directly from a matched timeline session", async () => {
    const { requests } = await renderInstalledFocusedAdminSessionSourceGroup({
      showMatches: true,
    });

    await revokeAdminSessionAndAssert({
      requests,
      sessionId: ADMIN_SESSION_FOCUSED_SOURCE_SECONDARY_ID,
      trigger: await screen.findByRole("button", {
        name: `Revoke ${ADMIN_SESSION_FOCUSED_SOURCE_SECONDARY_ID} from timeline`,
      }),
      successMessage: "Admin session revoked.",
      beforeConfirm: async () => {
        await expectAdminSessionFocusedSourceTimelineDetail();
        await exportAdminSessionFocusedSourceSnapshot(2);
      },
      afterSuccess: async () => {
        await expectAdminSessionFocusedSourceSnapshotReceipt({
          receiptCount: 2,
          sessionId: ADMIN_SESSION_FOCUSED_SOURCE_SECONDARY_ID,
          labels: ["Focused source snapshot", "Session revoke"],
          repeatedEntries: 2,
        });

        await clearAdminSessionReceiptsAndExpectClosed();
      },
    });
  });

  it("exports the focused source-group risk timeline as CSV", async () => {
    const { adminSessions: groupedSessions, sourceKey: expectedSourceKey } =
      buildAdminSessionSourceScenario({
        issuedFromIp: "203.0.113.189",
        issuedUserAgent: "Timeline Source Browser",
        sourceSessions: [
          {
            template: mockAdminSessions[0],
            id: "a1111111-1111-4111-8111-111111111111",
            isCurrent: true,
            status: "active",
          },
          {
            id: "a2222222-2222-4222-8222-222222222222",
            isCurrent: false,
            status: "active",
          },
        ],
      });

    await exportAdminSessionSourceGroupScenario({
      adminSessions: groupedSessions,
      sourceKey: expectedSourceKey,
      buttonName: "Export timeline CSV",
      message: /Downloaded weekly risk timeline CSV for \d+ point\(s\)\./,
      includeRequestId: false,
      title: "Timeline Source Browser",
      beforeExport: async () => {
        await expectAdminSessionFocusedSourceOverview();
        await expectAdminSessionTimelineSummaryViews();
      },
    });
  });

  it("exports an admin session source-group snapshot", async () => {
    const { adminSessions: groupedSessions, sourceKey: expectedSourceKey } =
      buildAdminSessionSourceScenario({
        issuedFromIp: "203.0.113.200",
        issuedUserAgent: "Snapshot Source Browser",
        sourceSessions: [
          {
            template: mockAdminSessions[0],
            id: "12121212-1212-4121-8121-121212121212",
            isCurrent: true,
            status: "active",
          },
          {
            id: "34343434-3434-4343-8343-343434343434",
            isCurrent: false,
            status: "revoked",
            revocationReason: "refresh-token-reuse" as const,
          },
        ],
      });

    await exportAdminSessionSourceGroupScenario({
      adminSessions: groupedSessions,
      sourceKey: expectedSourceKey,
      buttonName: "Export snapshot",
      message: "Downloaded admin session audit snapshot for 2 session(s).",
      beforeExport: async () => {
        expect((await screen.findAllByText("Critical risk")).length).toBeGreaterThan(0);
        expect(await screen.findByText("Refresh reuse detected")).toBeTruthy();
      },
    });
  });

  it("filters source groups by risk level and revokes the matching groups", async () => {
    const { adminSessions: groupedSessions } =
      buildAdminSessionActiveSourcePairScenario({
        issuedFromIp: "203.0.113.210",
        issuedUserAgent: "Risk Watch Browser",
        sourceSessionIds: [
          "56565656-5656-4565-8565-565656565656",
          "67676767-6767-4676-8676-676767676767",
        ],
        otherSessions: [
          {
            template: mockAdminSessions[2],
            id: "78787878-7878-4787-8787-787878787878",
            issuedFromIp: "198.51.100.210",
            issuedUserAgent: "Risk Normal Browser",
            isCurrent: true,
            status: "active",
          },
        ],
      });
    const { requests } = await renderInstalledAdminSessionSourceGroupsPage({
      adminSessions: groupedSessions,
      riskFilter: "watch",
    });

    await revokeAdminSessionRiskGroupAndAssert(requests, {
      message: "Revoked 2 active session(s) across 1 risk group(s).",
      includeRequestId: true,
    });
  });

  it("switches to a risk quick view and exports the matching risk snapshot", async () => {
    const { adminSessions: groupedSessions } =
      buildAdminSessionActiveSourcePairScenario({
        issuedFromIp: "203.0.113.211",
        issuedUserAgent: "Quick View Watch Browser",
        sourceSessionIds: [
          "89898989-8989-4898-8898-898989898989",
          "90909090-9090-4909-8909-909090909090",
        ],
        otherSessions: [
          {
            template: mockAdminSessions[2],
            id: "91919191-9191-4919-8919-919191919191",
            issuedFromIp: "198.51.100.211",
            issuedUserAgent: "Quick View Normal Browser",
            isCurrent: true,
            status: "active",
            revocationReason: null,
            revokedAt: null,
            revokedBySessionId: null,
          },
        ],
      });

    await exportAdminSessionRiskQuickViewScenario({
      adminSessions: groupedSessions,
      buttonName: "Export risk snapshot",
      message: "Downloaded risk snapshot for 1 group(s) and 2 session(s).",
    });
  });

  it("exports the matching risk snapshot as groups CSV", async () => {
    const { adminSessions: groupedSessions } =
      buildAdminSessionActiveSourcePairScenario({
        issuedFromIp: "203.0.113.212",
        issuedUserAgent: "Quick View Csv Browser",
        sourceSessionIds: [
          "92929292-9292-4929-8929-929292929292",
          "93939393-9393-4939-8939-939393939393",
        ],
      });

    await exportAdminSessionRiskQuickViewScenario({
      adminSessions: groupedSessions,
      buttonName: "Export risk groups CSV",
      message: "Downloaded risk groups CSV for 1 group(s).",
    });
  });

  it("exports the matching risk snapshot as sessions CSV", async () => {
    const { adminSessions: groupedSessions } =
      buildAdminSessionActiveSourcePairScenario({
        issuedFromIp: "203.0.113.213",
        issuedUserAgent: "Quick View Session Csv Browser",
        sourceSessionIds: [
          "94949494-9494-4949-8949-949494949494",
          "95959595-9595-4959-8959-959595959595",
        ],
      });

    await exportAdminSessionRiskQuickViewScenario({
      adminSessions: groupedSessions,
      buttonName: "Export risk sessions CSV",
      message: "Downloaded risk sessions CSV for 2 session(s).",
    });
  });

  it("shows skipped-session messaging when bulk revoke partially succeeds", async () => {
    const { requests } = installCloudAdminApiMock({
      bulkRevokeUnavailableSessionIds: [ADMIN_SESSION_SECONDARY_ID],
    });
    await renderAdminSessionsPage();

    await revokeAdminSessionsBulkAndAssert({
      requests,
      sessionIds: [ADMIN_SESSION_CURRENT_ID, ADMIN_SESSION_SECONDARY_ID],
      successMessage:
        "Revoked 1 selected session(s). 1 session(s) were already unavailable. The current console session was included, so the next admin request will re-issue a short-lived token.",
      includeRequestId: true,
    });
  });

  it("shows a stale-selection warning when bulk revoke skips every selected session", async () => {
    const { requests } = installCloudAdminApiMock({
      bulkRevokeUnavailableSessionIds: [
        ADMIN_SESSION_CURRENT_ID,
        ADMIN_SESSION_SECONDARY_ID,
      ],
    });
    await renderAdminSessionsPage();

    await revokeAdminSessionsBulkAndAssert({
      requests,
      sessionIds: [ADMIN_SESSION_CURRENT_ID, ADMIN_SESSION_SECONDARY_ID],
      successMessage:
        "No selected admin sessions were revoked. The list may already be stale.",
    });
  });

  it("shows notice errors when revoking a single admin session fails", async () => {
    const { requests } = installCloudAdminApiMock({
      revokeAdminSessionError: "Admin session revoke failed.",
    });
    await renderAdminSessionsPage();

    await revokeAdminSessionAndAssert({
      requests,
      sessionId: "22222222-2222-4222-8222-222222222222",
      errorMessage: "Admin session revoke failed.",
    });
  });

  it("shows notice errors when bulk revoking selected admin sessions fails", async () => {
    const { requests } = installCloudAdminApiMock({
      bulkRevokeAdminSessionsError: "Bulk admin revoke failed.",
    });
    await renderAdminSessionsPage();

    await revokeAdminSessionsBulkAndAssert({
      requests,
      sessionIds: [ADMIN_SESSION_CURRENT_ID, ADMIN_SESSION_SECONDARY_ID],
      errorMessage: "Bulk admin revoke failed.",
    });
    await expectAdminSessionsBulkSelectionSummary(2);
  });

  it("shows notice errors when revoking filtered admin sessions fails", async () => {
    const { requests } = installCloudAdminApiMock({
      filteredRevokeAdminSessionsError: "Filtered admin revoke failed.",
    });
    await renderAdminSessionsPage();

    await setAdminSessionsSearch("Mobile Safari");
    expect(await screen.findAllByText("Showing 1-1 of 1")).toHaveLength(2);

    await revokeAdminSessionsFilteredAndAssert({
      requests,
      query: "Mobile Safari",
      errorMessage: "Filtered admin revoke failed.",
    });
  });

  it("filters waiting sync tasks and replays the matching failed tasks", async () => {
    const { requests } = installCloudAdminApiMock();
    renderRoute("/waiting-sync");

    expect(await screen.findByText("Waiting session sync")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Waiting sync status"), {
      target: { value: "failed" },
    });
    fireEvent.change(screen.getByLabelText("Waiting sync task type"), {
      target: { value: "refresh_world" },
    });
    fireEvent.change(screen.getByLabelText("Waiting sync search"), {
      target: { value: "runtime.heartbeat" },
    });

    await waitFor(() => {
      expect(
        hasWaitingSessionSyncTasksRequest(requests, {
          status: "failed",
          taskType: "refresh_world",
          query: "runtime.heartbeat",
          page: "1",
          pageSize: "20",
        }),
      ).toBe(true);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Replay matching failed tasks" }),
    );

    expect(
      await screen.findByText(
        "Queued replay for 1 matching failed waiting sync task(s). Skipped 0.",
      ),
    ).toBeTruthy();
    expect(await screen.findByText("Request id")).toBeTruthy();
    expect(await screen.findByText(/^mock-request-/)).toBeTruthy();
    expect(
      requests.some(
        (entry) =>
          entry.url ===
            "POST /admin/cloud/waiting-session-sync-tasks/replay-filtered-failed" &&
          entry.body?.taskType === "refresh_world" &&
          entry.body?.query === "runtime.heartbeat" &&
          !Object.prototype.hasOwnProperty.call(entry.body ?? {}, "status"),
      ),
    ).toBe(true);
  });

  it("exports a filtered waiting sync snapshot", async () => {
    installCloudAdminApiMock();
    await renderWaitingSessionSyncPage();

    const exportButton = await screen.findByRole("button", {
      name: "Export filtered snapshot",
    });
    await waitFor(() => {
      expect((exportButton as HTMLButtonElement).disabled).toBe(false);
    });

    await exportWaitingSessionSyncFocusArtifact({
      buttonName: "Export filtered snapshot",
      message: "Downloaded waiting sync snapshot for 3 visible task(s).",
    });
    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it("exports a filtered waiting sync CSV", async () => {
    installCloudAdminApiMock();
    await renderWaitingSessionSyncPage();

    const exportButton = await screen.findByRole("button", {
      name: "Export filtered CSV",
    });
    await waitFor(() => {
      expect((exportButton as HTMLButtonElement).disabled).toBe(false);
    });

    await exportWaitingSessionSyncFocusArtifact({
      buttonName: "Export filtered CSV",
      message: "Downloaded waiting sync CSV for 3 visible task(s).",
    });
    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it("exports waiting sync context groups CSV", async () => {
    installWaitingSessionSyncReviewMock();
    await renderWaitingSessionSyncContextGroupsPage();

    const exportButton = await screen.findByRole("button", {
      name: "Export context groups CSV",
    });
    await waitFor(() => {
      expect((exportButton as HTMLButtonElement).disabled).toBe(false);
    });

    await exportWaitingSessionSyncFocusArtifact({
      buttonName: "Export context groups CSV",
      message: "Downloaded waiting sync context groups CSV for 2 group(s).",
    });
    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it("exports waiting sync context groups snapshot", async () => {
    installWaitingSessionSyncReviewMock();
    await renderWaitingSessionSyncContextGroupsPage();

    const exportButton = await screen.findByRole("button", {
      name: "Export context groups snapshot",
    });
    await waitFor(() => {
      expect((exportButton as HTMLButtonElement).disabled).toBe(false);
    });

    await exportWaitingSessionSyncFocusArtifact({
      buttonName: "Export context groups snapshot",
      message: "Downloaded waiting sync context groups snapshot for 2 group(s).",
    });
    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it("focuses a waiting sync context group and opens the related world", async () => {
    const { requests } = installWaitingSessionSyncReviewMock();
    renderRoute("/waiting-sync");

    await expectWaitingSessionSyncContextGroupsReady();
    const contextCard = await findWaitingSessionSyncContextCard();
    expect(within(contextCard).getByText("2 visible")).toBeTruthy();

    await focusWaitingSessionSyncContext(contextCard, requests);
    expect(screen.queryByText("cloud.updateWorld")).toBeNull();

    fireEvent.click(screen.getAllByRole("link", { name: "Open world" })[0]);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/worlds/world-1");
    });
  });

  it("reviews waiting sync context tasks locally before focusing the context", async () => {
    const { requests } = installWaitingSessionSyncReviewMock();
    renderRoute("/waiting-sync");

    await expectWaitingSessionSyncContextGroupsReady();
    const { reviewPanel } = await openWaitingSessionSyncContextReview();
    expect(
      within(reviewPanel).getByText(
        `Reviewing 2 visible task(s) from ${WAITING_SYNC_REVIEW_CONTEXT}`,
      ),
    ).toBeTruthy();
    expect(within(reviewPanel).getByText("Targets 2")).toBeTruthy();
    expect(
      within(reviewPanel).getByText(WAITING_SYNC_REVIEW_TASK_KEY),
    ).toBeTruthy();
    expect(
      hasWaitingSessionSyncTasksRequest(requests, {
        query: WAITING_SYNC_REVIEW_CONTEXT,
        page: "1",
        pageSize: "20",
      }),
    ).toBe(false);

    await focusWaitingSessionSyncContext(reviewPanel, requests);
  });

  it("opens a reviewed waiting sync context directly from route search", async () => {
    installWaitingSessionSyncReviewMock();
    const reviewPanel = await openWaitingSessionSyncReviewRoute(
      WAITING_SYNC_REVIEW_PATH,
    );
    expect(
      within(reviewPanel).getByText(
        `Reviewing 2 visible task(s) from ${WAITING_SYNC_REVIEW_CONTEXT}`,
      ),
    ).toBeTruthy();
    expectWaitingSessionSyncReviewPermalink(reviewPanel, WAITING_SYNC_REVIEW_PATH);
  });

  it("opens a reviewed waiting sync task directly from route search", async () => {
    installWaitingSessionSyncReviewMock();
    const reviewPanel = await openWaitingSessionSyncReviewRoute(
      WAITING_SYNC_REVIEW_TASK_PATH,
    );
    expect(within(reviewPanel).getByText("Task permalink focus")).toBeTruthy();

    const highlightedTaskButton = within(reviewPanel).getByRole("button", {
      name: "Task highlighted",
    });
    expect((highlightedTaskButton as HTMLButtonElement).disabled).toBe(true);

    const highlightedTaskCard = highlightedTaskButton.closest("article");
    expect(highlightedTaskCard).toBeTruthy();
    expect(
      within(highlightedTaskCard as HTMLElement).getByText(
        WAITING_SYNC_REVIEW_TASK_KEY,
      ),
    ).toBeTruthy();

    expectWaitingSessionSyncTaskPermalink(
      highlightedTaskCard as HTMLElement,
      WAITING_SYNC_REVIEW_TASK_PATH,
    );
    expectWaitingSessionSyncReviewPermalink(
      reviewPanel,
      WAITING_SYNC_REVIEW_TASK_PATH,
    );
  });

  it("copies waiting sync review and task context from the review panel", async () => {
    installWaitingSessionSyncReviewMock();
    renderRoute("/waiting-sync");

    await expectWaitingSessionSyncContextGroupsReady();
    const { reviewPanel } = await openWaitingSessionSyncContextReview();

    fireEvent.click(
      within(reviewPanel).getByRole("button", {
        name: "Copy review context",
      }),
    );

    expect(
      await screen.findByText("Waiting sync review context copied."),
    ).toBeTruthy();
    expect(window.navigator.clipboard.writeText).toHaveBeenLastCalledWith(
      expect.stringContaining(
        `Review permalink: ${WAITING_SYNC_REVIEW_PATH}`,
      ),
    );

    const pendingTaskCard = getWaitingSessionSyncReviewedTaskCard(reviewPanel);

    fireEvent.click(
      within(pendingTaskCard).getByRole("button", {
        name: "Copy task context",
      }),
    );

    expect(
      await screen.findByText("Waiting sync task context copied."),
    ).toBeTruthy();
    expect(window.navigator.clipboard.writeText).toHaveBeenLastCalledWith(
      expect.stringContaining(
        `Review permalink: ${WAITING_SYNC_REVIEW_TASK_PATH}`,
      ),
    );

    expectWaitingSessionSyncTaskPermalink(
      pendingTaskCard as HTMLElement,
      WAITING_SYNC_REVIEW_TASK_PATH,
    );
    const reviewPermalinkLink = expectWaitingSessionSyncReviewPermalink(
      reviewPanel,
      WAITING_SYNC_REVIEW_PATH,
    );
    expect(reviewPermalinkLink.getAttribute("target")).toBe("_blank");
  });

  it("exports a waiting sync context snapshot from the context card", async () => {
    installWaitingSessionSyncReviewMock();
    renderRoute("/waiting-sync");

    await expectWaitingSessionSyncContextGroupsReady();
    const contextCard = await findWaitingSessionSyncContextCard();

    fireEvent.click(
      within(contextCard).getByRole("button", {
        name: "Export context snapshot",
      }),
    );

    expect(
      await screen.findByText(
        "Downloaded waiting sync context snapshot for 2 task(s).",
      ),
    ).toBeTruthy();

    fireEvent.click(
      within(contextCard).getByRole("button", {
        name: "Export context CSV",
      }),
    );

    expect(
      await screen.findByText("Downloaded waiting sync context CSV for 2 task(s)."),
    ).toBeTruthy();
    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it("exports a focused waiting sync snapshot for a target query", async () => {
    installCloudAdminApiMock();
    await focusWaitingSessionSyncTarget();

    await exportWaitingSessionSyncFocusArtifact({
      buttonName: "Export focus snapshot",
      message: "Downloaded waiting sync focus snapshot for 1 task(s).",
    });

    await exportWaitingSessionSyncFocusArtifact({
      buttonName: "Export focus CSV",
      message: "Downloaded waiting sync focus CSV for 1 task(s).",
    });
    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it("records replay receipts for a highlighted waiting sync task", async () => {
    await renderHighlightedWaitingSessionSyncTaskRoute();

    fireEvent.click(screen.getAllByRole("button", { name: "Replay now" })[0]);

    await expectWaitingSessionSyncHighlightedTaskReceipt({
      title: "Replay task",
      message: "Waiting sync task replay queued.",
    });

    await waitFor(() => {
      expect(screen.getByText("Status: Pending")).toBeTruthy();
    });
  });

  it("clears a failed waiting sync task from the row action", async () => {
    const { requests } = installCloudAdminApiMock();
    await renderHighlightedWaitingSessionSyncTaskRoute();

    fireEvent.click(screen.getAllByRole("button", { name: "Clear now" })[0]);
    expect(
      await screen.findByRole("button", { name: "Clear failed task" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Clear failed task" }),
    );

    await expectWaitingSessionSyncHighlightedTaskReceipt({
      title: "Clear task",
      message: "Waiting sync task cleared.",
    });

    expect(
      await screen.findByText(
        "This task is no longer visible in the current result set, but recent receipts still match this task permalink.",
      ),
    ).toBeTruthy();

    expect(
      await screen.findByText("Reviewing 0 visible task(s) from runtime.heartbeat"),
    ).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: "Replay now" })).toHaveLength(0);
    expect(
      requests.some(
        (entry) =>
          entry.url ===
            "POST /admin/cloud/waiting-session-sync-tasks/clear-failed" &&
          Array.isArray(entry.body?.taskIds) &&
          entry.body?.taskIds.includes(WAITING_SYNC_HIGHLIGHTED_TASK_ID),
      ),
    ).toBe(true);
  });

  it("opens a filtered request view from a waiting sync phone task", async () => {
    installCloudAdminApiMock({
      requests: [
        {
          id: "request-1",
          phone: WAITING_SYNC_LINKED_PHONE,
          worldName: WAITING_SYNC_LINKED_REQUEST_NAME,
          status: "pending",
          displayStatus: "Waiting for session refresh.",
          failureReason: "Session refresh pending.",
          projectedWorldStatus: "queued",
          projectedDesiredState: "running",
        },
        {
          id: "request-2",
          phone: "+8613800138999",
          worldName: WAITING_SYNC_UNRELATED_REQUEST_NAME,
          status: "active",
          displayStatus: "Delivered.",
          failureReason: null,
          projectedWorldStatus: "ready",
          projectedDesiredState: "running",
        },
      ],
      waitingSessionSyncTasks: [
        {
          ...mockWaitingSessionSyncTasks[1],
          targetValue: WAITING_SYNC_LINKED_PHONE,
          context: "cloud.updateRequest",
        },
      ],
    });
    await renderWaitingSessionSyncPageWithTaskKey("refresh-phone:+8613800138001");

    const requestsLink = screen.getByRole("link", { name: "Open requests" });
    expect(requestsLink.getAttribute("href")).toBe(
      `/requests?query=${encodeURIComponent(WAITING_SYNC_LINKED_PHONE)}`,
    );
    fireEvent.click(requestsLink);

    await expectWaitingSessionSyncLinkedRequestsView();
  });

  it("opens a filtered world view from a waiting sync phone task", async () => {
    installCloudAdminApiMock({
      waitingSessionSyncTasks: [
        {
          ...mockWaitingSessionSyncTasks[2],
          targetValue: WAITING_SYNC_LINKED_PHONE,
          context: "cloud.updateWorld",
        },
      ],
    });
    await renderWaitingSessionSyncPageWithTaskKey("invalidate-phone:+8613800138002");

    const worldsLink = screen.getByRole("link", { name: "Open worlds" });
    expect(worldsLink.getAttribute("href")).toBe(
      `/worlds?query=${encodeURIComponent(WAITING_SYNC_LINKED_PHONE)}`,
    );
    fireEvent.click(worldsLink);

    await expectWaitingSessionSyncLinkedWorldsView();
  });

  it("selects only active sessions when bulk-selecting the current admin session page", async () => {
    const generatedSessions = buildAdminSessionDescendingQuerySessions({
      count: 12,
      idSuffix: "4444-4444-8444-444444444444",
      issuedFromIpPrefix: "203.0.113.",
      issuedFromIpStart: 30,
      issuedUserAgentPrefix: "Bulk Page Browser",
      currentIndex: 1,
      revokedIndexes: [0, 11],
    });

    const { requests } = installCloudAdminApiMock({
      adminSessions: generatedSessions,
    });
    renderRoute("/sessions");

    await expectAdminSessionsSummary("Showing 1-10 of 12");

    fireEvent.click(
      screen.getByLabelText("Select all active admin sessions"),
    );

    expect(
      await screen.findByText("9 active session(s) selected on this page."),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Revoke selected" }),
    );
    expect(
      await screen.findByText("Revoke selected admin sessions?"),
    ).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Revoke selected" })[1],
    );

    expect(
      await screen.findByText(
        "Revoked 9 selected session(s). The current console session was included, so the next admin request will re-issue a short-lived token.",
      ),
    ).toBeTruthy();
    expectAdminSessionsBulkRevokeRequest(requests, {
      expectedCount: 9,
      requiredIds: [
        "00000002-4444-4444-8444-444444444444",
        "00000010-4444-4444-8444-444444444444",
      ],
      excludedIds: ["00000001-4444-4444-8444-444444444444"],
    });
  });

  it("filters and paginates admin sessions", async () => {
    const generatedSessions = buildAdminSessionDescendingQuerySessions({
      count: 12,
      idSuffix: "2222-4222-8222-222222222222",
      issuedFromIpPrefix: "203.0.113.",
      issuedFromIpStart: 10,
      issuedUserAgentPrefix: "Browser",
      revokedIndexes: [11],
    });

    const { requests } = installCloudAdminApiMock({
      adminSessions: generatedSessions,
    });
    renderRoute("/sessions");

    await expectAdminSessionsSummary("Showing 1-10 of 12");
    expectAdminSessionsFirstDataRowContains(
      "00000001-2222-4222-8222-222222222222",
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await expectAdminSessionsSummary("Showing 11-12 of 12");
    expect(
      await screen.findByText("00000012-2222-4222-8222-222222222222"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Recently revoked" }),
    );

    await expectAdminSessionsSummary("Showing 1-1 of 1");
    expect(
      await screen.findByText("00000012-2222-4222-8222-222222222222"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Expiring soon" }),
    );

    await expectAdminSessionsSummary("Showing 1-10 of 11");
    await waitFor(() => {
      expectAdminSessionsFirstDataRowContains(
        "00000011-2222-4222-8222-222222222222",
      );
    });

    fireEvent.change(screen.getByLabelText("Sort by"), {
      target: { value: "createdAt" },
    });
    fireEvent.change(screen.getByLabelText("Direction"), {
      target: { value: "asc" },
    });

    await waitFor(() => {
      expectAdminSessionsFirstDataRowContains(
        "00000011-2222-4222-8222-222222222222",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    await expectAdminSessionsSummary("Showing 1-10 of 12");
    await waitFor(() => {
      expectAdminSessionsFirstDataRowContains(
        "00000001-2222-4222-8222-222222222222",
      );
    });

    await expectAdminSessionsQuery(requests, {
        sortBy: "updatedAt",
        sortDirection: "desc",
        page: "1",
        pageSize: "10",
      });
  });

  it("issues admin session quick-view and sorting query params", async () => {
    const generatedSessions = buildAdminSessionDescendingQuerySessions({
      count: 12,
      idSuffix: "3333-4333-8333-333333333333",
      issuedFromIpPrefix: "198.51.100.",
      issuedFromIpStart: 20,
      issuedUserAgentPrefix: "Quick View Browser",
      revokedIndexes: [11],
    });

    const { requests } = installCloudAdminApiMock({
      adminSessions: generatedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Admin sessions")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Current session" }));

    await expectAdminSessionsSummary("Showing 1-1 of 1");
    expect(
      await screen.findByText("00000001-3333-4333-8333-333333333333"),
    ).toBeTruthy();
    await expectAdminSessionsQuery(requests, {
          currentOnly: "true",
          sortBy: "updatedAt",
          sortDirection: "desc",
          page: "1",
          pageSize: "10",
        });

    fireEvent.click(screen.getByRole("button", { name: "Expiring soon" }));

    await expectAdminSessionsSummary("Showing 1-10 of 11");
    await expectAdminSessionsQuery(requests, {
          status: "active",
          sortBy: "expiresAt",
          sortDirection: "asc",
          page: "1",
          pageSize: "10",
        });

    fireEvent.change(screen.getByLabelText("Sort by"), {
      target: { value: "createdAt" },
    });
    fireEvent.change(screen.getByLabelText("Direction"), {
      target: { value: "asc" },
    });

    await expectAdminSessionsQuery(requests, {
          status: "active",
          sortBy: "createdAt",
          sortDirection: "asc",
          page: "1",
          pageSize: "10",
        });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    await expectAdminSessionsSummary("Showing 1-10 of 12");
    await expectAdminSessionsQuery(requests, {
          sortBy: "updatedAt",
          sortDirection: "desc",
          page: "1",
          pageSize: "10",
        });
  });

  it("clears bulk-selected admin sessions when paging to a different result set", async () => {
    const generatedSessions = buildAdminSessionDescendingQuerySessions({
      count: 12,
      idSuffix: "5555-4555-8555-555555555555",
      issuedFromIpPrefix: "198.51.100.",
      issuedFromIpStart: 40,
      issuedUserAgentPrefix: "Paging Browser",
    });

    installCloudAdminApiMock({
      adminSessions: generatedSessions,
    });
    renderRoute("/sessions");

    await expectAdminSessionsSummary("Showing 1-10 of 12");

    fireEvent.click(
      screen.getByLabelText("Select all active admin sessions"),
    );
    expect(
      await screen.findByText("10 active session(s) selected on this page."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await expectAdminSessionsSummary("Showing 11-12 of 12");
    expect(
      await screen.findByText(
        "Select active sessions on this page to revoke them in one action.",
      ),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Revoke selected",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByLabelText(
          "Select all active admin sessions",
        ) as HTMLInputElement
      ).checked,
    ).toBe(false);
  });

  it("copies bootstrap material and shows success notices", async () => {
    renderRoute("/worlds/world-1");

    expect(await screen.findByText("Bootstrap package")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy endpoints" }));

    expect(await screen.findByText("Callback endpoints copied.")).toBeTruthy();
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(
      [
        "BOOTSTRAP=https://cloud.mock.example.com/internal/worlds/world-1/bootstrap",
        "HEARTBEAT=https://cloud.mock.example.com/internal/worlds/world-1/heartbeat",
        "ACTIVITY=https://cloud.mock.example.com/internal/worlds/world-1/activity",
        "HEALTH=https://cloud.mock.example.com/internal/worlds/world-1/health",
        "FAIL=https://cloud.mock.example.com/internal/worlds/world-1/fail",
      ].join("\n"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Copy runtime env overlay" }),
    );
    expect(await screen.findByText("Runtime env overlay copied.")).toBeTruthy();
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(
      "WORLD_ID=world-1",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Copy docker compose snippet" }),
    );
    expect(
      await screen.findByText("Docker compose snippet copied."),
    ).toBeTruthy();
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(
      "services:\n  app:\n    image: yinjie/world:latest",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Copy callback token" }),
    );
    expect(await screen.findByText("Callback token copied.")).toBeTruthy();
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(
      "callback-token-1",
    );
  });

  it("requires confirmation before suspending a world", async () => {
    const { requests } = installCloudAdminApiMock();
    renderRoute("/worlds/world-1");

    expect(await screen.findByText("Lifecycle summary")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Suspend Mock World" }),
    );

    expect(await screen.findByText("Suspend Mock World?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Suspend world" }));

    expect(await screen.findByText("Mock World suspend queued.")).toBeTruthy();
    expect(await screen.findByText("Request id")).toBeTruthy();
    expect(await screen.findByText(/^mock-request-/)).toBeTruthy();

    await waitFor(() => {
      expect(screen.queryByText("Suspend Mock World?")).toBeNull();
    });

    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/suspend",
      ),
    ).toBe(true);
  });

  it("dismisses confirmation dialogs without sending the action", async () => {
    const { requests } = installCloudAdminApiMock();
    renderRoute("/worlds/world-1");

    expect(await screen.findByText("Lifecycle summary")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Suspend Mock World" }),
    );
    expect(await screen.findByText("Suspend Mock World?")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByText("Suspend Mock World?")).toBeNull();
    });

    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/suspend",
      ),
    ).toBe(false);
  });

  it("uses consistent lifecycle action feedback on world detail pages", async () => {
    const { requests } = installCloudAdminApiMock();
    renderRoute("/worlds/world-1");

    expect(await screen.findByText("Lifecycle summary")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Reconcile Mock World" }),
    );

    expect(
      await screen.findByText("Mock World reconcile triggered."),
    ).toBeTruthy();
    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/reconcile",
      ),
    ).toBe(true);
  });

  it("uses shared retry confirmation copy on world detail pages", async () => {
    installCloudAdminApiMock({
      world: {
        status: "failed",
        failureCode: "BOOT_FAILED",
        failureMessage: "Bootstrap failed.",
      },
    });
    renderRoute("/worlds/world-1");

    expect(await screen.findByText("Lifecycle summary")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry Mock World" }));

    expect(
      await screen.findByText("Retry recovery for Mock World?"),
    ).toBeTruthy();
  });

  it("shows notice errors when saving world details fails", async () => {
    const { requests } = installCloudAdminApiMock({
      updateWorldError: "World save failed.",
    });
    renderRoute("/worlds/world-1");

    expect(await screen.findByText("Lifecycle summary")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("World name"), {
      target: { value: "Broken World" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save world" }));

    expect(await screen.findByText("World save failed.")).toBeTruthy();
    expect(
      requests.some(
        (entry) => entry.url === "PATCH /admin/cloud/worlds/world-1",
      ),
    ).toBe(true);
  });

  it("shows notice errors when world detail lifecycle actions fail", async () => {
    const { requests } = installCloudAdminApiMock({
      actionErrors: {
        suspend: "World detail suspend failed.",
      },
    });
    renderRoute("/worlds/world-1");

    expect(await screen.findByText("Lifecycle summary")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Suspend Mock World" }),
    );
    expect(await screen.findByText("Suspend Mock World?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Suspend world" }));

    expect(
      await screen.findByText("World detail suspend failed."),
    ).toBeTruthy();
    expect(screen.queryByText("Suspend Mock World?")).toBeNull();
    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/suspend",
      ),
    ).toBe(true);
  });

  it("shows notice errors when rotating callback tokens fails", async () => {
    const { requests } = installCloudAdminApiMock({
      rotateCallbackTokenError: "Callback rotation failed.",
    });
    renderRoute("/worlds/world-1");

    expect(await screen.findByText("Bootstrap package")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Rotate callback token" }),
    );
    expect(await screen.findByText("Rotate the callback token?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Rotate token" }));

    expect(await screen.findByText("Callback rotation failed.")).toBeTruthy();
    expect(screen.queryByText("Rotate the callback token?")).toBeNull();
    expect(
      requests.some(
        (entry) =>
          entry.url ===
          "POST /admin/cloud/worlds/world-1/rotate-callback-token",
      ),
    ).toBe(true);
  });

  it("requires confirmation before suspending from worlds quick actions", async () => {
    const { requests } = installCloudAdminApiMock();
    renderRoute("/worlds");

    expect(await screen.findByText("Managed worlds")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("button", { name: "Suspend Mock World" }),
    );

    expect(await screen.findByText("Suspend Mock World?")).toBeTruthy();
    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/suspend",
      ),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Suspend world" }));

    expect(await screen.findByText("Mock World suspend queued.")).toBeTruthy();
    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/suspend",
      ),
    ).toBe(true);
  });

  it("dismisses worlds quick-action confirmations without sending the action", async () => {
    const { requests } = installCloudAdminApiMock();
    renderRoute("/worlds");

    expect(await screen.findByText("Managed worlds")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("button", { name: "Suspend Mock World" }),
    );

    expect(await screen.findByText("Suspend Mock World?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByText("Suspend Mock World?")).toBeNull();
    });

    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/suspend",
      ),
    ).toBe(false);
  });

  it("shows notice errors when worlds quick actions fail", async () => {
    const { requests } = installCloudAdminApiMock({
      actionErrors: {
        suspend: "World suspend failed.",
      },
    });
    renderRoute("/worlds");

    expect(await screen.findByText("Managed worlds")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("button", { name: "Suspend Mock World" }),
    );
    expect(await screen.findByText("Suspend Mock World?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Suspend world" }));

    expect(await screen.findByText("World suspend failed.")).toBeTruthy();
    expect(screen.queryByText("Suspend Mock World?")).toBeNull();
    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/suspend",
      ),
    ).toBe(true);
  });

  it("requires confirmation before retrying from jobs quick actions", async () => {
    const { requests } = installCloudAdminApiMock({
      world: {
        status: "failed",
        failureCode: "BOOT_FAILED",
        failureMessage: "Bootstrap failed.",
      },
    });
    renderRoute("/jobs");

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("button", { name: "Retry Mock World" }),
    );

    expect(
      await screen.findByText("Retry recovery for Mock World?"),
    ).toBeTruthy();
    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/retry",
      ),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Retry recovery" }));

    expect(await screen.findByText("Mock World retry queued.")).toBeTruthy();
    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/retry",
      ),
    ).toBe(true);
  });

  it("shows notice errors when jobs quick actions fail", async () => {
    const { requests } = installCloudAdminApiMock({
      world: {
        status: "failed",
        failureCode: "BOOT_FAILED",
        failureMessage: "Bootstrap failed.",
      },
      actionErrors: {
        retry: "Job retry failed.",
      },
    });
    renderRoute("/jobs");

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("button", { name: "Retry Mock World" }),
    );
    expect(
      await screen.findByText("Retry recovery for Mock World?"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry recovery" }));

    expect(await screen.findByText("Job retry failed.")).toBeTruthy();
    expect(screen.queryByText("Retry recovery for Mock World?")).toBeNull();
    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/retry",
      ),
    ).toBe(true);
  });

  it("shows superseded audit badges on lifecycle jobs", async () => {
    installCloudAdminApiMock({
      job: {
        status: "cancelled",
        failureCode: "superseded_by_new_job",
        resultPayload: {
          action: "superseded_by_new_job",
          supersededByJobType: "resume",
        },
        supersededByJobType: "resume",
      },
    });
    renderRoute("/jobs");

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();
    expect(await screen.findByText("Superseded by resume")).toBeTruthy();
    expect(
      await screen.findByText("Superseded by newer resume request."),
    ).toBeTruthy();
  });

  it("filters lifecycle jobs by superseded audit state", async () => {
    const { requests } = installCloudAdminApiMock();
    renderRoute("/jobs?audit=superseded");

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();
    expect(screen.getByDisplayValue("audit: superseded")).toBeTruthy();
    expect(await screen.findByText("No jobs match this filter.")).toBeTruthy();
    expect(screen.queryByText("resumed")).toBeNull();
    expect(hasJobsRequest(requests, { audit: "superseded" })).toBe(true);
  });

  it("filters lifecycle jobs by superseding job type", async () => {
    const { requests } = installCloudAdminApiMock({
      job: {
        status: "cancelled",
        failureCode: "superseded_by_new_job",
        resultPayload: {
          action: "superseded_by_new_job",
          supersededByJobType: "resume",
        },
        supersededByJobType: "resume",
      },
    });
    renderRoute("/jobs?audit=superseded&supersededBy=resume");

    function getSupersededBySelect() {
      const select = screen
        .getAllByRole("combobox")
        .find((element) =>
          Array.from((element as HTMLSelectElement).options).some((option) =>
            option.textContent?.startsWith("superseded by: "),
          ),
        );

      if (!(select instanceof HTMLSelectElement)) {
        throw new Error("Missing superseded by filter select.");
      }

      return select;
    }

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();
    expect(screen.getByDisplayValue("audit: superseded")).toBeTruthy();
    expect(getSupersededBySelect().value).toBe("resume");
    expect(await screen.findByText("Superseded by resume")).toBeTruthy();
    expect(
      hasJobsRequest(requests, {
        audit: "superseded",
        supersededBy: "resume",
      }),
    ).toBe(true);

    fireEvent.change(getSupersededBySelect(), {
      target: { value: "suspend" },
    });

    expect(await screen.findByText("No jobs match this filter.")).toBeTruthy();
    expect(getSupersededBySelect().value).toBe("suspend");
    expect(screen.queryByText("Superseded by resume")).toBeNull();
    expect(
      hasJobsRequest(requests, {
        audit: "superseded",
        supersededBy: "suspend",
      }),
    ).toBe(true);
  });

  it.each(JOB_ACTION_VISIBILITY_CASES)(
    "shows the expected jobs quick actions for $status worlds",
    async ({ status, present, absent }) => {
      installCloudAdminApiMock({
        world: {
          status,
        },
      });
      renderRoute("/jobs");

      expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();
      expect(
        await screen.findByRole("button", {
          name: "Reconcile Mock World",
        }),
      ).toBeTruthy();

      for (const label of present) {
        expect(await screen.findByRole("button", { name: label })).toBeTruthy();
      }

      for (const label of absent) {
        expect(screen.queryByRole("button", { name: label })).toBeNull();
      }
    },
  );

  it.each(WORLD_ACTION_VISIBILITY_CASES)(
    "shows the expected worlds quick actions for $status worlds",
    async ({ status, present, absent }) => {
      installCloudAdminApiMock({
        world: {
          status,
        },
      });
      renderRoute("/worlds");

      expect(await screen.findByText("Managed worlds")).toBeTruthy();
      expect(
        await screen.findByRole("button", {
          name: "Reconcile Mock World",
        }),
      ).toBeTruthy();

      for (const label of present) {
        expect(await screen.findByRole("button", { name: label })).toBeTruthy();
      }

      for (const label of absent) {
        expect(screen.queryByRole("button", { name: label })).toBeNull();
      }
    },
  );

  it("expires notices after the toast timeout", async () => {
    renderRoute("/worlds/world-1");

    expect(await screen.findByText("Bootstrap package")).toBeTruthy();

    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy endpoints" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Callback endpoints copied.")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2_700);
    });

    expect(screen.queryByText("Callback endpoints copied.")).toBeNull();
  });

  it("opens queue-filtered jobs views from dashboard shortcuts", async () => {
    const { requests } = installCloudAdminApiMock();
    renderRoute("/");

    expect(await screen.findByText("Operator Queue")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("link", { name: /Delayed jobs/i }),
    );

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();
    expect(screen.getByDisplayValue("queue: delayed")).toBeTruthy();
    expect(await screen.findByText("No jobs match this filter.")).toBeTruthy();
    expect(hasJobsRequest(requests, { queueState: "delayed" })).toBe(true);
  });

  it("opens world-scoped operator jobs from the dashboard queue", async () => {
    const { requests } = installCloudAdminApiMock({
      job: {
        status: "running",
      },
    });
    renderRoute("/");

    expect(await screen.findByText("Operator Queue")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("link", {
        name: "Open operator jobs for Mock World",
      }),
    );

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();
    expect(await screen.findByText("World scope")).toBeTruthy();
    expect(
      (await screen.findAllByRole("link", { name: "Mock World" })).length,
    ).toBeGreaterThan(0);
    expect(
      hasJobsRequest(requests, {
        worldId: "world-1",
      }),
    ).toBe(true);
  });

  it("copies a compact jobs permalink from the jobs page", async () => {
    renderRoute(
      "/jobs?worldId=world-1&status=failed&jobType=resume&page=2&pageSize=50&query=retry+me",
    );

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Copy jobs permalink" }),
    );

    expect(await screen.findByText("Jobs permalink copied.")).toBeTruthy();
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/jobs?worldId=world-1&status=failed&jobType=resume&query=retry+me&page=2&pageSize=50`,
    );
  });

  it("copies a compact requests permalink from the requests page", async () => {
    renderRoute(
      "/requests?status=pending&projectedWorldStatus=queued&desiredState=running&query=%2B8613800138000",
    );

    expect(await screen.findByText("World requests")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Copy requests permalink" }),
    );

    expect(await screen.findByText("Requests permalink copied.")).toBeTruthy();
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/requests?status=pending&projectedWorldStatus=queued&desiredState=running&query=%2B8613800138000`,
    );
  });

  it("copies a compact worlds permalink from the worlds page", async () => {
    renderRoute(
      "/worlds?status=ready&provider=manual-docker&powerState=running&attention=critical&health=healthy&query=mock",
    );

    expect(await screen.findByText("Managed worlds")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Copy worlds permalink" }),
    );

    expect(await screen.findByText("Worlds permalink copied.")).toBeTruthy();
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/worlds?status=ready&provider=manual-docker&powerState=running&attention=critical&health=healthy&query=mock`,
    );
  });

  it("copies a compact waiting-sync permalink from the waiting-sync page", async () => {
    renderRoute(
      "/waiting-sync?status=failed&taskType=refresh_phone&query=runtime.heartbeat&reviewContext=cloud.updateWorld&page=2&pageSize=10",
    );

    expect(await screen.findByText("Waiting session sync")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Copy waiting sync permalink" }),
    );

    expect(
      await screen.findByText("Waiting sync permalink copied."),
    ).toBeTruthy();
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/waiting-sync?status=failed&taskType=refresh_phone&query=runtime.heartbeat&reviewContext=cloud.updateWorld&page=2&pageSize=10`,
    );
  });

  it("opens the current waiting-sync permalink in a new tab", async () => {
    renderRoute(
      "/waiting-sync?status=failed&taskType=refresh_phone&query=runtime.heartbeat&reviewContext=cloud.updateWorld&page=2&pageSize=10",
    );

    expect(await screen.findByText("Waiting session sync")).toBeTruthy();

    const permalinkLink = screen.getByRole("link", {
      name: "Open waiting sync permalink",
    });
    expect(permalinkLink.getAttribute("href")).toBe(
      "/waiting-sync?status=failed&taskType=refresh_phone&query=runtime.heartbeat&reviewContext=cloud.updateWorld&page=2&pageSize=10",
    );
    expect(permalinkLink.getAttribute("target")).toBe("_blank");
  });

  it("opens superseded jobs views from dashboard shortcuts", async () => {
    renderRoute("/");

    expect(await screen.findByText("Recent Failures")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("link", { name: /Open superseded jobs/i }),
    );

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();
    expect(screen.getByDisplayValue("audit: superseded")).toBeTruthy();
    expect(await screen.findByText("No jobs match this filter.")).toBeTruthy();
  });

  it("shows recent superseded lifecycle jobs on the dashboard", async () => {
    installCloudAdminApiMock({
      job: {
        status: "cancelled",
        failureCode: "superseded_by_new_job",
        resultPayload: {
          action: "superseded_by_new_job",
          supersededByJobType: "resume",
        },
        supersededByJobType: "resume",
      },
    });
    renderRoute("/");

    expect(await screen.findByText("Superseded Queue")).toBeTruthy();
    expect(await screen.findByText("Superseded by resume")).toBeTruthy();
    expect(
      await screen.findByText("Superseded by newer resume request."),
    ).toBeTruthy();
    expect(
      await screen.findByRole("link", { name: /Open superseded queue/i }),
    ).toBeTruthy();
  });

  it("opens world-scoped superseded jobs from the dashboard queue", async () => {
    installCloudAdminApiMock({
      job: {
        status: "cancelled",
        failureCode: "superseded_by_new_job",
        resultPayload: {
          action: "superseded_by_new_job",
          supersededByJobType: "resume",
        },
        supersededByJobType: "resume",
      },
    });
    renderRoute("/");

    expect(await screen.findByText("Superseded Queue")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("link", {
        name: "Open superseded jobs for Mock World",
      }),
    );

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();
    expect(await screen.findByText("World scope")).toBeTruthy();
    expect(screen.getByDisplayValue("audit: superseded")).toBeTruthy();
    expect(
      (await screen.findAllByRole("link", { name: "Mock World" })).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByText("Superseded by resume")).toBeTruthy();
  });

  it("opens world-scoped failed jobs from the dashboard queue", async () => {
    const { requests } = installCloudAdminApiMock({
      job: {
        status: "failed",
        failureCode: "provider_error",
        failureMessage: "Provider failed to wake the world.",
      },
    });
    renderRoute("/");

    expect(await screen.findByText("Recent Failures")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("link", {
        name: "Open failed jobs for Mock World",
      }),
    );

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();
    expect(await screen.findByText("World scope")).toBeTruthy();
    expect(screen.getByDisplayValue("status: failed")).toBeTruthy();
    expect(
      (await screen.findAllByRole("link", { name: "Mock World" })).length,
    ).toBeGreaterThan(0);
    expect(
      hasJobsRequest(requests, {
        worldId: "world-1",
        status: "failed",
      }),
    ).toBe(true);
  });

  it.each(DASHBOARD_ACTIVE_ACTION_VISIBILITY_CASES)(
    "shows the expected dashboard active-job quick actions for $status worlds",
    async ({ status, present, absent }) => {
      installCloudAdminApiMock({
        world: {
          name: DASHBOARD_ACTIVE_WORLD_LABEL.name,
          status,
        },
        job: {
          status: "running",
        },
      });
      renderRoute("/");

      expect(await screen.findByText("Operator Queue")).toBeTruthy();

      for (const label of present) {
        expect(await screen.findByRole("button", { name: label })).toBeTruthy();
      }

      for (const label of absent) {
        expect(screen.queryByRole("button", { name: label })).toBeNull();
      }
    },
  );

  it.each(DASHBOARD_FAILED_ACTION_VISIBILITY_CASES)(
    "shows the expected dashboard failed-job quick actions for $status worlds",
    async ({ status, present, absent }) => {
      installCloudAdminApiMock({
        world: {
          name: DASHBOARD_FAILED_WORLD_LABEL.name,
          status,
        },
        job: {
          status: "failed",
          failureMessage: "Manual recovery needed.",
        },
      });
      renderRoute("/");

      expect(await screen.findByText("Recent Failures")).toBeTruthy();

      for (const label of present) {
        expect(await screen.findByRole("button", { name: label })).toBeTruthy();
      }

      for (const label of absent) {
        expect(screen.queryByRole("button", { name: label })).toBeNull();
      }
    },
  );

  it("requires confirmation before retrying from dashboard failed-job quick actions", async () => {
    const { requests } = installCloudAdminApiMock({
      world: {
        name: DASHBOARD_FAILED_WORLD_LABEL.name,
        status: "failed",
        failureCode: "BOOT_FAILED",
        failureMessage: "Bootstrap failed.",
      },
      job: {
        status: "failed",
        failureMessage: "Manual recovery needed.",
      },
    });
    renderRoute("/");

    expect(await screen.findByText("Recent Failures")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Retry Dashboard Failed World",
      }),
    );

    expect(
      await screen.findByText("Retry recovery for Dashboard Failed World?"),
    ).toBeTruthy();
    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/retry",
      ),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Retry recovery" }));

    expect(
      await screen.findByText("Dashboard Failed World retry queued."),
    ).toBeTruthy();
    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/retry",
      ),
    ).toBe(true);
  });

  it("requires confirmation before retrying from dashboard attention quick actions", async () => {
    const { requests } = installCloudAdminApiMock({
      world: {
        name: "Dashboard Attention World",
        status: "failed",
        failureCode: "BOOT_FAILED",
        failureMessage: "Bootstrap failed.",
      },
      job: {
        status: "succeeded",
        resultPayload: { action: "reconciled" },
      },
      attentionItem: {
        worldName: "Dashboard Attention World",
        worldStatus: "failed",
        reason: "failed_world",
        activeJobType: "retry",
        message: "Dashboard attention item needs recovery.",
      },
      driftSummary: {
        readyWorlds: 0,
        failedWorlds: 1,
        recoveryQueuedWorlds: 0,
      },
    });
    renderRoute("/");

    expect(await screen.findByText("Attention Queue")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Retry Dashboard Attention World",
      }),
    );

    expect(
      await screen.findByText("Retry recovery for Dashboard Attention World?"),
    ).toBeTruthy();
    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/retry",
      ),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Retry recovery" }));

    expect(
      await screen.findByText("Dashboard Attention World retry queued."),
    ).toBeTruthy();
    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/retry",
      ),
    ).toBe(true);
  });

  it("shows expiring danger notices when dashboard retry actions fail", async () => {
    const { requests } = installCloudAdminApiMock({
      world: {
        name: DASHBOARD_FAILED_WORLD_LABEL.name,
        status: "failed",
        failureCode: "BOOT_FAILED",
        failureMessage: "Bootstrap failed.",
      },
      job: {
        status: "failed",
        failureMessage: "Manual recovery needed.",
      },
      actionErrors: {
        retry: "Dashboard retry failed.",
      },
    });
    renderRoute("/");

    expect(await screen.findByText("Recent Failures")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Retry Dashboard Failed World",
      }),
    );
    expect(
      await screen.findByText("Retry recovery for Dashboard Failed World?"),
    ).toBeTruthy();

    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry recovery" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Dashboard retry failed.")).toBeTruthy();
    expect(
      screen.queryByText("Retry recovery for Dashboard Failed World?"),
    ).toBeNull();
    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/retry",
      ),
    ).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2_700);
    });

    expect(screen.queryByText("Dashboard retry failed.")).toBeNull();
  });

  it("opens worlds views from dashboard fleet cards", async () => {
    renderRoute("/");

    expect(await screen.findByText("Instance pool")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("link", {
        name: "Filter worlds by running instances",
      }),
    );

    expect(await screen.findByText("Managed worlds")).toBeTruthy();
    expect(screen.getByDisplayValue("power: running")).toBeTruthy();
  });

  it("opens request views from dashboard request alerts", async () => {
    const { requests } = installCloudAdminApiMock({
      requests: [
        {
          id: "request-1",
          worldName: "Pending Alert Request",
          status: "pending",
          displayStatus: "世界申请审核中。",
          failureReason: "Still waiting for review.",
          projectedWorldStatus: "queued",
          projectedDesiredState: "running",
        },
        {
          id: "request-2",
          worldName: "Disabled Alert Request",
          status: "disabled",
          displayStatus: "世界当前已被停用。",
          failureReason: "Paused by ops.",
          projectedWorldStatus: "disabled",
          projectedDesiredState: "sleeping",
        },
      ],
    });
    renderRoute("/");

    expect(await screen.findByText("Request alerts")).toBeTruthy();

    const pendingAlertLink = await screen.findByRole("link", {
      name: "Open pending requests from request alerts",
    });
    const disabledAlertLink = await screen.findByRole("link", {
      name: "Open disabled requests from request alerts",
    });
    const pendingAlertProjectedRow = within(pendingAlertLink)
      .getByText("Projected:")
      .parentElement;
    const pendingAlertDesiredRow = within(pendingAlertLink)
      .getByText("Desired:")
      .parentElement;
    const disabledAlertProjectedRow = within(disabledAlertLink)
      .getByText("Projected:")
      .parentElement;
    const disabledAlertDesiredRow = within(disabledAlertLink)
      .getByText("Desired:")
      .parentElement;

    expect(pendingAlertLink.getAttribute("data-tone")).toBe("warning");
    expect(disabledAlertLink.getAttribute("data-tone")).toBe("danger");
    expect(
      within(pendingAlertProjectedRow as HTMLElement)
        .getByText("Queued")
        .getAttribute("data-tone"),
    ).toBe("warning");
    expect(
      within(pendingAlertDesiredRow as HTMLElement)
        .getByText("Running")
        .getAttribute("data-tone"),
    ).toBe("success");
    expect(
      within(disabledAlertProjectedRow as HTMLElement)
        .getByText("Disabled")
        .getAttribute("data-tone"),
    ).toBe("danger");
    expect(
      within(disabledAlertDesiredRow as HTMLElement)
        .getByText("Sleeping")
        .getAttribute("data-tone"),
    ).toBe("neutral");

    fireEvent.click(
      pendingAlertLink,
    );

    expect(await screen.findByText("World requests")).toBeTruthy();
    expect(await screen.findByText("Pending Alert Request")).toBeTruthy();
    expect(screen.queryByText("Disabled Alert Request")).toBeNull();
    expect(screen.getByDisplayValue("Queued")).toBeTruthy();
    expect(screen.getByDisplayValue("Running")).toBeTruthy();
    expect(
      requests.some(
        (entry) =>
          entry.pathWithSearch ===
          "GET /admin/cloud/world-requests?status=pending",
      ),
    ).toBe(true);
  });

  it("opens projected request views from dashboard workflow cards", async () => {
    const { requests } = installCloudAdminApiMock({
      requests: [
        {
          id: "request-1",
          worldName: "Pending Approval Request",
          status: "pending",
          displayStatus: "世界申请审核中。",
          failureReason: "Still waiting for review.",
          projectedWorldStatus: "queued",
          projectedDesiredState: "running",
        },
        {
          id: "request-2",
          worldName: "Disabled Workflow Request",
          status: "disabled",
          displayStatus: "世界当前已被停用。",
          failureReason: "Paused by ops.",
          projectedWorldStatus: "disabled",
          projectedDesiredState: "sleeping",
        },
      ],
    });
    renderRoute("/");

    expect(await screen.findByText("Request Workflow")).toBeTruthy();
    expect(
      (
        await screen.findByRole("link", { name: "Open pending requests" })
      ).getAttribute("data-tone"),
    ).toBe("warning");
    const pendingWorkflowLink = await screen.findByRole("link", {
      name: "Open pending requests",
    });
    const disabledWorkflowLink = await screen.findByRole("link", {
      name: "Open disabled requests",
    });
    const pendingWorkflowProjectedRow = within(pendingWorkflowLink)
      .getByText("Projected:")
      .parentElement;
    const pendingWorkflowDesiredRow = within(pendingWorkflowLink)
      .getByText("Desired:")
      .parentElement;
    const disabledWorkflowProjectedRow = within(disabledWorkflowLink)
      .getByText("Projected:")
      .parentElement;
    const disabledWorkflowDesiredRow = within(disabledWorkflowLink)
      .getByText("Desired:")
      .parentElement;
    expect(disabledWorkflowLink.getAttribute("data-tone")).toBe("danger");
    expect(
      within(pendingWorkflowProjectedRow as HTMLElement)
        .getByText("Queued")
        .getAttribute("data-tone"),
    ).toBe("warning");
    expect(
      within(pendingWorkflowDesiredRow as HTMLElement)
        .getByText("Running")
        .getAttribute("data-tone"),
    ).toBe("success");
    expect(
      within(disabledWorkflowProjectedRow as HTMLElement)
        .getByText("Disabled")
        .getAttribute("data-tone"),
    ).toBe("danger");
    expect(
      within(disabledWorkflowDesiredRow as HTMLElement)
        .getByText("Sleeping")
        .getAttribute("data-tone"),
    ).toBe("neutral");

    fireEvent.click(disabledWorkflowLink);

    expect(await screen.findByText("World requests")).toBeTruthy();
    expect(await screen.findByText("Disabled Workflow Request")).toBeTruthy();
    expect(screen.queryByText("Pending Approval Request")).toBeNull();
    expect(screen.getByDisplayValue("Disabled")).toBeTruthy();
    expect(screen.getByDisplayValue("Sleeping")).toBeTruthy();
    expect(
      requests.some(
        (entry) =>
          entry.pathWithSearch ===
          "GET /admin/cloud/world-requests?status=disabled",
      ),
    ).toBe(true);
  });

  it("opens recent request detail views from dashboard workflow", async () => {
    installCloudAdminApiMock({
      requests: [
        {
          id: "request-1",
          worldName: "Older Approval Request",
          status: "pending",
          displayStatus: "世界申请审核中。",
          failureReason: "Still waiting for review.",
          projectedWorldStatus: "queued",
          projectedDesiredState: "running",
          updatedAt: "2026-04-20T00:05:00.000Z",
        },
        {
          id: "request-2",
          worldName: "Active Delivery Request",
          status: "active",
          displayStatus: "人工交付的世界已准备好。",
          failureReason: null,
          projectedWorldStatus: "ready",
          projectedDesiredState: "running",
          updatedAt: "2026-04-20T00:10:00.000Z",
        },
        {
          id: "request-3",
          worldName: "Latest Disabled Workflow Request",
          status: "disabled",
          displayStatus: "世界当前已被停用。",
          failureReason: "Paused by ops.",
          projectedWorldStatus: "disabled",
          projectedDesiredState: "sleeping",
          updatedAt: "2026-04-20T00:15:00.000Z",
        },
      ],
    });
    renderRoute("/");

    expect(await screen.findByText("Recent request changes")).toBeTruthy();
    const activeRequestLink = await screen.findByRole("link", {
      name: "Open request Active Delivery Request",
    });
    const activeRequestHeader = within(activeRequestLink)
      .getByText(/Updated/)
      .parentElement;
    const activeProjectedRow = within(activeRequestLink)
      .getByText("Projected:")
      .parentElement;
    const activeDesiredRow = within(activeRequestLink)
      .getByText("Desired:")
      .parentElement;
    expect(
      within(activeRequestHeader as HTMLElement)
        .getByText("Active")
        .getAttribute("data-tone"),
    ).toBe("success");
    expect(
      within(activeProjectedRow as HTMLElement)
        .getByText("Ready")
        .getAttribute("data-tone"),
    ).toBe("success");
    expect(
      within(activeDesiredRow as HTMLElement)
        .getByText("Running")
        .getAttribute("data-tone"),
    ).toBe("success");
    const disabledRequestLink = await screen.findByRole("link", {
      name: "Open request Latest Disabled Workflow Request",
    });
    const disabledRequestHeader = within(disabledRequestLink)
      .getByText(/Updated/)
      .parentElement;
    const disabledProjectedRow = within(disabledRequestLink)
      .getByText("Projected:")
      .parentElement;
    const disabledDesiredRow = within(disabledRequestLink)
      .getByText("Desired:")
      .parentElement;
    expect(
      within(disabledRequestHeader as HTMLElement)
        .getByText("Disabled")
        .getAttribute("data-tone"),
    ).toBe("danger");
    expect(
      within(disabledProjectedRow as HTMLElement)
        .getByText("Disabled")
        .getAttribute("data-tone"),
    ).toBe("danger");
    expect(
      within(disabledDesiredRow as HTMLElement)
        .getByText("Sleeping")
        .getAttribute("data-tone"),
    ).toBe("neutral");

    fireEvent.click(disabledRequestLink);

    expect(await screen.findByText("Request guidance")).toBeTruthy();
    expect(
      await screen.findByText("Latest Disabled Workflow Request"),
    ).toBeTruthy();
    const projectedWorldCard = screen
      .getByText("Projected world")
      .closest("div.rounded-2xl");
    expect(projectedWorldCard).toBeTruthy();
    expect(
      screen
        .getAllByText("Disabled")
        .find((element) => element.getAttribute("data-tone") === "danger")
        ?.getAttribute("data-tone"),
    ).toBe("danger");
    expect(
      within(projectedWorldCard as HTMLElement)
        .getAllByText("Disabled")
        .find((element) => element.hasAttribute("data-tone"))
        ?.getAttribute("data-tone"),
    ).toBe("danger");
    expect(
      within(projectedWorldCard as HTMLElement)
        .getByText("Sleeping")
        .getAttribute("data-tone"),
    ).toBe("neutral");
  });

  it("opens filtered worlds from attention queue shortcuts", async () => {
    renderRoute("/");

    expect(await screen.findByText("Attention Queue")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("link", {
        name: "Open worlds with critical attention",
      }),
    );

    expect(await screen.findByText("Managed worlds")).toBeTruthy();
    expect(screen.getByDisplayValue("attention: critical")).toBeTruthy();
  });

  it("opens filtered jobs from attention queue shortcuts", async () => {
    const { requests } = installCloudAdminApiMock();
    renderRoute("/");

    expect(await screen.findByText("Attention Queue")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("link", { name: "Open jobs for Mock World" }),
    );

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();
    expect(await screen.findByText("World scope")).toBeTruthy();
    expect(screen.getByDisplayValue("type: resume")).toBeTruthy();
    expect(
      (await screen.findAllByRole("link", { name: "Mock World" })).length,
    ).toBeGreaterThan(0);
    expect(
      hasJobsRequest(requests, {
        worldId: "world-1",
        jobType: "resume",
      }),
    ).toBe(true);
  });

  it("only exposes allowed quick actions from attention queue cards", async () => {
    const { requests } = installCloudAdminApiMock();
    renderRoute("/");

    expect(
      await screen.findByRole("link", { name: "Open jobs for Mock World" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Retry Mock World" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Resume Mock World" }),
    ).toBeNull();

    fireEvent.click(
      await screen.findByRole("button", { name: "Reconcile Mock World" }),
    );

    expect(
      await screen.findByText("Mock World reconcile triggered."),
    ).toBeTruthy();
    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/worlds/world-1/reconcile",
      ),
    ).toBe(true);
  });
});
