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
    renderRoute("/sessions");

    expect(await screen.findByText("Admin sessions")).toBeTruthy();
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

    fireEvent.click(
      screen.getAllByRole("button", { name: "Revoke" })[1],
    );

    expect(await screen.findByText("Revoke admin session?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revoke session" }));

    expect(await screen.findByText("Admin session revoked.")).toBeTruthy();
    expect(
      (
        await screen.findAllByText("Manual revoke", { selector: "div" })
      ).length,
    ).toBeGreaterThan(0);
    expect(
      requests.some(
        (entry) =>
          entry.url ===
          "POST /admin/cloud/admin-sessions/22222222-2222-4222-8222-222222222222/revoke",
      ),
    ).toBe(true);
  });

  it("bulk revokes selected admin sessions on the current page", async () => {
    const { requests } = installCloudAdminApiMock();
    renderRoute("/sessions");

    expect(await screen.findByText("Admin sessions")).toBeTruthy();

    fireEvent.click(
      screen.getByLabelText(
        "Select 11111111-1111-4111-8111-111111111111",
      ),
    );
    fireEvent.click(
      screen.getByLabelText(
        "Select 22222222-2222-4222-8222-222222222222",
      ),
    );

    expect(
      await screen.findByText("2 active session(s) selected on this page."),
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
        "Revoked 2 selected session(s). The current console session was included, so the next admin request will re-issue a short-lived token.",
      ),
    ).toBeTruthy();
    expect(
      (
        await screen.findAllByText("Manual revoke", { selector: "div" })
      ).length,
    ).toBeGreaterThan(0);
    expect(
      requests.some(
        (entry) =>
          entry.url === "POST /admin/cloud/admin-sessions/revoke" &&
          Array.isArray(entry.body?.sessionIds) &&
          entry.body?.sessionIds.includes(
            "11111111-1111-4111-8111-111111111111",
          ) &&
          entry.body?.sessionIds.includes(
            "22222222-2222-4222-8222-222222222222",
          ),
      ),
    ).toBe(true);
  });

  it("bulk revokes active admin sessions matching the current filters", async () => {
    const { requests } = installCloudAdminApiMock();
    renderRoute("/sessions");

    expect(await screen.findByText("Admin sessions")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "Mobile Safari" },
    });

    expect(await screen.findAllByText("Showing 1-1 of 1")).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("button", { name: "Revoke all matching" }),
    );

    expect(
      await screen.findByText("Revoke all matching admin sessions?"),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Revoke matching sessions" }),
    );

    expect(
      await screen.findByText("Revoked 1 matching active session(s)."),
    ).toBeTruthy();
    expect(await screen.findByText("Request id")).toBeTruthy();
    expect(await screen.findByText(/^mock-request-/)).toBeTruthy();
    expect(
      (
        await screen.findAllByText("Manual revoke", { selector: "div" })
      ).length,
    ).toBeGreaterThan(0);
    expect(
      requests.some(
        (entry) =>
          entry.url === "POST /admin/cloud/admin-sessions/revoke-filtered" &&
          entry.body?.query === "Mobile Safari" &&
          !("status" in (entry.body ?? {})),
      ),
    ).toBe(true);
  });

  it("revokes a matching admin session source group", async () => {
    const groupedSessions = [
      ...mockAdminSessions,
      {
        ...mockAdminSessions[1],
        id: "44444444-4444-4444-8444-444444444444",
        isCurrent: false,
        issuedFromIp: "203.0.113.88",
        issuedUserAgent: "Shared Source Browser",
        lastUsedIp: "203.0.113.88",
        lastUsedUserAgent: "Shared Source Browser",
        createdAt: "2026-04-20T00:10:00.000Z",
        updatedAt: "2026-04-20T00:20:00.000Z",
        lastUsedAt: "2026-04-20T00:20:00.000Z",
        expiresAt: "2026-04-27T01:00:00.000Z",
      },
      {
        ...mockAdminSessions[1],
        id: "55555555-5555-4555-8555-555555555555",
        isCurrent: false,
        issuedFromIp: "203.0.113.88",
        issuedUserAgent: "Shared Source Browser",
        lastUsedIp: "203.0.113.88",
        lastUsedUserAgent: "Shared Source Browser",
        createdAt: "2026-04-20T00:15:00.000Z",
        updatedAt: "2026-04-20T00:25:00.000Z",
        lastUsedAt: "2026-04-20T00:25:00.000Z",
        expiresAt: "2026-04-27T02:00:00.000Z",
      },
    ];
    const { requests } = installCloudAdminApiMock({
      adminSessions: groupedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Source groups")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "Shared Source Browser" },
    });

    expect(await screen.findAllByText("2 active")).toHaveLength(1);
    expect(await screen.findAllByText("2 total")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Revoke group" }));

    expect(await screen.findByText("Revoke source group?")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Revoke group" })[1]);

    expect(
      await screen.findByText(
        "Revoked 2 matching active session(s) in the selected source group.",
      ),
    ).toBeTruthy();
    expect(
      requests.some(
        (entry) =>
          entry.url ===
            "POST /admin/cloud/admin-session-source-groups/revoke" &&
          entry.body?.query === "Shared Source Browser" &&
          entry.body?.sourceKey ===
            Buffer.from(
              JSON.stringify(["203.0.113.88", "Shared Source Browser"]),
              "utf8",
            ).toString("base64url"),
      ),
    ).toBe(true);
  });

  it("issues source-group sorting and pagination query params", async () => {
    const generatedSessions = Array.from({ length: 7 }, (_, index) => ({
      ...mockAdminSessions[1],
      id: `${String(index + 1).padStart(8, "0")}-6666-4666-8666-666666666666`,
      isCurrent: index === 0,
      status: "active" as const,
      issuedFromIp: `203.0.113.${index + 140}`,
      issuedUserAgent: `Source Group Query ${index + 1}`,
      lastUsedIp: `203.0.113.${index + 140}`,
      lastUsedUserAgent: `Source Group Query ${index + 1}`,
      createdAt: new Date(
        Date.UTC(2026, 3, 20, 0, index, 0),
      ).toISOString(),
      updatedAt: new Date(
        Date.UTC(2026, 3, 20, 1, index, 0),
      ).toISOString(),
      lastUsedAt: new Date(
        Date.UTC(2026, 3, 20, 2, index, 0),
      ).toISOString(),
      expiresAt: new Date(
        Date.UTC(2026, 3, 21, 0, index, 0),
      ).toISOString(),
      revokedAt: null,
      revokedBySessionId: null,
      revocationReason: null,
    }));
    const { requests } = installCloudAdminApiMock({
      adminSessions: generatedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Source groups")).toBeTruthy();
    await waitFor(() => {
      expect(
        hasAdminSessionSourceGroupsRequest(requests, {
          sortBy: "activeSessions",
          sortDirection: "desc",
          page: "1",
          pageSize: "6",
        }),
      ).toBe(true);
    });

    fireEvent.change(screen.getByLabelText("Source sort"), {
      target: { value: "latestCreatedAt" },
    });
    fireEvent.change(screen.getByLabelText("Source direction"), {
      target: { value: "asc" },
    });

    await waitFor(() => {
      expect(
        hasAdminSessionSourceGroupsRequest(requests, {
          sortBy: "latestCreatedAt",
          sortDirection: "asc",
          page: "1",
          pageSize: "6",
        }),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Next groups" }));

    expect(
      (await screen.findAllByText("Showing 7-7 of 7 groups")).length,
    ).toBeGreaterThan(0);
    await waitFor(() => {
      expect(
        hasAdminSessionSourceGroupsRequest(requests, {
          sortBy: "latestCreatedAt",
          sortDirection: "asc",
          page: "2",
          pageSize: "6",
        }),
      ).toBe(true);
    });
  });

  it("focuses sessions on a selected source group and can clear the focus", async () => {
    const groupedSessions = [
      {
        ...mockAdminSessions[0],
        id: "77777777-7777-4777-8777-777777777777",
        isCurrent: true,
        status: "active" as const,
        issuedFromIp: "203.0.113.188",
        issuedUserAgent: "Focused Source Browser",
        lastUsedIp: "203.0.113.188",
        lastUsedUserAgent: "Focused Source Browser",
      },
      {
        ...mockAdminSessions[1],
        id: "88888888-8888-4888-8888-888888888888",
        isCurrent: false,
        status: "active" as const,
        issuedFromIp: "203.0.113.188",
        issuedUserAgent: "Focused Source Browser",
        lastUsedIp: "203.0.113.188",
        lastUsedUserAgent: "Focused Source Browser",
      },
      {
        ...mockAdminSessions[1],
        id: "99999999-9999-4999-8999-999999999999",
        isCurrent: false,
        status: "active" as const,
        issuedFromIp: "198.51.100.188",
        issuedUserAgent: "Other Source Browser",
        lastUsedIp: "198.51.100.188",
        lastUsedUserAgent: "Other Source Browser",
      },
    ];
    const expectedSourceKey = Buffer.from(
      JSON.stringify(["203.0.113.188", "Focused Source Browser"]),
      "utf8",
    ).toString("base64url");
    const { requests } = installCloudAdminApiMock({
      adminSessions: groupedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Source groups")).toBeTruthy();

    const focusedSourceCard = (
      await screen.findAllByTitle("Focused Source Browser")
    )
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
    expect(focusedSourceCard).toBeTruthy();

    fireEvent.click(
      within(focusedSourceCard as HTMLElement).getByRole("button", {
        name: "View sessions",
      }),
    );

    expect(await screen.findByText("Viewing source group")).toBeTruthy();
    expect(await screen.findByText("Risk timeline")).toBeTruthy();
    expect(await screen.findByText("Current snapshot")).toBeTruthy();
    expect(
      await screen.findByText("Watch threshold: 2+ active or 2+ revoked"),
    ).toBeTruthy();
    expect(
      await screen.findByText(
        "Critical threshold: 4+ active or any refresh reuse",
      ),
    ).toBeTruthy();
    expect(await screen.findByText("Current rationale")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Show matched sessions for Current snapshot",
      }),
    );

    expect(await screen.findByText("Matched sessions at this point")).toBeTruthy();
    expect(
      (await screen.findAllByText("Active threshold match")).length,
    ).toBeGreaterThan(0);

    expect(
      (await screen.findAllByText("Showing 1-2 of 2")).length,
    ).toBeGreaterThan(0);

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

    await waitFor(() => {
      expect(
        hasAdminSessionsRequest(requests, {
          sourceKey: expectedSourceKey,
          page: "1",
          pageSize: "10",
        }),
      ).toBe(true);
      expect(
        hasAdminSessionSourceGroupsRequest(requests, {
          sourceKey: expectedSourceKey,
          page: "1",
          pageSize: "6",
        }),
      ).toBe(true);
      expect(
        requests.some(
          (entry) =>
            entry.url ===
              "POST /admin/cloud/admin-session-source-groups/snapshot" &&
            entry.body?.sourceKey === expectedSourceKey,
        ),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear source focus" }));

    await waitFor(() => {
      expect(screen.queryByText("Viewing source group")).toBeNull();
    });
    expect(
      (await screen.findAllByText("Showing 1-3 of 3")).length,
    ).toBeGreaterThan(0);
  });

  it("can jump from a matched timeline session into the admin session list filters", async () => {
    const groupedSessions = [
      {
        ...mockAdminSessions[0],
        id: "77777777-7777-4777-8777-777777777777",
        isCurrent: true,
        status: "active" as const,
        issuedFromIp: "203.0.113.188",
        issuedUserAgent: "Focused Source Browser",
        lastUsedIp: "203.0.113.188",
        lastUsedUserAgent: "Focused Source Browser",
      },
      {
        ...mockAdminSessions[1],
        id: "88888888-8888-4888-8888-888888888888",
        isCurrent: false,
        status: "active" as const,
        issuedFromIp: "203.0.113.188",
        issuedUserAgent: "Focused Source Browser",
        lastUsedIp: "203.0.113.188",
        lastUsedUserAgent: "Focused Source Browser",
      },
      {
        ...mockAdminSessions[1],
        id: "99999999-9999-4999-8999-999999999999",
        isCurrent: false,
        status: "active" as const,
        issuedFromIp: "198.51.100.188",
        issuedUserAgent: "Other Source Browser",
        lastUsedIp: "198.51.100.188",
        lastUsedUserAgent: "Other Source Browser",
      },
    ];
    const expectedSourceKey = Buffer.from(
      JSON.stringify(["203.0.113.188", "Focused Source Browser"]),
      "utf8",
    ).toString("base64url");
    const { requests } = installCloudAdminApiMock({
      adminSessions: groupedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Source groups")).toBeTruthy();

    const focusedSourceCard = (
      await screen.findAllByTitle("Focused Source Browser")
    )
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
    expect(focusedSourceCard).toBeTruthy();

    fireEvent.click(
      within(focusedSourceCard as HTMLElement).getByRole("button", {
        name: "View sessions",
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Show matched sessions for Current snapshot",
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "View 77777777-7777-4777-8777-777777777777 in sessions list",
      }),
    );

    await waitFor(() => {
      expect(
        (
          screen.getByLabelText("Search") as HTMLInputElement
        ).value,
      ).toBe("77777777-7777-4777-8777-777777777777");
      expect(
        (
          screen.getByLabelText("Status") as HTMLSelectElement
        ).value,
      ).toBe("active");
      expect(
        (
          screen.getByLabelText("Scope") as HTMLSelectElement
        ).value,
      ).toBe("current");
      expect(
        hasAdminSessionsRequest(requests, {
          sourceKey: expectedSourceKey,
          status: "active",
          currentOnly: "true",
          query: "77777777-7777-4777-8777-777777777777",
          page: "1",
          pageSize: "10",
        }),
      ).toBe(true);
    });

    expect(
      (await screen.findAllByText("Showing 1-1 of 1")).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByText("Timeline focus")).toBeTruthy();
    expect(await screen.findByText("Timeline audit detail")).toBeTruthy();
    expect(await screen.findByText("Last refreshed")).toBeTruthy();
    expect(await screen.findByText("Focused source risk")).toBeTruthy();
    expect(await screen.findByText("Latest timeline snapshot")).toBeTruthy();
    expect(await screen.findByText("Synced with Event view.")).toBeTruthy();
    expect(await screen.findByText("Watch risk")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Export focused source snapshot" }),
    );

    expect(
      (await screen.findAllByText("Downloaded focused source snapshot for 1 session(s)."))
        .length,
    ).toBeGreaterThan(0);
    expect(await screen.findByText("Recent operation receipts")).toBeTruthy();
    expect(
      await screen.findByText(
        "Showing the latest 1 of up to 3 receipt(s) for this focused session.",
      ),
    ).toBeTruthy();
    expect(await screen.findByText("Focused source snapshot")).toBeTruthy();
    const receiptsRegion = screen.getByRole("region", {
      name: "Recent operation receipts",
    });
    expect(within(receiptsRegion).getByText("Session context")).toBeTruthy();
    expect(
      within(receiptsRegion).getByText("77777777-7777-4777-8777-777777777777"),
    ).toBeTruthy();
    expect(within(receiptsRegion).getByText("Source context")).toBeTruthy();
    expect(within(receiptsRegion).getByText("203.0.113.188")).toBeTruthy();
    expect(within(receiptsRegion).getByText("Request id")).toBeTruthy();
    expect(within(receiptsRegion).getByText(/^mock-request-/)).toBeTruthy();
    expect(within(receiptsRegion).getByTitle("Focused Source Browser")).toBeTruthy();
  });

  it("can revoke the focused source group from the highlighted session detail row", async () => {
    const groupedSessions = [
      {
        ...mockAdminSessions[0],
        id: "77777777-7777-4777-8777-777777777777",
        isCurrent: true,
        status: "active" as const,
        issuedFromIp: "203.0.113.188",
        issuedUserAgent: "Focused Source Browser",
        lastUsedIp: "203.0.113.188",
        lastUsedUserAgent: "Focused Source Browser",
      },
      {
        ...mockAdminSessions[1],
        id: "88888888-8888-4888-8888-888888888888",
        isCurrent: false,
        status: "active" as const,
        issuedFromIp: "203.0.113.188",
        issuedUserAgent: "Focused Source Browser",
        lastUsedIp: "203.0.113.188",
        lastUsedUserAgent: "Focused Source Browser",
      },
    ];
    const expectedSourceKey = Buffer.from(
      JSON.stringify(["203.0.113.188", "Focused Source Browser"]),
      "utf8",
    ).toString("base64url");
    const { requests } = installCloudAdminApiMock({
      adminSessions: groupedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Source groups")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View sessions" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Show matched sessions for Current snapshot",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "View 77777777-7777-4777-8777-777777777777 in sessions list",
      }),
    );

    expect(await screen.findByText("Focused source risk")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Revoke focused source" }),
    );

    expect(await screen.findByText("Revoke source group?")).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Revoke group" }).at(-1) as HTMLElement,
    );

    expect(
      await screen.findByText(
        "Revoked 2 matching active session(s) in the selected source group. The current console session was included, so the next admin request will re-issue a short-lived token.",
      ),
    ).toBeTruthy();
    expect(
      requests.some((entry) => {
        if (entry.url !== "POST /admin/cloud/admin-session-source-groups/revoke") {
          return false;
        }

        return (
          entry.body?.sourceKey === expectedSourceKey &&
          entry.body?.status === "active" &&
          !Object.prototype.hasOwnProperty.call(entry.body ?? {}, "query") &&
          !Object.prototype.hasOwnProperty.call(entry.body ?? {}, "currentOnly")
        );
      }),
    ).toBe(true);
  });

  it("can open revoke confirmation directly from a matched timeline session", async () => {
    const groupedSessions = [
      {
        ...mockAdminSessions[0],
        id: "77777777-7777-4777-8777-777777777777",
        isCurrent: true,
        status: "active" as const,
        issuedFromIp: "203.0.113.188",
        issuedUserAgent: "Focused Source Browser",
        lastUsedIp: "203.0.113.188",
        lastUsedUserAgent: "Focused Source Browser",
      },
      {
        ...mockAdminSessions[1],
        id: "88888888-8888-4888-8888-888888888888",
        isCurrent: false,
        status: "active" as const,
        issuedFromIp: "203.0.113.188",
        issuedUserAgent: "Focused Source Browser",
        lastUsedIp: "203.0.113.188",
        lastUsedUserAgent: "Focused Source Browser",
      },
    ];
    const { requests } = installCloudAdminApiMock({
      adminSessions: groupedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Source groups")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View sessions" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Show matched sessions for Current snapshot",
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Revoke 88888888-8888-4888-8888-888888888888 from timeline",
      }),
    );

    expect(await screen.findByText("Revoke admin session?")).toBeTruthy();
    expect(await screen.findByText("Timeline focus")).toBeTruthy();
    expect(await screen.findByText("Timeline audit detail")).toBeTruthy();
    expect(await screen.findByText("Focused source risk")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Export focused source snapshot" }),
    );

    expect(
      (await screen.findAllByText("Downloaded focused source snapshot for 2 session(s)."))
        .length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Revoke session" }));

    expect((await screen.findAllByText("Admin session revoked.")).length).toBeGreaterThan(
      0,
    );
    expect(await screen.findByText("Recent operation receipts")).toBeTruthy();
    expect(
      await screen.findByText(
        "Showing the latest 2 of up to 3 receipt(s) for this focused session.",
      ),
    ).toBeTruthy();
    expect(await screen.findByText("Focused source snapshot")).toBeTruthy();
    expect(await screen.findByText("Session revoke")).toBeTruthy();
    const receiptsRegion = screen.getByRole("region", {
      name: "Recent operation receipts",
    });
    expect(within(receiptsRegion).getAllByText("Session context")).toHaveLength(2);
    expect(
      within(receiptsRegion).getAllByText(
        "88888888-8888-4888-8888-888888888888",
      ).length,
    ).toBeGreaterThan(0);
    expect(within(receiptsRegion).getAllByText("Source context")).toHaveLength(2);
    expect(within(receiptsRegion).getAllByText("203.0.113.188")).toHaveLength(2);
    expect(within(receiptsRegion).getAllByText("Request id")).toHaveLength(2);
    expect(
      within(receiptsRegion).getAllByText(/^mock-request-/).length,
    ).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole("button", { name: "Clear receipts" }));

    await waitFor(() => {
      expect(screen.queryByText("Recent operation receipts")).toBeNull();
    });
    expect(
      requests.some(
        (entry) =>
          entry.url ===
          "POST /admin/cloud/admin-sessions/88888888-8888-4888-8888-888888888888/revoke",
      ),
    ).toBe(true);
  });

  it("exports the focused source-group risk timeline as CSV", async () => {
    const groupedSessions = [
      {
        ...mockAdminSessions[0],
        id: "a1111111-1111-4111-8111-111111111111",
        isCurrent: true,
        status: "active" as const,
        issuedFromIp: "203.0.113.189",
        issuedUserAgent: "Timeline Source Browser",
        lastUsedIp: "203.0.113.189",
        lastUsedUserAgent: "Timeline Source Browser",
      },
      {
        ...mockAdminSessions[1],
        id: "a2222222-2222-4222-8222-222222222222",
        isCurrent: false,
        status: "active" as const,
        issuedFromIp: "203.0.113.189",
        issuedUserAgent: "Timeline Source Browser",
        lastUsedIp: "203.0.113.189",
        lastUsedUserAgent: "Timeline Source Browser",
      },
    ];
    const expectedSourceKey = Buffer.from(
      JSON.stringify(["203.0.113.189", "Timeline Source Browser"]),
      "utf8",
    ).toString("base64url");
    const { requests } = installCloudAdminApiMock({
      adminSessions: groupedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Source groups")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View sessions" }));

    expect(await screen.findByText("Risk timeline")).toBeTruthy();
    expect(await screen.findByText("Current snapshot")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Daily summary" }));

    expect(
      await screen.findByText(/\d+ event point\(s\) grouped into \d+ day\(s\)\./),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Weekly summary" }));

    expect(
      await screen.findByText(/\d+ event point\(s\) grouped into \d+ week\(s\)\./),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Export timeline CSV" }));

    expect(
      await screen.findByText(
        /Downloaded weekly risk timeline CSV for \d+ point\(s\)\./,
      ),
    ).toBeTruthy();
    expect(
      requests.some(
        (entry) =>
          entry.url ===
            "POST /admin/cloud/admin-session-source-groups/snapshot" &&
          entry.body?.sourceKey === expectedSourceKey,
      ),
    ).toBe(true);
  });

  it("exports an admin session source-group snapshot", async () => {
    const groupedSessions = [
      {
        ...mockAdminSessions[0],
        id: "12121212-1212-4121-8121-121212121212",
        isCurrent: true,
        status: "active" as const,
        issuedFromIp: "203.0.113.200",
        issuedUserAgent: "Snapshot Source Browser",
        lastUsedIp: "203.0.113.200",
        lastUsedUserAgent: "Snapshot Source Browser",
      },
      {
        ...mockAdminSessions[1],
        id: "34343434-3434-4343-8343-343434343434",
        isCurrent: false,
        status: "revoked" as const,
        issuedFromIp: "203.0.113.200",
        issuedUserAgent: "Snapshot Source Browser",
        lastUsedIp: "203.0.113.200",
        lastUsedUserAgent: "Snapshot Source Browser",
        revocationReason: "refresh-token-reuse" as const,
      },
    ];
    const expectedSourceKey = Buffer.from(
      JSON.stringify(["203.0.113.200", "Snapshot Source Browser"]),
      "utf8",
    ).toString("base64url");
    const { requests } = installCloudAdminApiMock({
      adminSessions: groupedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Source groups")).toBeTruthy();
    expect((await screen.findAllByText("Critical risk")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Refresh reuse detected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Export snapshot" }));

    expect(
      await screen.findByText(
        "Downloaded admin session audit snapshot for 2 session(s).",
      ),
    ).toBeTruthy();
    expect(await screen.findByText("Request id")).toBeTruthy();
    expect(await screen.findByText(/^mock-request-/)).toBeTruthy();
    expect(
      requests.some(
        (entry) =>
          entry.url ===
            "POST /admin/cloud/admin-session-source-groups/snapshot" &&
          entry.body?.sourceKey === expectedSourceKey,
      ),
    ).toBe(true);
  });

  it("filters source groups by risk level and revokes the matching groups", async () => {
    const groupedSessions = [
      {
        ...mockAdminSessions[0],
        id: "56565656-5656-4565-8565-565656565656",
        isCurrent: false,
        status: "active" as const,
        issuedFromIp: "203.0.113.210",
        issuedUserAgent: "Risk Watch Browser",
        lastUsedIp: "203.0.113.210",
        lastUsedUserAgent: "Risk Watch Browser",
      },
      {
        ...mockAdminSessions[1],
        id: "67676767-6767-4676-8676-676767676767",
        isCurrent: false,
        status: "active" as const,
        issuedFromIp: "203.0.113.210",
        issuedUserAgent: "Risk Watch Browser",
        lastUsedIp: "203.0.113.210",
        lastUsedUserAgent: "Risk Watch Browser",
      },
      {
        ...mockAdminSessions[2],
        id: "78787878-7878-4787-8787-787878787878",
        isCurrent: true,
        status: "active" as const,
        issuedFromIp: "198.51.100.210",
        issuedUserAgent: "Risk Normal Browser",
        lastUsedIp: "198.51.100.210",
        lastUsedUserAgent: "Risk Normal Browser",
      },
    ];
    const { requests } = installCloudAdminApiMock({
      adminSessions: groupedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Source groups")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Source risk"), {
      target: { value: "watch" },
    });

    await waitFor(() => {
      expect(
        hasAdminSessionSourceGroupsRequest(requests, {
          riskLevel: "watch",
          page: "1",
          pageSize: "6",
        }),
      ).toBe(true);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Revoke matching risk groups" }),
    );
    expect(
      await screen.findByText("Revoke matching risk groups?"),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Revoke risk groups" }),
    );

    expect(
      await screen.findByText(
        "Revoked 2 active session(s) across 1 risk group(s).",
      ),
    ).toBeTruthy();
    expect(await screen.findByText("Request id")).toBeTruthy();
    expect(await screen.findByText(/^mock-request-/)).toBeTruthy();
    expect(
      requests.some(
        (entry) =>
          entry.url ===
            "POST /admin/cloud/admin-session-source-groups/revoke-risk" &&
          entry.body?.riskLevel === "watch",
      ),
    ).toBe(true);
  });

  it("switches to a risk quick view and exports the matching risk snapshot", async () => {
    const groupedSessions = [
      {
        ...mockAdminSessions[0],
        id: "89898989-8989-4898-8898-898989898989",
        isCurrent: false,
        status: "active" as const,
        issuedFromIp: "203.0.113.211",
        issuedUserAgent: "Quick View Watch Browser",
        lastUsedIp: "203.0.113.211",
        lastUsedUserAgent: "Quick View Watch Browser",
      },
      {
        ...mockAdminSessions[1],
        id: "90909090-9090-4909-8909-909090909090",
        isCurrent: false,
        status: "active" as const,
        issuedFromIp: "203.0.113.211",
        issuedUserAgent: "Quick View Watch Browser",
        lastUsedIp: "203.0.113.211",
        lastUsedUserAgent: "Quick View Watch Browser",
      },
      {
        ...mockAdminSessions[2],
        id: "91919191-9191-4919-8919-919191919191",
        isCurrent: true,
        status: "active" as const,
        issuedFromIp: "198.51.100.211",
        issuedUserAgent: "Quick View Normal Browser",
        lastUsedIp: "198.51.100.211",
        lastUsedUserAgent: "Quick View Normal Browser",
        revocationReason: null,
        revokedAt: null,
        revokedBySessionId: null,
      },
    ];
    const { requests } = installCloudAdminApiMock({
      adminSessions: groupedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Source groups")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Watch risk" }));

    await waitFor(() => {
      expect(
        hasAdminSessionSourceGroupsRequest(requests, {
          riskLevel: "watch",
          page: "1",
          pageSize: "6",
        }),
      ).toBe(true);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Export risk snapshot" }),
    );

    expect(
      await screen.findByText(
        "Downloaded risk snapshot for 1 group(s) and 2 session(s).",
      ),
    ).toBeTruthy();
    expect(await screen.findByText("Request id")).toBeTruthy();
    expect(await screen.findByText(/^mock-request-/)).toBeTruthy();
    expect(
      requests.some(
        (entry) =>
          entry.url ===
            "POST /admin/cloud/admin-session-source-groups/risk-snapshot" &&
          entry.body?.riskLevel === "watch",
      ),
    ).toBe(true);
  });

  it("exports the matching risk snapshot as groups CSV", async () => {
    const groupedSessions = [
      {
        ...mockAdminSessions[0],
        id: "92929292-9292-4929-8929-929292929292",
        isCurrent: false,
        status: "active" as const,
        issuedFromIp: "203.0.113.212",
        issuedUserAgent: "Quick View Csv Browser",
        lastUsedIp: "203.0.113.212",
        lastUsedUserAgent: "Quick View Csv Browser",
      },
      {
        ...mockAdminSessions[1],
        id: "93939393-9393-4939-8939-939393939393",
        isCurrent: false,
        status: "active" as const,
        issuedFromIp: "203.0.113.212",
        issuedUserAgent: "Quick View Csv Browser",
        lastUsedIp: "203.0.113.212",
        lastUsedUserAgent: "Quick View Csv Browser",
      },
    ];
    const { requests } = installCloudAdminApiMock({
      adminSessions: groupedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Source groups")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Watch risk" }));

    await waitFor(() => {
      expect(
        hasAdminSessionSourceGroupsRequest(requests, {
          riskLevel: "watch",
          page: "1",
          pageSize: "6",
        }),
      ).toBe(true);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Export risk groups CSV" }),
    );

    expect(
      await screen.findByText("Downloaded risk groups CSV for 1 group(s)."),
    ).toBeTruthy();
    expect(await screen.findByText("Request id")).toBeTruthy();
    expect(await screen.findByText(/^mock-request-/)).toBeTruthy();
    expect(
      requests.some(
        (entry) =>
          entry.url ===
            "POST /admin/cloud/admin-session-source-groups/risk-snapshot" &&
          entry.body?.riskLevel === "watch",
      ),
    ).toBe(true);
  });

  it("exports the matching risk snapshot as sessions CSV", async () => {
    const groupedSessions = [
      {
        ...mockAdminSessions[0],
        id: "94949494-9494-4949-8949-949494949494",
        isCurrent: false,
        status: "active" as const,
        issuedFromIp: "203.0.113.213",
        issuedUserAgent: "Quick View Session Csv Browser",
        lastUsedIp: "203.0.113.213",
        lastUsedUserAgent: "Quick View Session Csv Browser",
      },
      {
        ...mockAdminSessions[1],
        id: "95959595-9595-4959-8959-959595959595",
        isCurrent: false,
        status: "active" as const,
        issuedFromIp: "203.0.113.213",
        issuedUserAgent: "Quick View Session Csv Browser",
        lastUsedIp: "203.0.113.213",
        lastUsedUserAgent: "Quick View Session Csv Browser",
      },
    ];
    const { requests } = installCloudAdminApiMock({
      adminSessions: groupedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Source groups")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Watch risk" }));

    await waitFor(() => {
      expect(
        hasAdminSessionSourceGroupsRequest(requests, {
          riskLevel: "watch",
          page: "1",
          pageSize: "6",
        }),
      ).toBe(true);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Export risk sessions CSV" }),
    );

    expect(
      await screen.findByText("Downloaded risk sessions CSV for 2 session(s)."),
    ).toBeTruthy();
    expect(await screen.findByText("Request id")).toBeTruthy();
    expect(await screen.findByText(/^mock-request-/)).toBeTruthy();
    expect(
      requests.some(
        (entry) =>
          entry.url ===
            "POST /admin/cloud/admin-session-source-groups/risk-snapshot" &&
          entry.body?.riskLevel === "watch",
      ),
    ).toBe(true);
  });

  it("shows skipped-session messaging when bulk revoke partially succeeds", async () => {
    const { requests } = installCloudAdminApiMock({
      bulkRevokeUnavailableSessionIds: [
        "22222222-2222-4222-8222-222222222222",
      ],
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Admin sessions")).toBeTruthy();

    fireEvent.click(
      screen.getByLabelText(
        "Select 11111111-1111-4111-8111-111111111111",
      ),
    );
    fireEvent.click(
      screen.getByLabelText(
        "Select 22222222-2222-4222-8222-222222222222",
      ),
    );

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
        "Revoked 1 selected session(s). 1 session(s) were already unavailable. The current console session was included, so the next admin request will re-issue a short-lived token.",
      ),
    ).toBeTruthy();
    expect(await screen.findByText("Request id")).toBeTruthy();
    expect(await screen.findByText(/^mock-request-/)).toBeTruthy();
    expect(
      (
        await screen.findAllByText("Manual revoke", { selector: "div" })
      ).length,
    ).toBeGreaterThan(0);
    expect(
      requests.some(
        (entry) =>
          entry.url === "POST /admin/cloud/admin-sessions/revoke" &&
          Array.isArray(entry.body?.sessionIds) &&
          entry.body?.sessionIds.includes(
            "11111111-1111-4111-8111-111111111111",
          ) &&
          entry.body?.sessionIds.includes(
            "22222222-2222-4222-8222-222222222222",
          ),
      ),
    ).toBe(true);
  });

  it("shows a stale-selection warning when bulk revoke skips every selected session", async () => {
    installCloudAdminApiMock({
      bulkRevokeUnavailableSessionIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Admin sessions")).toBeTruthy();

    fireEvent.click(
      screen.getByLabelText(
        "Select 11111111-1111-4111-8111-111111111111",
      ),
    );
    fireEvent.click(
      screen.getByLabelText(
        "Select 22222222-2222-4222-8222-222222222222",
      ),
    );

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
        "No selected admin sessions were revoked. The list may already be stale.",
      ),
    ).toBeTruthy();
    expect(
      (
        await screen.findAllByText("Manual revoke", { selector: "div" })
      ).length,
    ).toBeGreaterThan(0);
  });

  it("shows notice errors when revoking a single admin session fails", async () => {
    const { requests } = installCloudAdminApiMock({
      revokeAdminSessionError: "Admin session revoke failed.",
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Admin sessions")).toBeTruthy();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Revoke" })[1],
    );
    expect(await screen.findByText("Revoke admin session?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Revoke session" }));

    expect(
      await screen.findByText("Admin session revoke failed."),
    ).toBeTruthy();
    expect(screen.queryByText("Revoke admin session?")).toBeNull();
    expect(
      requests.some(
        (entry) =>
          entry.url ===
          "POST /admin/cloud/admin-sessions/22222222-2222-4222-8222-222222222222/revoke",
      ),
    ).toBe(true);
  });

  it("shows notice errors when bulk revoking selected admin sessions fails", async () => {
    const { requests } = installCloudAdminApiMock({
      bulkRevokeAdminSessionsError: "Bulk admin revoke failed.",
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Admin sessions")).toBeTruthy();

    fireEvent.click(
      screen.getByLabelText(
        "Select 11111111-1111-4111-8111-111111111111",
      ),
    );
    fireEvent.click(
      screen.getByLabelText(
        "Select 22222222-2222-4222-8222-222222222222",
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Revoke selected" }),
    );
    expect(
      await screen.findByText("Revoke selected admin sessions?"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Revoke selected" })[1],
    );

    expect(await screen.findByText("Bulk admin revoke failed.")).toBeTruthy();
    expect(screen.queryByText("Revoke selected admin sessions?")).toBeNull();
    expect(
      await screen.findByText("2 active session(s) selected on this page."),
    ).toBeTruthy();
    expect(
      requests.some(
        (entry) => entry.url === "POST /admin/cloud/admin-sessions/revoke",
      ),
    ).toBe(true);
  });

  it("shows notice errors when revoking filtered admin sessions fails", async () => {
    const { requests } = installCloudAdminApiMock({
      filteredRevokeAdminSessionsError: "Filtered admin revoke failed.",
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Admin sessions")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "Mobile Safari" },
    });
    expect(await screen.findAllByText("Showing 1-1 of 1")).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("button", { name: "Revoke all matching" }),
    );
    expect(
      await screen.findByText("Revoke all matching admin sessions?"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Revoke matching sessions" }),
    );

    expect(
      await screen.findByText("Filtered admin revoke failed."),
    ).toBeTruthy();
    expect(
      screen.queryByText("Revoke all matching admin sessions?"),
    ).toBeNull();
    expect(
      requests.some(
        (entry) =>
          entry.url === "POST /admin/cloud/admin-sessions/revoke-filtered" &&
          entry.body?.query === "Mobile Safari",
      ),
    ).toBe(true);
  });

  it("selects only active sessions when bulk-selecting the current admin session page", async () => {
    const generatedSessions = Array.from({ length: 12 }, (_, index) => {
      const isRevoked = index === 0 || index === 11;
      return {
        ...mockAdminSessions[1],
        id: `${String(index + 1).padStart(8, "0")}-4444-4444-8444-444444444444`,
        isCurrent: index === 1,
        status: isRevoked ? ("revoked" as const) : ("active" as const),
        createdAt: new Date(
          Date.UTC(2026, 3, 20, 0, 0, 0) - index * 60_000,
        ).toISOString(),
        updatedAt: new Date(
          Date.UTC(2026, 3, 20, 1, 0, 0) - index * 60_000,
        ).toISOString(),
        lastUsedAt: new Date(
          Date.UTC(2026, 3, 20, 2, 0, 0) - index * 60_000,
        ).toISOString(),
        expiresAt: new Date(
          Date.UTC(2026, 3, 21, 0, 0, 0) + (11 - index) * 60_000,
        ).toISOString(),
        issuedFromIp: `203.0.113.${index + 30}`,
        issuedUserAgent: `Bulk Page Browser ${index + 1}`,
        revokedAt: isRevoked ? "2026-04-20T00:40:00.000Z" : null,
        revokedBySessionId: isRevoked
          ? "00000001-4444-4444-8444-444444444444"
          : null,
        revocationReason: isRevoked
          ? ("manual-revocation" as const)
          : null,
      };
    });

    const { requests } = installCloudAdminApiMock({
      adminSessions: generatedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findAllByText("Showing 1-10 of 12")).toHaveLength(2);

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
        return (
          sessionIds.length === 9 &&
          sessionIds.includes(
            "00000002-4444-4444-8444-444444444444",
          ) &&
          sessionIds.includes(
            "00000010-4444-4444-8444-444444444444",
          ) &&
          !sessionIds.includes(
            "00000001-4444-4444-8444-444444444444",
          )
        );
      }),
    ).toBe(true);
  });

  it("filters and paginates admin sessions", async () => {
    const generatedSessions = Array.from({ length: 12 }, (_, index) => {
      const isRevoked = index === 11;
      const createdAt = new Date(
        Date.UTC(2026, 3, 20, 0, 0, 0) - index * 60_000,
      ).toISOString();
      const updatedAt = new Date(
        Date.UTC(2026, 3, 20, 1, 0, 0) - index * 60_000,
      ).toISOString();
      const lastUsedAt = new Date(
        Date.UTC(2026, 3, 20, 2, 0, 0) - index * 60_000,
      ).toISOString();
      const expiresAt = new Date(
        Date.UTC(2026, 3, 21, 0, 0, 0) + (11 - index) * 60_000,
      ).toISOString();
      return {
        ...mockAdminSessions[1],
        id: `${String(index + 1).padStart(8, "0")}-2222-4222-8222-222222222222`,
        isCurrent: index === 0,
        status: isRevoked ? ("revoked" as const) : ("active" as const),
        createdAt,
        updatedAt,
        lastUsedAt,
        expiresAt,
        issuedFromIp: `203.0.113.${index + 10}`,
        issuedUserAgent: `Browser ${index + 1}`,
        revokedAt: isRevoked ? "2026-04-20T00:40:00.000Z" : null,
        revokedBySessionId: isRevoked
          ? "00000001-2222-4222-8222-222222222222"
          : null,
        revocationReason: isRevoked
          ? ("manual-revocation" as const)
          : null,
      };
    });

    const { requests } = installCloudAdminApiMock({
      adminSessions: generatedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findAllByText("Showing 1-10 of 12")).toHaveLength(2);
    expect(screen.getAllByRole("row")[1]?.textContent).toContain(
      "00000001-2222-4222-8222-222222222222",
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findAllByText("Showing 11-12 of 12")).toHaveLength(2);
    expect(
      await screen.findByText("00000012-2222-4222-8222-222222222222"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Recently revoked" }),
    );

    expect(await screen.findAllByText("Showing 1-1 of 1")).toHaveLength(2);
    expect(
      await screen.findByText("00000012-2222-4222-8222-222222222222"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Expiring soon" }),
    );

    expect(await screen.findAllByText("Showing 1-10 of 11")).toHaveLength(2);
    await waitFor(() => {
      expect(screen.getAllByRole("row")[1]?.textContent).toContain(
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
      expect(screen.getAllByRole("row")[1]?.textContent).toContain(
        "00000011-2222-4222-8222-222222222222",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(await screen.findAllByText("Showing 1-10 of 12")).toHaveLength(2);
    await waitFor(() => {
      expect(screen.getAllByRole("row")[1]?.textContent).toContain(
        "00000001-2222-4222-8222-222222222222",
      );
    });

    expect(
      hasAdminSessionsRequest(requests, {
        sortBy: "updatedAt",
        sortDirection: "desc",
        page: "1",
        pageSize: "10",
      }),
    ).toBe(true);
  });

  it("issues admin session quick-view and sorting query params", async () => {
    const generatedSessions = Array.from({ length: 12 }, (_, index) => ({
      ...mockAdminSessions[1],
      id: `${String(index + 1).padStart(8, "0")}-3333-4333-8333-333333333333`,
      isCurrent: index === 0,
      status: index === 11 ? ("revoked" as const) : ("active" as const),
      createdAt: new Date(
        Date.UTC(2026, 3, 20, 0, 0, 0) - index * 60_000,
      ).toISOString(),
      updatedAt: new Date(
        Date.UTC(2026, 3, 20, 1, 0, 0) - index * 60_000,
      ).toISOString(),
      lastUsedAt: new Date(
        Date.UTC(2026, 3, 20, 2, 0, 0) - index * 60_000,
      ).toISOString(),
      expiresAt: new Date(
        Date.UTC(2026, 3, 21, 0, 0, 0) + (11 - index) * 60_000,
      ).toISOString(),
      issuedFromIp: `198.51.100.${index + 20}`,
      issuedUserAgent: `Quick View Browser ${index + 1}`,
      revokedAt: index === 11 ? "2026-04-20T00:40:00.000Z" : null,
      revokedBySessionId:
        index === 11
          ? "00000001-3333-4333-8333-333333333333"
          : null,
      revocationReason:
        index === 11
          ? ("manual-revocation" as const)
          : null,
    }));

    const { requests } = installCloudAdminApiMock({
      adminSessions: generatedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findByText("Admin sessions")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Current session" }));

    expect(await screen.findAllByText("Showing 1-1 of 1")).toHaveLength(2);
    expect(
      await screen.findByText("00000001-3333-4333-8333-333333333333"),
    ).toBeTruthy();
    await waitFor(() => {
      expect(
        hasAdminSessionsRequest(requests, {
          currentOnly: "true",
          sortBy: "updatedAt",
          sortDirection: "desc",
          page: "1",
          pageSize: "10",
        }),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Expiring soon" }));

    expect(await screen.findAllByText("Showing 1-10 of 11")).toHaveLength(2);
    await waitFor(() => {
      expect(
        hasAdminSessionsRequest(requests, {
          status: "active",
          sortBy: "expiresAt",
          sortDirection: "asc",
          page: "1",
          pageSize: "10",
        }),
      ).toBe(true);
    });

    fireEvent.change(screen.getByLabelText("Sort by"), {
      target: { value: "createdAt" },
    });
    fireEvent.change(screen.getByLabelText("Direction"), {
      target: { value: "asc" },
    });

    await waitFor(() => {
      expect(
        hasAdminSessionsRequest(requests, {
          status: "active",
          sortBy: "createdAt",
          sortDirection: "asc",
          page: "1",
          pageSize: "10",
        }),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(await screen.findAllByText("Showing 1-10 of 12")).toHaveLength(2);
    await waitFor(() => {
      expect(
        hasAdminSessionsRequest(requests, {
          sortBy: "updatedAt",
          sortDirection: "desc",
          page: "1",
          pageSize: "10",
        }),
      ).toBe(true);
    });
  });

  it("clears bulk-selected admin sessions when paging to a different result set", async () => {
    const generatedSessions = Array.from({ length: 12 }, (_, index) => ({
      ...mockAdminSessions[1],
      id: `${String(index + 1).padStart(8, "0")}-5555-4555-8555-555555555555`,
      isCurrent: index === 0,
      status: "active" as const,
      createdAt: new Date(
        Date.UTC(2026, 3, 20, 0, 0, 0) - index * 60_000,
      ).toISOString(),
      updatedAt: new Date(
        Date.UTC(2026, 3, 20, 1, 0, 0) - index * 60_000,
      ).toISOString(),
      lastUsedAt: new Date(
        Date.UTC(2026, 3, 20, 2, 0, 0) - index * 60_000,
      ).toISOString(),
      expiresAt: new Date(
        Date.UTC(2026, 3, 21, 0, 0, 0) + (11 - index) * 60_000,
      ).toISOString(),
      issuedFromIp: `198.51.100.${index + 40}`,
      issuedUserAgent: `Paging Browser ${index + 1}`,
      revokedAt: null,
      revokedBySessionId: null,
      revocationReason: null,
    }));

    installCloudAdminApiMock({
      adminSessions: generatedSessions,
    });
    renderRoute("/sessions");

    expect(await screen.findAllByText("Showing 1-10 of 12")).toHaveLength(2);

    fireEvent.click(
      screen.getByLabelText("Select all active admin sessions"),
    );
    expect(
      await screen.findByText("10 active session(s) selected on this page."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findAllByText("Showing 11-12 of 12")).toHaveLength(2);
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
    renderRoute("/");

    expect(await screen.findByText("Operator Queue")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("link", { name: /Delayed jobs/i }),
    );

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();
    expect(screen.getByDisplayValue("queue: delayed")).toBeTruthy();
    expect(await screen.findByText("No jobs match this filter.")).toBeTruthy();
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
    renderRoute("/");

    expect(await screen.findByText("Attention Queue")).toBeTruthy();

    fireEvent.click(
      await screen.findByRole("link", { name: "Open jobs for Mock World" }),
    );

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();
    expect(screen.getByDisplayValue("type: resume")).toBeTruthy();
    expect(screen.getByDisplayValue("+8613800138000")).toBeTruthy();
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
