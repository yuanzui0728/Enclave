import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import {
  apiFetch,
  assertSuccessfulPost,
  createAdminAuthHeaders,
  startEphemeralCloudApi,
} from "../../cloud-api/scripts/cloud-api-test-harness.mjs";
import { renderRoute } from "./test-helpers";

const TEST_PHONE = "+8613812345678";

async function createPendingWorldRequest(baseUrl: string) {
  const sendCodeResponse = await apiFetch(baseUrl, "/cloud/auth/send-code", {
    method: "POST",
    body: {
      phone: TEST_PHONE,
    },
  });
  assertSuccessfulPost(
    sendCodeResponse,
    "send-code should succeed for console live smoke",
  );

  const verifyCodeResponse = await apiFetch(
    baseUrl,
    "/cloud/auth/verify-code",
    {
      method: "POST",
      body: {
        phone: TEST_PHONE,
        code: sendCodeResponse.body.debugCode,
      },
    },
  );
  assertSuccessfulPost(
    verifyCodeResponse,
    "verify-code should succeed for console live smoke",
  );

  const requestResponse = await apiFetch(baseUrl, "/cloud/me/world-requests", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${verifyCodeResponse.body.accessToken}`,
    },
    body: {
      worldName: "Live Smoke World",
    },
  });
  assertSuccessfulPost(
    requestResponse,
    "creating a live smoke world request should succeed",
  );

  return requestResponse.body;
}

describe("cloud-console live api smoke", () => {
  let liveApiServer: Awaited<ReturnType<typeof startEphemeralCloudApi>>;

  beforeAll(async () => {
    liveApiServer = await startEphemeralCloudApi({
      tempPrefix: "yinjie-cloud-console-live-",
      databaseFileName: "cloud-console-live.sqlite",
      adminSecret: "cloud-console-live-secret",
      jwtSecret: "cloud-console-live-jwt",
      authTokenTtl: "1h",
    });
  }, 60_000);

  afterAll(async () => {
    await liveApiServer.cleanup();
    vi.unstubAllEnvs();
  }, 60_000);

  beforeEach(() => {
    window.scrollTo = vi.fn();
    vi.stubEnv("VITE_CLOUD_API_BASE", liveApiServer.baseUrl);
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("activates a real world request and renders live cloud-api data", async () => {
    const request = await createPendingWorldRequest(liveApiServer.baseUrl);
    const adminHeaders = await createAdminAuthHeaders(
      liveApiServer.baseUrl,
      liveApiServer.adminSecret,
    );

    renderRoute(`/requests/${request.id}`, {
      adminSecret: liveApiServer.adminSecret,
    });

    expect(await screen.findByText("Request guidance")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "active" },
    });
    fireEvent.change(screen.getByLabelText("World API base URL"), {
      target: { value: "https://live-world.example.com/api/" },
    });
    fireEvent.change(screen.getByLabelText("World admin URL"), {
      target: { value: "https://live-world.example.com/admin/" },
    });
    fireEvent.change(screen.getByLabelText("Ops note"), {
      target: { value: "Activated by live console smoke." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save request" }));

    expect(await screen.findByText("World request saved.")).toBeTruthy();
    expect(await screen.findByText("Request id")).toBeTruthy();

    let worldId = "";
    await waitFor(async () => {
      const worldsResponse = await apiFetch(
        liveApiServer.baseUrl,
        "/admin/cloud/worlds",
        {
          headers: adminHeaders,
        },
      );

      expect(worldsResponse.status).toBe(200);
      expect(worldsResponse.body.length).toBe(1);
      worldId = worldsResponse.body[0].id;
    });

    cleanup();
    renderRoute("/", {
      adminSecret: liveApiServer.adminSecret,
    });
    expect(await screen.findByText("Fleet Dashboard")).toBeTruthy();
    expect(
      await screen.findByText((_, element) => {
        return element?.textContent === "Total fleet: 1";
      }),
    ).toBeTruthy();

    cleanup();
    renderRoute("/worlds", {
      adminSecret: liveApiServer.adminSecret,
    });
    expect(await screen.findByText("Managed worlds")).toBeTruthy();
    expect(await screen.findAllByText("Live Smoke World")).toBeTruthy();

    cleanup();
    renderRoute(`/worlds/${worldId}`, {
      adminSecret: liveApiServer.adminSecret,
    });
    expect(await screen.findByText("Bootstrap package")).toBeTruthy();
    const apiBaseInput = screen.getByLabelText(
      "World API base URL",
    ) as HTMLInputElement;
    const adminUrlInput = screen.getByLabelText(
      "World admin URL",
    ) as HTMLInputElement;
    expect(apiBaseInput.value).toBe("https://live-world.example.com/api");
    expect(adminUrlInput.value).toBe("https://live-world.example.com/admin");

    cleanup();
    renderRoute("/jobs", {
      adminSecret: liveApiServer.adminSecret,
    });
    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();
    const jobsResponse = await apiFetch(
      liveApiServer.baseUrl,
      "/admin/cloud/jobs",
      {
        headers: adminHeaders,
      },
    );
    expect(jobsResponse.status).toBe(200);

    if (jobsResponse.body.items.length === 0) {
      expect(
        await screen.findByText("No jobs match this filter."),
      ).toBeTruthy();
    } else {
      expect(
        await screen.findByText(jobsResponse.body.items[0].worldId),
      ).toBeTruthy();
    }

    cleanup();
    renderRoute("/sessions", {
      adminSecret: liveApiServer.adminSecret,
    });
    expect(await screen.findByText("Admin sessions")).toBeTruthy();
    expect(await screen.findByText("Current")).toBeTruthy();

    cleanup();
    renderRoute("/waiting-sync", {
      adminSecret: liveApiServer.adminSecret,
    });
    expect(await screen.findByText("Waiting session sync")).toBeTruthy();
    expect(await screen.findByText("Batch actions")).toBeTruthy();
  }, 30_000);
});
