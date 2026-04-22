import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import {
  type CloudAdminRequestLog,
  installCloudAdminApiMock,
  mockJob,
  renderRoute,
} from "./test-helpers";

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

function getJobsPageSelect(prefix: string) {
  const select = screen
    .getAllByRole("combobox")
    .find((element) =>
      Array.from((element as HTMLSelectElement).options).some((option) =>
        option.textContent?.startsWith(prefix),
      ),
    );

  if (!(select instanceof HTMLSelectElement)) {
    throw new Error(`Missing jobs page select for ${prefix}.`);
  }

  return select;
}

describe("jobs page pagination", () => {
  it("paginates lifecycle jobs from backend results", async () => {
    window.scrollTo = () => {};
    const jobs = Array.from({ length: 25 }, (_, index) => ({
      ...mockJob,
      id: `job-${String(index + 1).padStart(2, "0")}`,
      updatedAt: new Date(
        Date.UTC(2026, 3, 20, 0, 25 - index, 0),
      ).toISOString(),
      createdAt: new Date(
        Date.UTC(2026, 3, 20, 0, 25 - index, 0),
      ).toISOString(),
    }));
    const { requests } = installCloudAdminApiMock({ jobs });
    renderRoute("/jobs");

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();
    expect(await screen.findByText("Showing 1-20 of 25 jobs.")).toBeTruthy();
    expect(screen.getByText("job-01")).toBeTruthy();
    expect(screen.queryByText("job-21")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(await screen.findByText("Showing 21-25 of 25 jobs.")).toBeTruthy();
    expect(screen.getByText("job-21")).toBeTruthy();
    expect(screen.queryByText("job-01")).toBeNull();
    expect(
      hasJobsRequest(requests, {
        page: "2",
        pageSize: "20",
      }),
    ).toBe(true);

    fireEvent.change(screen.getByDisplayValue("page size: 20"), {
      target: { value: "50" },
    });

    expect(await screen.findByText("Showing 1-25 of 25 jobs.")).toBeTruthy();
    expect(screen.getByText("job-01")).toBeTruthy();
    expect(
      hasJobsRequest(requests, {
        page: "1",
        pageSize: "50",
      }),
    ).toBe(true);
  });

  it("requests and renders backend job sorting", async () => {
    window.scrollTo = () => {};
    const jobs = [
      {
        ...mockJob,
        id: "job-finished-late",
        finishedAt: "2026-04-20T00:30:00.000Z",
        updatedAt: "2026-04-20T00:30:00.000Z",
        createdAt: "2026-04-20T00:10:00.000Z",
      },
      {
        ...mockJob,
        id: "job-finished-early",
        finishedAt: "2026-04-20T00:05:00.000Z",
        updatedAt: "2026-04-20T00:05:00.000Z",
        createdAt: "2026-04-20T00:05:00.000Z",
      },
      {
        ...mockJob,
        id: "job-no-finish",
        finishedAt: null,
        updatedAt: "2026-04-20T00:40:00.000Z",
        createdAt: "2026-04-20T00:15:00.000Z",
      },
    ];
    const { requests } = installCloudAdminApiMock({ jobs });
    renderRoute("/jobs");

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();

    fireEvent.change(getJobsPageSelect("sort by: "), {
      target: { value: "finishedAt" },
    });
    fireEvent.change(getJobsPageSelect("direction: "), {
      target: { value: "asc" },
    });

    expect(await screen.findByText("job-finished-early")).toBeTruthy();
    const earlyText = screen.getAllByText("job-finished-early")[0];
    const lateText = screen.getAllByText("job-finished-late")[0];
    const noFinishText = screen.getAllByText("job-no-finish")[0];

    const earlyPosition =
      earlyText.compareDocumentPosition(lateText) &
      Node.DOCUMENT_POSITION_FOLLOWING;
    const latePosition =
      lateText.compareDocumentPosition(noFinishText) &
      Node.DOCUMENT_POSITION_FOLLOWING;

    expect(earlyPosition).toBeTruthy();
    expect(latePosition).toBeTruthy();
    expect(
      hasJobsRequest(requests, {
        sortBy: "finishedAt",
        sortDirection: "asc",
      }),
    ).toBe(true);
  });
});
