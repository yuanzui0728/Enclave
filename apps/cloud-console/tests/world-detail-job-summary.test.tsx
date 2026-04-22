import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import {
  type CloudAdminRequestLog,
  installCloudAdminApiMock,
  mockJob,
  renderRoute,
} from "./test-helpers";

function hasJobSummaryRequest(
  requests: CloudAdminRequestLog[],
  expectedParams: Record<string, string>,
) {
  return requests.some((entry) => {
    if (entry.url !== "GET /admin/cloud/jobs/summary") {
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

async function expectSummaryCardCount(label: string, count: number) {
  const summaryCardLabel = await screen.findByText(label);
  expect(summaryCardLabel.parentElement?.textContent).toContain(String(count));
}

describe("world detail job summary", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("uses backend lifecycle job summary counts for world detail queue totals", async () => {
    const { requests } = installCloudAdminApiMock({
      jobs: [
        {
          ...mockJob,
          id: "job-world-preview",
          status: "running",
          updatedAt: "2026-04-20T00:40:00.000Z",
          availableAt: null,
        },
      ],
      jobSummary: {
        totalJobs: 12,
        activeJobs: 9,
        failedJobs: 4,
        supersededJobs: 3,
        queueState: {
          runningNow: 7,
          leaseExpired: 2,
          delayed: 5,
        },
      },
    });

    renderRoute("/worlds/world-1");

    expect(await screen.findByText("Recent lifecycle jobs")).toBeTruthy();
    await expectSummaryCardCount("Active jobs", 9);
    await expectSummaryCardCount("Failed jobs", 4);
    await expectSummaryCardCount("Superseded jobs", 3);
    await expectSummaryCardCount("Running jobs", 7);
    await expectSummaryCardCount("Lease expired jobs", 2);
    await expectSummaryCardCount("Delayed jobs", 5);
    expect(
      await screen.findByText(
        /Queue totals reflect all jobs for this world, not just the recent 20 jobs below\./,
      ),
    ).toBeTruthy();
    expect(
      hasJobSummaryRequest(requests, {
        worldId: "world-1",
      }),
    ).toBe(true);
    expect(
      (
        await screen.findByRole("link", { name: "Open full queue" })
      ).getAttribute("href"),
    ).toBe("/jobs?worldId=world-1");
  });
});
