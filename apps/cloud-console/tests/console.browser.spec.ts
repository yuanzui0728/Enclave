import { test, expect } from "@playwright/test";
import {
  apiFetch,
  assertSuccessfulPost,
  issueAdminAccessToken,
} from "../../cloud-api/scripts/cloud-api-test-harness.mjs";
import { startBrowserSmokeStack } from "./browser-harness";

async function createPendingWorldRequest(
  baseUrl: string,
  phone: string,
  worldName: string,
) {
  const sendCodeResponse = await apiFetch(baseUrl, "/cloud/auth/send-code", {
    method: "POST",
    body: {
      phone,
    },
  });
  assertSuccessfulPost(
    sendCodeResponse,
    "send-code should succeed for browser smoke",
  );

  const verifyCodeResponse = await apiFetch(
    baseUrl,
    "/cloud/auth/verify-code",
    {
      method: "POST",
      body: {
        phone,
        code: sendCodeResponse.body.debugCode,
      },
    },
  );
  assertSuccessfulPost(
    verifyCodeResponse,
    "verify-code should succeed for browser smoke",
  );

  const requestResponse = await apiFetch(baseUrl, "/cloud/me/world-requests", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${verifyCodeResponse.body.accessToken}`,
    },
    body: {
      worldName,
    },
  });
  assertSuccessfulPost(
    requestResponse,
    "creating a browser smoke request should succeed",
  );

  return requestResponse.body;
}

async function activateWorldRequest(params: {
  baseUrl: string;
  adminSecret: string;
  requestId: string;
  apiBaseUrl: string;
  adminUrl: string;
}) {
  const response = await apiFetch(
    params.baseUrl,
    `/admin/cloud/world-requests/${params.requestId}`,
    {
      method: "PATCH",
      headers: {
        "X-Admin-Secret": params.adminSecret,
      },
      body: {
        status: "active",
        apiBaseUrl: params.apiBaseUrl,
        adminUrl: params.adminUrl,
        note: "Activated by browser smoke.",
      },
    },
  );
  assertSuccessfulPost(response, "activating browser smoke request should succeed");
  return response.body;
}

async function getWorldIdByPhone(params: {
  baseUrl: string;
  adminSecret: string;
  phone: string;
}) {
  const worldsResponse = await apiFetch(params.baseUrl, "/admin/cloud/worlds", {
    headers: {
      "X-Admin-Secret": params.adminSecret,
    },
  });
  expect(worldsResponse.status).toBe(200);

  const world = worldsResponse.body.find((entry: { phone: string }) => entry.phone === params.phone);
  expect(world).toBeTruthy();
  return world.id as string;
}

async function updateWorldStatus(params: {
  baseUrl: string;
  adminSecret: string;
  worldId: string;
  status: "ready" | "failed";
}) {
  const response = await apiFetch(
    params.baseUrl,
    `/admin/cloud/worlds/${params.worldId}`,
    {
      method: "PATCH",
      headers: {
        "X-Admin-Secret": params.adminSecret,
      },
      body: {
        status: params.status,
      },
    },
  );
  assertSuccessfulPost(response, `updating world to ${params.status} should succeed`);
  return response.body;
}

async function performWorldAction(params: {
  baseUrl: string;
  adminSecret: string;
  worldId: string;
  action: "resume" | "suspend" | "retry" | "reconcile";
}) {
  const response = await apiFetch(
    params.baseUrl,
    `/admin/cloud/worlds/${params.worldId}/${params.action}`,
    {
      method: "POST",
      headers: {
        "X-Admin-Secret": params.adminSecret,
      },
    },
  );
  assertSuccessfulPost(response, `${params.action} action should succeed`);
  return response.body;
}

async function getWorldBootstrapConfig(params: {
  baseUrl: string;
  adminSecret: string;
  worldId: string;
}) {
  const response = await apiFetch(
    params.baseUrl,
    `/admin/cloud/worlds/${params.worldId}/bootstrap-config`,
    {
      headers: {
        "X-Admin-Secret": params.adminSecret,
      },
    },
  );
  assertSuccessfulPost(response, "loading bootstrap config should succeed");
  return response.body;
}

async function reportWorldRuntimeFailure(params: {
  baseUrl: string;
  worldId: string;
  callbackToken: string;
  failureMessage: string;
}) {
  const response = await apiFetch(
    params.baseUrl,
    `/internal/worlds/${params.worldId}/fail`,
    {
      method: "POST",
      headers: {
        "X-World-Callback-Token": params.callbackToken,
      },
      body: {
        failureMessage: params.failureMessage,
      },
    },
  );
  assertSuccessfulPost(response, "runtime failure callback should succeed");
  return response.body;
}

async function waitForWorldJobsToSettle(params: {
  baseUrl: string;
  adminSecret: string;
  worldId: string;
  timeoutMs?: number;
}) {
  const deadline = Date.now() + (params.timeoutMs ?? 10_000);

  while (Date.now() < deadline) {
    const response = await apiFetch(params.baseUrl, "/admin/cloud/jobs", {
      headers: {
        "X-Admin-Secret": params.adminSecret,
      },
    });
    expect(response.status).toBe(200);

    const jobs = response.body.items.filter(
      (job: { worldId: string; status: string }) =>
        job.worldId === params.worldId,
    );

    if (
      jobs.length > 0 &&
      jobs.every(
        (job: { status: string }) =>
          job.status !== "pending" && job.status !== "running",
      )
    ) {
      return jobs;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  }

  throw new Error(`jobs for world ${params.worldId} did not settle in time`);
}

async function waitForWorldJobStatus(params: {
  baseUrl: string;
  adminSecret: string;
  worldId: string;
  statuses: Array<"pending" | "running" | "succeeded" | "failed" | "cancelled">;
  timeoutMs?: number;
}) {
  const deadline = Date.now() + (params.timeoutMs ?? 10_000);

  while (Date.now() < deadline) {
    const response = await apiFetch(params.baseUrl, "/admin/cloud/jobs", {
      headers: {
        "X-Admin-Secret": params.adminSecret,
      },
    });
    expect(response.status).toBe(200);

    const matchedJob = response.body.items.find(
      (job: { worldId: string; status: string }) =>
        job.worldId === params.worldId && params.statuses.includes(job.status as never),
    );

    if (matchedJob) {
      return matchedJob;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  }

  throw new Error(
    `job for world ${params.worldId} did not enter one of [${params.statuses.join(", ")}] in time`,
  );
}

async function issueBrowserAdminSession(params: {
  baseUrl: string;
  adminSecret: string;
  userAgent: string;
  ip: string;
}) {
  const response = await issueAdminAccessToken(
    params.baseUrl,
    params.adminSecret,
    {
      "User-Agent": params.userAgent,
      "X-Forwarded-For": params.ip,
    },
  );
  assertSuccessfulPost(response, "issuing a browser seed admin session should succeed");
  return response.body;
}

async function listAdminSessions(params: {
  baseUrl: string;
  adminSecret: string;
  query?: string;
  status?: "active" | "expired" | "revoked";
  sortBy?: "updatedAt" | "createdAt" | "expiresAt" | "lastUsedAt" | "revokedAt";
  sortDirection?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params.query) {
    searchParams.set("query", params.query);
  }
  if (params.status) {
    searchParams.set("status", params.status);
  }
  if (params.sortBy) {
    searchParams.set("sortBy", params.sortBy);
  }
  if (params.sortDirection) {
    searchParams.set("sortDirection", params.sortDirection);
  }
  if (typeof params.page === "number") {
    searchParams.set("page", String(params.page));
  }
  if (typeof params.pageSize === "number") {
    searchParams.set("pageSize", String(params.pageSize));
  }

  const search = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
  const response = await apiFetch(
    params.baseUrl,
    `/admin/cloud/admin-sessions${search}`,
    {
      headers: {
        "X-Admin-Secret": params.adminSecret,
      },
    },
  );
  expect(response.status).toBe(200);
  return response.body;
}

async function waitForAdminSessionByUserAgent(params: {
  baseUrl: string;
  adminSecret: string;
  userAgent: string;
  status?: "active" | "expired" | "revoked";
  timeoutMs?: number;
}) {
  const deadline = Date.now() + (params.timeoutMs ?? 10_000);

  while (Date.now() < deadline) {
    const response = await listAdminSessions({
      baseUrl: params.baseUrl,
      adminSecret: params.adminSecret,
      query: params.userAgent,
      status: params.status,
    });
    const session = response.items.find(
      (item: { issuedUserAgent?: string | null }) =>
        item.issuedUserAgent === params.userAgent,
    );

    if (session) {
      return session;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  }

  throw new Error(
    `admin session for user agent ${params.userAgent} did not appear in time`,
  );
}

async function revokeAdminSessionById(params: {
  baseUrl: string;
  adminSecret: string;
  sessionId: string;
}) {
  const response = await apiFetch(
    params.baseUrl,
    `/admin/cloud/admin-sessions/${params.sessionId}/revoke`,
    {
      method: "POST",
      headers: {
        "X-Admin-Secret": params.adminSecret,
      },
    },
  );
  assertSuccessfulPost(response, "revoking browser seed admin session should succeed");
  return response.body;
}

test.describe("cloud-console browser smoke", () => {
  let stack: Awaited<ReturnType<typeof startBrowserSmokeStack>>;

  test.beforeAll(async () => {
    stack = await startBrowserSmokeStack();
  });

  test.afterAll(async () => {
    if (stack) {
      await stack.cleanup();
    }
  });

  test("activates a request and handles modal dismissal in a real browser", async ({
    page,
  }) => {
    const phone = "+8613812345688";
    const worldName = "Browser Smoke World";
    const request = await createPendingWorldRequest(
      stack.cloudApi.baseUrl,
      phone,
      worldName,
    );
    const browserErrors: string[] = [];

    page.on("pageerror", (error) => {
      browserErrors.push(error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        browserErrors.push(message.text());
      }
    });

    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();

    await page.goto(`${stack.consoleServer.baseUrl}/requests/${request.id}`);
    await expect(page.getByText("Request guidance")).toBeVisible();
    await page.getByLabel("Status").selectOption("active");
    await page
      .getByLabel("World API base URL")
      .fill("https://browser-world.example.com/api/");
    await page
      .getByLabel("World admin URL")
      .fill("https://browser-world.example.com/admin/");
    await page.getByLabel("Ops note").fill("Activated by browser smoke.");
    await page.getByRole("button", { name: "Save request" }).click();

    const saveNotice = page.getByText("World request saved.");
    await expect(saveNotice).toBeVisible();
    await expect(saveNotice).toBeHidden({ timeout: 5_000 });

    const worldsResponse = await apiFetch(
      stack.cloudApi.baseUrl,
      "/admin/cloud/worlds",
      {
        headers: {
          "X-Admin-Secret": stack.cloudApi.adminSecret,
        },
      },
    );
    expect(worldsResponse.status).toBe(200);
    expect(worldsResponse.body.length).toBe(1);

    await page.goto(`${stack.consoleServer.baseUrl}/worlds`);
    await expect(page.getByText("Managed worlds")).toBeVisible();
    await expect(
      page.locator("a").filter({ hasText: worldName }).first(),
    ).toBeVisible();
    await page.locator("a").filter({ hasText: worldName }).first().click();

    await expect(page.getByText("Bootstrap package")).toBeVisible();
    await expect(page.getByLabel("World API base URL")).toHaveValue(
      "https://browser-world.example.com/api",
    );
    await expect(page.getByLabel("World admin URL")).toHaveValue(
      "https://browser-world.example.com/admin",
    );

    await page.getByRole("button", { name: "Suspend" }).click();
    await expect(page.getByText(`Suspend ${worldName}?`)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText(`Suspend ${worldName}?`)).toBeHidden();

    await page.getByRole("link", { name: "Jobs" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/jobs");
    await expect(page.getByText(/^Lifecycle jobs$/)).toBeVisible();

    const jobsResponse = await apiFetch(
      stack.cloudApi.baseUrl,
      "/admin/cloud/jobs",
      {
        headers: {
          "X-Admin-Secret": stack.cloudApi.adminSecret,
        },
      },
    );
    expect(jobsResponse.status).toBe(200);

    if (jobsResponse.body.items.length === 0) {
      await expect(page.getByText("No jobs match this filter.")).toBeVisible();
    } else {
      await expect(page.getByText(worldName).first()).toBeVisible();
    }

    expect(browserErrors).toEqual([]);
  });

  test("shows only allowed lifecycle actions for each world status in a real browser", async ({
    page,
  }) => {
    const phone = "+8613812345689";
    const worldName = "Browser Action Visibility World";
    const request = await createPendingWorldRequest(
      stack.cloudApi.baseUrl,
      phone,
      worldName,
    );

    await activateWorldRequest({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      requestId: request.id,
      apiBaseUrl: "https://browser-actions.example.com/api/",
      adminUrl: "https://browser-actions.example.com/admin/",
    });

    const worldId = await getWorldIdByPhone({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      phone,
    });

    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();

    await updateWorldStatus({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId,
      status: "ready",
    });

    await page.goto(`${stack.consoleServer.baseUrl}/worlds`);
    await expect(page.getByText("Instance fleet")).toBeVisible();

    await expect(
      page.getByRole("button", { name: `Suspend ${worldName}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Reconcile ${worldName}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Resume ${worldName}` }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Retry ${worldName}` }),
    ).toHaveCount(0);

    await updateWorldStatus({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId,
      status: "failed",
    });

    await page.reload();
    await expect(
      page.getByRole("button", { name: `Resume ${worldName}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Retry ${worldName}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Reconcile ${worldName}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Suspend ${worldName}` }),
    ).toHaveCount(0);
  });

  test("runs lifecycle quick actions from the jobs page in a real browser", async ({
    page,
  }) => {
    const phone = "+8613812345690";
    const worldName = "Browser Jobs Action World";
    const request = await createPendingWorldRequest(
      stack.cloudApi.baseUrl,
      phone,
      worldName,
    );

    await activateWorldRequest({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      requestId: request.id,
      apiBaseUrl: "https://browser-jobs.example.com/api/",
      adminUrl: "https://browser-jobs.example.com/admin/",
    });

    const worldId = await getWorldIdByPhone({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      phone,
    });

    await updateWorldStatus({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId,
      status: "ready",
    });

    await performWorldAction({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId,
      action: "suspend",
    });
    await waitForWorldJobsToSettle({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId,
    });

    await updateWorldStatus({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId,
      status: "failed",
    });

    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto(`${stack.consoleServer.baseUrl}/jobs`);
    await expect(page.getByText(/^Lifecycle jobs$/)).toBeVisible();
    await expect(page.getByText(worldName).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Retry ${worldName}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Reconcile ${worldName}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Resume ${worldName}` }),
    ).toBeVisible();

    await page.getByRole("button", { name: `Retry ${worldName}` }).click();
    await expect(
      page.getByText(`Retry recovery for ${worldName}?`),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Retry recovery", exact: true })
      .click();
    await expect(page.getByText(`${worldName} retry queued.`)).toBeVisible();

    await page
      .getByRole("button", { name: `Reconcile ${worldName}` })
      .first()
      .click();
    await expect(
      page.getByText(`${worldName} reconcile triggered.`),
    ).toBeVisible();
  });

  test("runs recovery actions from dashboard recent failures in a real browser", async ({
    page,
  }) => {
    const phone = "+8613812345691";
    const worldName = "Browser Dashboard Failure World";
    const request = await createPendingWorldRequest(
      stack.cloudApi.baseUrl,
      phone,
      worldName,
    );

    await activateWorldRequest({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      requestId: request.id,
      apiBaseUrl: "https://browser-dashboard.example.com/api/",
      adminUrl: "https://browser-dashboard.example.com/admin/",
    });

    const worldId = await getWorldIdByPhone({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      phone,
    });
    const bootstrapConfig = await getWorldBootstrapConfig({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId,
    });

    await reportWorldRuntimeFailure({
      baseUrl: stack.cloudApi.baseUrl,
      worldId,
      callbackToken: bootstrapConfig.callbackToken,
      failureMessage: "Browser dashboard failure seed.",
    });

    await performWorldAction({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId,
      action: "reconcile",
    });
    await waitForWorldJobsToSettle({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId,
    });
    await updateWorldStatus({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId,
      status: "failed",
    });

    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto(stack.consoleServer.baseUrl);
    await expect(page.getByText("Recent Failures")).toBeVisible();
    await expect(page.getByText(worldName).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Retry ${worldName}` }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Resume ${worldName}` }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Reconcile ${worldName}` }).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: `Retry ${worldName}` }).first().click();
    await expect(
      page.getByText(`Retry recovery for ${worldName}?`),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Retry recovery", exact: true })
      .click();
    await expect(page.getByText(`${worldName} retry queued.`)).toBeVisible();
  });

  test("runs quick actions from dashboard operator queue in a real browser", async ({
    page,
  }) => {
    const phone = "+8613812345692";
    const worldName = "Browser Dashboard Queue World";
    const request = await createPendingWorldRequest(
      stack.cloudApi.baseUrl,
      phone,
      worldName,
    );

    await activateWorldRequest({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      requestId: request.id,
      apiBaseUrl: "https://browser-queue.example.com/api/",
      adminUrl: "https://browser-queue.example.com/admin/",
    });

    const worldId = await getWorldIdByPhone({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      phone,
    });

    await updateWorldStatus({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId,
      status: "ready",
    });

    await performWorldAction({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId,
      action: "suspend",
    });

    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto(stack.consoleServer.baseUrl);
    await expect(page.getByText("Operator Queue")).toBeVisible();
    await expect(page.getByText(worldName).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Resume ${worldName}` }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Reconcile ${worldName}` }).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: `Resume ${worldName}` }).first().click();
    await expect(page.getByText(`${worldName} resume queued.`)).toBeVisible();
  });

  test("navigates dashboard shortcuts to filtered jobs and worlds in a real browser", async ({
    page,
  }) => {
    const runningPhone = "+8613812345693";
    const runningWorldName = "Browser Dashboard Running Link World";
    const runningRequest = await createPendingWorldRequest(
      stack.cloudApi.baseUrl,
      runningPhone,
      runningWorldName,
    );

    await activateWorldRequest({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      requestId: runningRequest.id,
      apiBaseUrl: "https://browser-running-link.example.com/api/",
      adminUrl: "https://browser-running-link.example.com/admin/",
    });

    const runningWorldId = await getWorldIdByPhone({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      phone: runningPhone,
    });

    await updateWorldStatus({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId: runningWorldId,
      status: "failed",
    });

    await performWorldAction({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId: runningWorldId,
      action: "resume",
    });

    await waitForWorldJobStatus({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId: runningWorldId,
      statuses: ["running"],
    });

    const failedPhone = "+8613812345694";
    const failedWorldName = "Browser Dashboard Failed Link World";
    const failedRequest = await createPendingWorldRequest(
      stack.cloudApi.baseUrl,
      failedPhone,
      failedWorldName,
    );

    await activateWorldRequest({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      requestId: failedRequest.id,
      apiBaseUrl: "https://browser-failed-link.example.com/api/",
      adminUrl: "https://browser-failed-link.example.com/admin/",
    });

    const failedWorldId = await getWorldIdByPhone({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      phone: failedPhone,
    });
    const failedBootstrapConfig = await getWorldBootstrapConfig({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId: failedWorldId,
    });

    await reportWorldRuntimeFailure({
      baseUrl: stack.cloudApi.baseUrl,
      worldId: failedWorldId,
      callbackToken: failedBootstrapConfig.callbackToken,
      failureMessage: "Browser dashboard failed-link seed.",
    });

    await performWorldAction({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      worldId: failedWorldId,
      action: "reconcile",
    });

    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto(stack.consoleServer.baseUrl);
    await expect(page.getByText(/^Fleet Dashboard$/)).toBeVisible();

    await page.getByRole("link", { name: /Running jobs/i }).first().click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/jobs");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("queueState"))
      .toBe("running_now");
    await expect(page.getByText(/^Lifecycle jobs$/)).toBeVisible();

    await page.goto(stack.consoleServer.baseUrl);
    await page.getByRole("link", { name: /Open failed jobs/i }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/jobs");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("status"))
      .toBe("failed");
    await expect(page.getByText(/^Lifecycle jobs$/)).toBeVisible();

    await page.goto(stack.consoleServer.baseUrl);
    await page.getByRole("link", { name: "Filter worlds by critical attention" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/worlds");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("attention"))
      .toBe("critical");
    await expect(page.getByText("Managed worlds")).toBeVisible();
  });

  test("filters and revokes admin sessions in a real browser", async ({
    page,
  }) => {
    const secondarySessionUserAgent = "Browser Smoke Secondary Session/1.0";
    const secondarySessionIp = "203.0.113.45";
    await issueBrowserAdminSession({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: secondarySessionUserAgent,
      ip: secondarySessionIp,
    });

    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto(`${stack.consoleServer.baseUrl}/sessions`);
    await expect(page.getByText(/^Admin sessions$/)).toBeVisible();

    await page.getByLabel("Search").fill("Secondary Session/1.0");
    const secondaryRow = page.locator("tr", {
      hasText: secondarySessionUserAgent,
    });
    await expect(secondaryRow).toBeVisible();
    await expect(secondaryRow).toContainText(secondarySessionIp);

    await secondaryRow.getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByText("Revoke admin session?")).toBeVisible();
    await page.getByRole("button", { name: "Revoke session" }).click();

    await expect(page.getByText("Admin session revoked.")).toBeVisible();
    await expect(secondaryRow.getByText("Revoked")).toBeVisible();
    await expect(
      secondaryRow.getByRole("button", { name: "Revoke" }),
    ).toBeDisabled();

    await page.getByLabel("Status").selectOption("revoked");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("status"))
      .toBe("revoked");
    await expect(secondaryRow).toBeVisible();
  });

  test("bulk revokes selected filtered admin sessions in a real browser", async ({
    page,
  }) => {
    const sessionPrefix = "Browser Bulk Selected Session";
    await issueBrowserAdminSession({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: `${sessionPrefix} 01`,
      ip: "203.0.113.71",
    });
    await issueBrowserAdminSession({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: `${sessionPrefix} 02`,
      ip: "203.0.113.72",
    });

    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto(`${stack.consoleServer.baseUrl}/sessions`);
    await expect(page.getByText(/^Admin sessions$/)).toBeVisible();

    await page.getByLabel("Search").fill(sessionPrefix);
    await expect(page.getByText(/^Showing 1-2 of 2$/).first()).toBeVisible();
    const filteredRows = page.locator("tbody tr").filter({
      hasText: sessionPrefix,
    });
    await expect(filteredRows).toHaveCount(2);

    await page.getByLabel("Select all active admin sessions").click();
    await expect(
      page.getByText("2 active session(s) selected on this page."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Revoke selected" }).click();
    await expect(
      page.getByText("Revoke selected admin sessions?"),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Revoke selected", exact: true })
      .nth(1)
      .click();

    await expect(page.getByText("Revoked 2 selected session(s).")).toBeVisible();
    await expect(filteredRows).toHaveCount(2);
    await expect(filteredRows.nth(0)).toContainText("Revoked");
    await expect(filteredRows.nth(1)).toContainText("Revoked");
  });

  test("bulk revokes all matching filtered admin sessions in a real browser", async ({
    page,
  }) => {
    const sessionPrefix = "Browser Bulk Matching Session";
    await issueBrowserAdminSession({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: `${sessionPrefix} 01`,
      ip: "203.0.113.81",
    });
    await issueBrowserAdminSession({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: `${sessionPrefix} 02`,
      ip: "203.0.113.82",
    });

    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto(`${stack.consoleServer.baseUrl}/sessions`);
    await expect(page.getByText(/^Admin sessions$/)).toBeVisible();

    await page.getByLabel("Search").fill(sessionPrefix);
    await expect(page.getByText(/^Showing 1-2 of 2$/).first()).toBeVisible();
    const filteredRows = page.locator("tbody tr").filter({
      hasText: sessionPrefix,
    });
    await expect(filteredRows).toHaveCount(2);

    await page.getByRole("button", { name: "Revoke all matching" }).click();
    await expect(
      page.getByText("Revoke all matching admin sessions?"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Revoke matching sessions" }).click();

    await expect(
      page.getByText("Revoked 2 matching active session(s)."),
    ).toBeVisible();
    await expect(filteredRows).toHaveCount(2);
    await expect(filteredRows.nth(0)).toContainText("Revoked");
    await expect(filteredRows.nth(1)).toContainText("Revoked");
  });

  test("revokes a matching admin session source group in a real browser", async ({
    page,
  }) => {
    const sharedUserAgent = "Browser Shared Source Group";
    const sharedIp = "203.0.113.88";
    await issueBrowserAdminSession({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: sharedUserAgent,
      ip: sharedIp,
    });
    await issueBrowserAdminSession({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: sharedUserAgent,
      ip: sharedIp,
    });

    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto(`${stack.consoleServer.baseUrl}/sessions`);
    await expect(page.getByText(/^Admin sessions$/)).toBeVisible();

    await page.getByLabel("Search").fill(sharedUserAgent);
    await expect(page.getByText(/^Showing 1-2 of 2$/).first()).toBeVisible();
    const filteredRows = page.locator("tbody tr").filter({
      hasText: sharedUserAgent,
    });
    await expect(filteredRows).toHaveCount(2);

    const sourceGroupCard = page
      .locator("div")
      .filter({ hasText: sharedUserAgent })
      .filter({ hasText: sharedIp })
      .filter({ hasText: "Revoke group" })
      .first();
    await expect(sourceGroupCard.getByText("2 active")).toBeVisible();
    await expect(sourceGroupCard.getByText("2 total")).toBeVisible();

    await page.getByRole("button", { name: "Revoke group" }).click();
    await expect(page.getByText("Revoke source group?")).toBeVisible();
    await page.getByRole("button", { name: "Revoke group", exact: true }).nth(1).click();

    await expect(
      page.getByText(
        "Revoked 2 matching active session(s) in the selected source group.",
      ),
    ).toBeVisible();
    await expect(filteredRows).toHaveCount(2);
    await expect(filteredRows.nth(0)).toContainText("Revoked");
    await expect(filteredRows.nth(1)).toContainText("Revoked");
    await expect(sourceGroupCard.getByText("0 active")).toBeVisible();
    await expect(sourceGroupCard.getByText("2 revoked")).toBeVisible();
    await expect(
      sourceGroupCard.getByRole("button", { name: "Revoke group" }),
    ).toBeDisabled();
  });

  test("warns when revoking a source group that includes the current console session in a real browser", async ({
    page,
  }) => {
    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto(`${stack.consoleServer.baseUrl}/sessions`);
    await expect(page.getByText(/^Admin sessions$/)).toBeVisible();

    const currentSessionResponse = await listAdminSessions({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      sortBy: "createdAt",
      sortDirection: "desc",
      pageSize: 1,
    });
    expect(currentSessionResponse.items).toHaveLength(1);
    const currentSession = currentSessionResponse.items[0] as {
      issuedFromIp?: string | null;
      issuedUserAgent?: string | null;
    };
    expect(currentSession.issuedUserAgent).toBeTruthy();

    await page.getByLabel("Search").fill(currentSession.issuedUserAgent ?? "");
    const sourceGroupCard = page
      .locator("div")
      .filter({ hasText: currentSession.issuedUserAgent ?? "" })
      .filter({
        hasText: currentSession.issuedFromIp || "Unknown IP",
      })
      .filter({ hasText: "Revoke group" })
      .first();
    await expect(sourceGroupCard).toBeVisible();
    await expect(sourceGroupCard.getByText("1 current")).toBeVisible();

    const sourceGroupText = await sourceGroupCard.textContent();
    const activeCount = Number(
      sourceGroupText?.match(/(\d+) active/)?.[1] ?? Number.NaN,
    );
    expect(activeCount).toBeGreaterThan(0);

    await sourceGroupCard.getByRole("button", { name: "Revoke group" }).click();
    await expect(page.getByText("Revoke source group?")).toBeVisible();
    await expect(
      page.getByText(
        "This source group includes the current console session. Every matching active session in this source group will stop authorizing admin requests immediately, and the next admin request will need to exchange a fresh short-lived token.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Revoke group", exact: true }).nth(1).click();

    await expect(
      page.getByText(
        `Revoked ${activeCount} matching active session(s) in the selected source group. The current console session was included, so the next admin request will re-issue a short-lived token.`,
      ),
    ).toBeVisible();

    await page.getByLabel("Scope").selectOption("current");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("scope"))
      .toBe("current");
    await expect(page.locator("tbody tr").first().getByText("Current")).toBeVisible();
  });

  test("shows skipped-session messaging for partially stale source-group revoke in a real browser", async ({
    page,
  }) => {
    const sharedUserAgent = "Browser Partial Stale Source Group";
    const sharedIp = "203.0.113.95";
    await issueBrowserAdminSession({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: sharedUserAgent,
      ip: sharedIp,
    });
    await issueBrowserAdminSession({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: sharedUserAgent,
      ip: sharedIp,
    });

    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto(`${stack.consoleServer.baseUrl}/sessions`);
    await expect(page.getByText(/^Admin sessions$/)).toBeVisible();

    await page.getByLabel("Search").fill(sharedUserAgent);
    await expect(page.getByText(/^Showing 1-2 of 2$/).first()).toBeVisible();
    const filteredRows = page.locator("tbody tr").filter({
      hasText: sharedUserAgent,
    });
    await expect(filteredRows).toHaveCount(2);

    const sourceGroupCard = page
      .locator("div")
      .filter({ hasText: sharedUserAgent })
      .filter({ hasText: sharedIp })
      .filter({ hasText: "Revoke group" })
      .first();
    await expect(sourceGroupCard.getByText("2 active")).toBeVisible();

    const matchingSessions = await listAdminSessions({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      query: sharedUserAgent,
      status: "active",
      sortBy: "createdAt",
      sortDirection: "asc",
      pageSize: 10,
    });
    expect(matchingSessions.items).toHaveLength(2);
    await revokeAdminSessionById({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      sessionId: matchingSessions.items[1]?.id as string,
    });

    await sourceGroupCard.getByRole("button", { name: "Revoke group" }).click();
    await expect(page.getByText("Revoke source group?")).toBeVisible();
    await page.getByRole("button", { name: "Revoke group", exact: true }).nth(1).click();

    await expect(
      page.getByText(
        "Revoked 1 matching active session(s) in the selected source group. 1 session(s) were skipped because they were already unavailable.",
      ),
    ).toBeVisible();
    await expect(filteredRows).toHaveCount(2);
    await expect(filteredRows.nth(0)).toContainText("Revoked");
    await expect(filteredRows.nth(1)).toContainText("Revoked");
    await expect(sourceGroupCard.getByText("0 active")).toBeVisible();
    await expect(sourceGroupCard.getByText("2 revoked")).toBeVisible();
    await expect(
      sourceGroupCard.getByRole("button", { name: "Revoke group" }),
    ).toBeDisabled();
  });

  test("shows a stale source-group warning when no active sessions remain in a real browser", async ({
    page,
  }) => {
    const sharedUserAgent = "Browser Fully Stale Source Group";
    const sharedIp = "203.0.113.96";
    await issueBrowserAdminSession({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: sharedUserAgent,
      ip: sharedIp,
    });
    await issueBrowserAdminSession({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: sharedUserAgent,
      ip: sharedIp,
    });

    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto(`${stack.consoleServer.baseUrl}/sessions`);
    await expect(page.getByText(/^Admin sessions$/)).toBeVisible();

    await page.getByLabel("Search").fill(sharedUserAgent);
    await expect(page.getByText(/^Showing 1-2 of 2$/).first()).toBeVisible();
    const filteredRows = page.locator("tbody tr").filter({
      hasText: sharedUserAgent,
    });
    await expect(filteredRows).toHaveCount(2);

    const sourceGroupCard = page
      .locator("div")
      .filter({ hasText: sharedUserAgent })
      .filter({ hasText: sharedIp })
      .filter({ hasText: "Revoke group" })
      .first();
    await expect(sourceGroupCard.getByText("2 active")).toBeVisible();

    const matchingSessions = await listAdminSessions({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      query: sharedUserAgent,
      status: "active",
      sortBy: "createdAt",
      sortDirection: "asc",
      pageSize: 10,
    });
    expect(matchingSessions.items).toHaveLength(2);
    await Promise.all(
      matchingSessions.items.map((session) =>
        revokeAdminSessionById({
          baseUrl: stack.cloudApi.baseUrl,
          adminSecret: stack.cloudApi.adminSecret,
          sessionId: session.id,
        }),
      ),
    );

    await sourceGroupCard.getByRole("button", { name: "Revoke group" }).click();
    await expect(page.getByText("Revoke source group?")).toBeVisible();
    await page.getByRole("button", { name: "Revoke group", exact: true }).nth(1).click();

    await expect(
      page.getByText("No active admin sessions in the selected source group were revoked."),
    ).toBeVisible();
    await expect(filteredRows).toHaveCount(2);
    await expect(filteredRows.nth(0)).toContainText("Revoked");
    await expect(filteredRows.nth(1)).toContainText("Revoked");
    await expect(sourceGroupCard.getByText("0 active")).toBeVisible();
    await expect(sourceGroupCard.getByText("2 revoked")).toBeVisible();
    await expect(
      sourceGroupCard.getByRole("button", { name: "Revoke group" }),
    ).toBeDisabled();
  });

  test("shows skipped-session messaging for partially stale bulk revoke selection in a real browser", async ({
    page,
  }) => {
    const sessionOneUserAgent = "Browser Bulk Partial Stale Session 01";
    const sessionTwoUserAgent = "Browser Bulk Partial Stale Session 02";
    await issueBrowserAdminSession({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: sessionOneUserAgent,
      ip: "203.0.113.91",
    });
    await issueBrowserAdminSession({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: sessionTwoUserAgent,
      ip: "203.0.113.92",
    });

    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto(`${stack.consoleServer.baseUrl}/sessions`);
    await expect(page.getByText(/^Admin sessions$/)).toBeVisible();

    await page.getByLabel("Search").fill("Browser Bulk Partial Stale Session");
    await expect(page.getByText(/^Showing 1-2 of 2$/).first()).toBeVisible();
    const filteredRows = page.locator("tbody tr").filter({
      hasText: "Browser Bulk Partial Stale Session",
    });
    await expect(filteredRows).toHaveCount(2);

    await page.getByLabel("Select all active admin sessions").click();
    await expect(
      page.getByText("2 active session(s) selected on this page."),
    ).toBeVisible();

    const staleSession = await waitForAdminSessionByUserAgent({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: sessionTwoUserAgent,
      status: "active",
    });
    await revokeAdminSessionById({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      sessionId: staleSession.id,
    });

    await page.getByRole("button", { name: "Revoke selected" }).click();
    await expect(
      page.getByText("Revoke selected admin sessions?"),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Revoke selected", exact: true })
      .nth(1)
      .click();

    await expect(
      page.getByText(
        "Revoked 1 selected session(s). 1 session(s) were already unavailable.",
      ),
    ).toBeVisible();
    await expect(filteredRows).toHaveCount(2);
    await expect(filteredRows.nth(0)).toContainText("Revoked");
    await expect(filteredRows.nth(1)).toContainText("Revoked");
    await expect(
      page.getByRole("button", { name: "Revoke selected" }).first(),
    ).toBeDisabled();
  });

  test("shows stale-selection warning when bulk revoke selection is fully stale in a real browser", async ({
    page,
  }) => {
    const sessionOneUserAgent = "Browser Bulk Fully Stale Session 01";
    const sessionTwoUserAgent = "Browser Bulk Fully Stale Session 02";
    await issueBrowserAdminSession({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: sessionOneUserAgent,
      ip: "203.0.113.93",
    });
    await issueBrowserAdminSession({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: sessionTwoUserAgent,
      ip: "203.0.113.94",
    });

    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto(`${stack.consoleServer.baseUrl}/sessions`);
    await expect(page.getByText(/^Admin sessions$/)).toBeVisible();

    await page.getByLabel("Search").fill("Browser Bulk Fully Stale Session");
    await expect(page.getByText(/^Showing 1-2 of 2$/).first()).toBeVisible();
    const filteredRows = page.locator("tbody tr").filter({
      hasText: "Browser Bulk Fully Stale Session",
    });
    await expect(filteredRows).toHaveCount(2);

    await page.getByLabel("Select all active admin sessions").click();
    await expect(
      page.getByText("2 active session(s) selected on this page."),
    ).toBeVisible();

    const staleSessions = await Promise.all([
      waitForAdminSessionByUserAgent({
        baseUrl: stack.cloudApi.baseUrl,
        adminSecret: stack.cloudApi.adminSecret,
        userAgent: sessionOneUserAgent,
        status: "active",
      }),
      waitForAdminSessionByUserAgent({
        baseUrl: stack.cloudApi.baseUrl,
        adminSecret: stack.cloudApi.adminSecret,
        userAgent: sessionTwoUserAgent,
        status: "active",
      }),
    ]);
    await Promise.all(
      staleSessions.map((session) =>
        revokeAdminSessionById({
          baseUrl: stack.cloudApi.baseUrl,
          adminSecret: stack.cloudApi.adminSecret,
          sessionId: session.id,
        }),
      ),
    );

    await page.getByRole("button", { name: "Revoke selected" }).click();
    await expect(
      page.getByText("Revoke selected admin sessions?"),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Revoke selected", exact: true })
      .nth(1)
      .click();

    await expect(
      page.getByText(
        "No selected admin sessions were revoked. The list may already be stale.",
      ),
    ).toBeVisible();
    await expect(filteredRows).toHaveCount(2);
    await expect(filteredRows.nth(0)).toContainText("Revoked");
    await expect(filteredRows.nth(1)).toContainText("Revoked");
    await expect(
      page.getByRole("button", { name: "Revoke selected" }).first(),
    ).toBeDisabled();
  });

  test("filters admin sessions to the current console session in a real browser", async ({
    page,
  }) => {
    await issueBrowserAdminSession({
      baseUrl: stack.cloudApi.baseUrl,
      adminSecret: stack.cloudApi.adminSecret,
      userAgent: "Browser Smoke Background Session/1.0",
      ip: "203.0.113.60",
    });

    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto(`${stack.consoleServer.baseUrl}/sessions`);
    await expect(page.getByText(/^Admin sessions$/)).toBeVisible();

    await page.getByLabel("Scope").selectOption("current");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("scope"))
      .toBe("current");
    await expect(page.getByText(/^Showing 1-1 of 1$/).first()).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr").first().getByText("Current")).toBeVisible();
  });

  test("paginates filtered admin sessions in a real browser", async ({
    page,
  }) => {
    const sessionPrefix = "Browser Smoke Pagination Session";
    for (const index of Array.from({ length: 11 }, (_, value) => value)) {
      await issueBrowserAdminSession({
        baseUrl: stack.cloudApi.baseUrl,
        adminSecret: stack.cloudApi.adminSecret,
        userAgent: `${sessionPrefix} ${String(index + 1).padStart(2, "0")}`,
        ip: `203.0.113.${70 + index}`,
      });
    }

    await page.goto(stack.consoleServer.baseUrl);
    await page
      .getByPlaceholder("Enter CLOUD_ADMIN_SECRET")
      .fill(stack.cloudApi.adminSecret);
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto(`${stack.consoleServer.baseUrl}/sessions`);
    await expect(page.getByText(/^Admin sessions$/)).toBeVisible();

    await page.getByLabel("Search").fill(sessionPrefix);
    await expect(page.getByText(/^Showing 1-10 of 11$/).first()).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(10);

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("page"))
      .toBe("2");
    await expect(page.getByText(/^Showing 11-11 of 11$/).first()).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr").first()).toContainText(sessionPrefix);
  });
});
