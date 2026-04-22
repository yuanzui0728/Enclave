import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import {
  type CloudAdminRequestLog,
  installCloudAdminApiMock,
  renderRoute,
} from "./test-helpers";

function hasJobSummaryRequest(requests: CloudAdminRequestLog[]) {
  return requests.some((entry) => entry.url === "GET /admin/cloud/jobs/summary");
}

describe("dashboard job summary", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("uses backend job summary counts for dashboard queue metrics", async () => {
    const { requests } = installCloudAdminApiMock({
      jobs: [
        {
          id: "job-running-preview",
          status: "running",
          updatedAt: "2026-04-20T00:40:00.000Z",
        },
      ],
      jobSummary: {
        totalJobs: 42,
        activeJobs: 11,
        failedJobs: 7,
        supersededJobs: 5,
        queueState: {
          runningNow: 3,
          leaseExpired: 2,
          delayed: 4,
        },
      },
    });

    renderRoute("/");

    expect(await screen.findByText("Fleet Dashboard")).toBeTruthy();
    expect(await screen.findByText("Open failed jobs (7)")).toBeTruthy();
    expect(await screen.findByText("Open superseded jobs (5)")).toBeTruthy();
    expect(await screen.findByText("Open superseded queue (5)")).toBeTruthy();
    expect(await screen.findByText("Running jobs 3")).toBeTruthy();
    expect(await screen.findByText("Lease expired jobs 2")).toBeTruthy();
    expect(await screen.findByText("Delayed jobs 4")).toBeTruthy();
    expect(
      (
        await screen.findByRole("link", { name: "Inspect jobs" })
      ).getAttribute("href"),
    ).toBe("/jobs");
    expect(
      (
        await screen.findByRole("link", {
          name: "Open all requests from request alerts",
        })
      ).getAttribute("href"),
    ).toBe("/requests");
    expect(
      (
        await screen.findByRole("link", { name: "Open worlds" })
      ).getAttribute("href"),
    ).toBe("/worlds");
    expect(
      (
        await screen.findByRole("link", { name: "Open failed jobs (7)" })
      ).getAttribute("href"),
    ).toBe("/jobs?status=failed");
    expect(
      (
        await screen.findByRole("link", { name: "Open superseded queue (5)" })
      ).getAttribute("href"),
    ).toBe("/jobs?audit=superseded");
    expect(hasJobSummaryRequest(requests)).toBe(true);
  });

  it("links superseded queue world shortcuts to scoped jobs routes", async () => {
    installCloudAdminApiMock({
      jobs: [
        {
          id: "job-superseded-preview",
          worldId: "world-1",
          jobType: "suspend",
          status: "cancelled",
          supersededByJobType: "resume",
          supersededByPayload: { source: "dashboard-test" },
          resultPayload: {
            action: "superseded_by_new_job",
            supersededByJobType: "resume",
          },
          updatedAt: "2026-04-20T00:40:00.000Z",
          finishedAt: "2026-04-20T00:40:00.000Z",
        },
      ],
      jobSummary: {
        totalJobs: 1,
        activeJobs: 0,
        failedJobs: 0,
        supersededJobs: 1,
        queueState: {
          runningNow: 0,
          leaseExpired: 0,
          delayed: 0,
        },
      },
    });

    renderRoute("/");

    expect(await screen.findByText("Superseded Queue")).toBeTruthy();
    const worldScopedLink = await screen.findByRole("link", {
      name: "Open superseded jobs for Mock World",
    });
    expect(worldScopedLink.getAttribute("href")).toBe(
      "/jobs?worldId=world-1&audit=superseded",
    );
  });

  it("links recent failure world shortcuts to scoped failed jobs routes", async () => {
    installCloudAdminApiMock({
      jobs: [
        {
          id: "job-failed-preview",
          worldId: "world-1",
          jobType: "resume",
          status: "failed",
          failureCode: "provider_error",
          failureMessage: "Provider failed to wake the world.",
          updatedAt: "2026-04-20T00:40:00.000Z",
          finishedAt: "2026-04-20T00:40:00.000Z",
        },
      ],
      jobSummary: {
        totalJobs: 1,
        activeJobs: 0,
        failedJobs: 1,
        supersededJobs: 0,
        queueState: {
          runningNow: 0,
          leaseExpired: 0,
          delayed: 0,
        },
      },
    });

    renderRoute("/");

    expect(await screen.findByText("Recent Failures")).toBeTruthy();
    const worldScopedLink = await screen.findByRole("link", {
      name: "Open failed jobs for Mock World",
    });
    expect(worldScopedLink.getAttribute("href")).toBe(
      "/jobs?worldId=world-1&status=failed",
    );
  });

  it("links operator queue world shortcuts to scoped jobs routes", async () => {
    installCloudAdminApiMock({
      jobs: [
        {
          id: "job-operator-preview",
          worldId: "world-1",
          jobType: "resume",
          status: "running",
          updatedAt: "2026-04-20T00:40:00.000Z",
          startedAt: "2026-04-20T00:39:00.000Z",
        },
      ],
      jobSummary: {
        totalJobs: 1,
        activeJobs: 1,
        failedJobs: 0,
        supersededJobs: 0,
        queueState: {
          runningNow: 1,
          leaseExpired: 0,
          delayed: 0,
        },
      },
    });

    renderRoute("/");

    expect(await screen.findByText("Operator Queue")).toBeTruthy();
    const worldScopedLink = await screen.findByRole("link", {
      name: "Open operator jobs for Mock World",
    });
    expect(worldScopedLink.getAttribute("href")).toBe("/jobs?worldId=world-1");
  });

  it("links attention queue job shortcuts to scoped jobs routes", async () => {
    installCloudAdminApiMock();

    renderRoute("/");

    expect(await screen.findByText("Attention Queue")).toBeTruthy();
    const attentionJobsLink = await screen.findByRole("link", {
      name: "Open jobs for Mock World",
    });
    expect(attentionJobsLink.getAttribute("href")).toBe(
      "/jobs?worldId=world-1&jobType=resume",
    );
    expect(
      (
        await screen.findByRole("link", {
          name: "Open worlds with critical attention",
        })
      ).getAttribute("href"),
    ).toBe("/worlds?attention=critical");
  });
});
