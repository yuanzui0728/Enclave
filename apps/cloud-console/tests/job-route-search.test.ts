import { describe, expect, it } from "vitest";
import { QUEUE_STATE_FILTERS } from "../src/lib/job-queue-state";
import {
  buildJobsPermalink,
  JOB_AUDIT_FILTERS,
  JOB_PAGE_SIZE_OPTIONS,
  JOB_SORT_DIRECTIONS,
  JOB_SORT_FIELDS,
  JOB_SUPERSEDED_BY_FILTERS,
  buildJobsRouteSearch,
  DEFAULT_JOBS_ROUTE_SEARCH,
  JOB_STATUS_FILTERS,
  JOB_TYPE_FILTERS,
  validateJobsRouteSearch,
} from "../src/lib/job-route-search";
import {
  defineRouteSearchNormalizationTests,
  defineRouteSearchStaticContractTest,
} from "./route-search-test-helpers";

describe("job route search", () => {
  defineRouteSearchStaticContractTest({
    description:
      "keeps job filter option ordering aligned with queue state filters and defaults",
    expectations: [
      {
        description: "job status filters stay in their expected display order",
        actual: JOB_STATUS_FILTERS,
        expected: ["all", "pending", "running", "succeeded", "failed", "cancelled"],
      },
      {
        description: "job type filters stay in their expected display order",
        actual: JOB_TYPE_FILTERS,
        expected: ["all", "provision", "resume", "suspend", "reconcile"],
      },
      {
        description: "queue state filter values stay aligned with the queue-state helper",
        actual: QUEUE_STATE_FILTERS.map((item) => item.value),
        expected: ["all", "running_now", "lease_expired", "delayed"],
      },
      {
        description: "default jobs route search stays stable",
        actual: DEFAULT_JOBS_ROUTE_SEARCH,
        expected: {
          worldId: "",
          status: "all",
          jobType: "all",
          provider: "all",
          queueState: "all",
          audit: "all",
          supersededBy: "all",
          query: "",
          sortBy: "updatedAt",
          sortDirection: "desc",
          page: 1,
          pageSize: 20,
        },
      },
      {
        description: "job audit filters stay in their expected display order",
        actual: JOB_AUDIT_FILTERS,
        expected: ["all", "superseded"],
      },
      {
        description: "job superseded-by filters stay in their expected display order",
        actual: JOB_SUPERSEDED_BY_FILTERS,
        expected: ["all", "provision", "resume", "suspend", "reconcile"],
      },
      {
        description: "job page size options stay in their expected display order",
        actual: JOB_PAGE_SIZE_OPTIONS,
        expected: [20, 50, 100],
      },
      {
        description: "job sort fields stay in their expected display order",
        actual: JOB_SORT_FIELDS,
        expected: [
          "updatedAt",
          "createdAt",
          "availableAt",
          "startedAt",
          "finishedAt",
        ],
      },
      {
        description: "job sort directions stay in their expected display order",
        actual: JOB_SORT_DIRECTIONS,
        expected: ["desc", "asc"],
      },
    ],
  });

  defineRouteSearchNormalizationTests({
    build: buildJobsRouteSearch,
    validate: validateJobsRouteSearch,
    validBuildCases: [
      {
        description: "trim valid job filters while preserving the raw query string",
        input: {
          worldId: " world-1 ",
          status: " running ",
          jobType: " reconcile ",
          provider: " aws ",
          queueState: " delayed ",
          audit: " superseded ",
          supersededBy: " resume ",
          query: "  +1 888  ",
          sortBy: " finishedAt ",
          sortDirection: " asc ",
          page: " 3 ",
          pageSize: " 50 ",
        },
        expected: {
          worldId: "world-1",
          status: "running",
          jobType: "reconcile",
          provider: "aws",
          queueState: "delayed",
          audit: "superseded",
          supersededBy: "resume",
          query: "  +1 888  ",
          sortBy: "finishedAt",
          sortDirection: "asc",
          page: 3,
          pageSize: 50,
        },
      },
    ],
    invalidBuildCases: [
      {
        description: "fall back for invalid job filters and non-string query",
        input: {
          worldId: "   ",
          status: "queued",
          jobType: "destroy",
          provider: "   ",
          queueState: "other",
          audit: "legacy",
          supersededBy: "destroy",
          query: 123,
          sortBy: "priority",
          sortDirection: "sideways",
          page: 0,
          pageSize: 999,
        },
        expected: DEFAULT_JOBS_ROUTE_SEARCH,
      },
      {
        description: "fall back for non-string job filters",
        input: {
          worldId: null,
          status: null,
          jobType: false,
          provider: undefined,
          queueState: {},
          audit: [],
          supersededBy: {},
          query: null,
          sortBy: [],
          sortDirection: {},
          page: null,
          pageSize: null,
        },
        expected: DEFAULT_JOBS_ROUTE_SEARCH,
      },
      {
        description: "fall back when no route search is provided",
        input: undefined,
        expected: DEFAULT_JOBS_ROUTE_SEARCH,
      },
    ],
    validateCases: [
      {
        description: "keep valid validated job filters",
        input: {
          worldId: "world-1",
          status: "failed",
          jobType: "resume",
          provider: "gcp",
          queueState: "lease_expired",
          audit: "superseded",
          supersededBy: "resume",
          query: "retry me",
          sortBy: "finishedAt",
          sortDirection: "asc",
          ignored: "value",
        },
        expected: {
          worldId: "world-1",
          status: "failed",
          jobType: "resume",
          provider: "gcp",
          queueState: "lease_expired",
          audit: "superseded",
          supersededBy: "resume",
          query: "retry me",
          sortBy: "finishedAt",
          sortDirection: "asc",
          page: 1,
          pageSize: 20,
        },
      },
      {
        description: "trim valid job filters and default empty validated values",
        input: {
          worldId: " world-1 ",
          status: " pending ",
          jobType: " invalid ",
          provider: "",
          queueState: "",
          audit: "",
          supersededBy: "",
          query: undefined,
        },
        expected: {
          worldId: "world-1",
          status: "pending",
          jobType: "all",
          provider: "all",
          queueState: "all",
          audit: "all",
          supersededBy: "all",
          query: "",
          sortBy: "updatedAt",
          sortDirection: "desc",
          page: 1,
          pageSize: 20,
        },
      },
    ],
  });

  it("builds compact jobs permalinks without default empty filters", () => {
    expect(buildJobsPermalink()).toBe("/jobs");
    expect(
      buildJobsPermalink({
        worldId: "world-1",
        status: "failed",
        jobType: "resume",
        query: "retry me",
        page: 2,
        pageSize: 50,
      }),
    ).toBe(
      "/jobs?worldId=world-1&status=failed&jobType=resume&query=retry+me&page=2&pageSize=50",
    );
    expect(
      buildJobsPermalink({
        worldId: "world-1",
        queueState: "delayed",
        audit: "superseded",
        supersededBy: "resume",
        sortBy: "finishedAt",
        sortDirection: "asc",
      }),
    ).toBe(
      "/jobs?worldId=world-1&queueState=delayed&audit=superseded&supersededBy=resume&sortBy=finishedAt&sortDirection=asc",
    );
  });
});
