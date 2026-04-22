import { describe, expect, it } from "vitest";
import { QUEUE_STATE_FILTERS } from "../src/lib/job-queue-state";
import {
  JOB_AUDIT_FILTERS,
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
          status: "all",
          jobType: "all",
          provider: "all",
          queueState: "all",
          audit: "all",
          supersededBy: "all",
          query: "",
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
    ],
  });

  defineRouteSearchNormalizationTests({
    build: buildJobsRouteSearch,
    validate: validateJobsRouteSearch,
    validBuildCases: [
      {
        description: "trim valid job filters while preserving the raw query string",
        input: {
          status: " running ",
          jobType: " reconcile ",
          provider: " aws ",
          queueState: " delayed ",
          audit: " superseded ",
          supersededBy: " resume ",
          query: "  +1 888  ",
        },
        expected: {
          status: "running",
          jobType: "reconcile",
          provider: "aws",
          queueState: "delayed",
          audit: "superseded",
          supersededBy: "resume",
          query: "  +1 888  ",
        },
      },
    ],
    invalidBuildCases: [
      {
        description: "fall back for invalid job filters and non-string query",
        input: {
          status: "queued",
          jobType: "destroy",
          provider: "   ",
          queueState: "other",
          audit: "legacy",
          supersededBy: "destroy",
          query: 123,
        },
        expected: DEFAULT_JOBS_ROUTE_SEARCH,
      },
      {
        description: "fall back for non-string job filters",
        input: {
          status: null,
          jobType: false,
          provider: undefined,
          queueState: {},
          audit: [],
          supersededBy: {},
          query: null,
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
          status: "failed",
          jobType: "resume",
          provider: "gcp",
          queueState: "lease_expired",
          audit: "superseded",
          supersededBy: "resume",
          query: "retry me",
          ignored: "value",
        },
        expected: {
          status: "failed",
          jobType: "resume",
          provider: "gcp",
          queueState: "lease_expired",
          audit: "superseded",
          supersededBy: "resume",
          query: "retry me",
        },
      },
      {
        description: "trim valid job filters and default empty validated values",
        input: {
          status: " pending ",
          jobType: " invalid ",
          provider: "",
          queueState: "",
          audit: "",
          supersededBy: "",
          query: undefined,
        },
        expected: {
          status: "pending",
          jobType: "all",
          provider: "all",
          queueState: "all",
          audit: "all",
          supersededBy: "all",
          query: "",
        },
      },
    ],
  });
});
