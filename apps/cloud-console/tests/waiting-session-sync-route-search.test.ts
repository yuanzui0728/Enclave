import { describe, expect, it } from "vitest";
import {
  buildCompactWaitingSessionSyncRouteSearch,
  buildWaitingSessionSyncRouteSearch,
  DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH,
  validateWaitingSessionSyncRouteSearch,
  WAITING_SESSION_SYNC_PAGE_SIZE_OPTIONS,
  WAITING_SESSION_SYNC_STATUS_FILTERS,
  WAITING_SESSION_SYNC_TASK_TYPE_FILTERS,
} from "../src/lib/waiting-session-sync-helpers";
import {
  defineRouteSearchNormalizationTests,
  defineRouteSearchStaticContractTest,
} from "./route-search-test-helpers";

describe("waiting session sync route search", () => {
  defineRouteSearchStaticContractTest({
    description:
      "keeps waiting-sync filter ordering and defaults aligned with the page contract",
    expectations: [
      {
        description: "status filters stay in their expected display order",
        actual: WAITING_SESSION_SYNC_STATUS_FILTERS,
        expected: ["all", "failed", "pending", "running"],
      },
      {
        description: "task type filters stay in their expected display order",
        actual: WAITING_SESSION_SYNC_TASK_TYPE_FILTERS,
        expected: [
          "all",
          "refresh_world",
          "refresh_phone",
          "invalidate_phone",
        ],
      },
      {
        description: "page-size options stay in their expected display order",
        actual: WAITING_SESSION_SYNC_PAGE_SIZE_OPTIONS,
        expected: [10, 20, 50],
      },
      {
        description: "default waiting-sync route search stays stable",
        actual: DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH,
        expected: {
          status: "all",
          taskType: "all",
          query: "",
          reviewContext: "",
          reviewTaskId: "",
          page: 1,
          pageSize: 20,
        },
      },
    ],
  });

  defineRouteSearchNormalizationTests({
    build: buildWaitingSessionSyncRouteSearch,
    validate: validateWaitingSessionSyncRouteSearch,
    validBuildCases: [
      {
        description:
          "trim valid waiting-sync filters and parse valid pagination fields",
        input: {
          status: " failed ",
          taskType: " refresh_world ",
          query: "  retry world  ",
          reviewContext: " runtime.heartbeat ",
          reviewTaskId: " 44444444-4444-4444-8444-444444444444 ",
          page: " 2 ",
          pageSize: " 50 ",
        },
        expected: {
          status: "failed",
          taskType: "refresh_world",
          query: "  retry world  ",
          reviewContext: "runtime.heartbeat",
          reviewTaskId: "44444444-4444-4444-8444-444444444444",
          page: 2,
          pageSize: 50,
        },
      },
    ],
    invalidBuildCases: [
      {
        description: "fall back for invalid waiting-sync filters and page sizes",
        input: {
          status: "queued",
          taskType: "other",
          query: 123,
          page: "0",
          pageSize: 17,
        },
        expected: DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH,
      },
      {
        description: "fall back when no route search is provided",
        input: undefined,
        expected: DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH,
      },
    ],
    validateCases: [
      {
        description: "keep valid validated waiting-sync filters",
        input: {
          status: "running",
          taskType: "invalidate_phone",
          query: "retry later",
          reviewContext: "cloud.updateWorld",
          reviewTaskId: "task-1",
          page: "3",
          pageSize: "10",
          ignored: "value",
        },
        expected: {
          status: "running",
          taskType: "invalidate_phone",
          query: "retry later",
          reviewContext: "cloud.updateWorld",
          reviewTaskId: "task-1",
          page: 3,
          pageSize: 10,
        },
      },
      {
        description: "trim valid filters and default invalid pagination",
        input: {
          status: " pending ",
          taskType: " invalid ",
          query: undefined,
          reviewContext: " runtime.heartbeat ",
          reviewTaskId: " task-2 ",
          page: "-1",
          pageSize: "",
        },
        expected: {
          status: "pending",
          taskType: "all",
          query: "",
          reviewContext: "runtime.heartbeat",
          reviewTaskId: "task-2",
          page: 1,
          pageSize: 20,
        },
      },
    ],
  });

  it("builds compact waiting-sync route search without default fields", () => {
    expect(
      buildCompactWaitingSessionSyncRouteSearch({
        status: "all",
        taskType: "all",
        query: "",
        reviewContext: "",
        reviewTaskId: "",
        page: 1,
        pageSize: 20,
      }),
    ).toEqual({});

    expect(
      buildCompactWaitingSessionSyncRouteSearch({
        status: "pending",
        taskType: "refresh_phone",
        query: "runtime.heartbeat",
        reviewContext: "cloud.updateWorld",
        reviewTaskId: "44444444-4444-4444-8444-444444444444",
        page: 2,
        pageSize: 10,
      }),
    ).toEqual({
      status: "pending",
      taskType: "refresh_phone",
      query: "runtime.heartbeat",
      reviewContext: "cloud.updateWorld",
      reviewTaskId: "44444444-4444-4444-8444-444444444444",
      page: 2,
      pageSize: 10,
    });
  });
});
