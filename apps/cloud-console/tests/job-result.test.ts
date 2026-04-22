import { describe, expect, it } from "vitest";
import type { WorldLifecycleJobSummary } from "@yinjie/contracts";
import {
  describeJobResult,
  getJobAuditBadgeLabel,
  getJobSupersededByJobType,
} from "../src/lib/job-result";

const BASE_JOB: WorldLifecycleJobSummary = {
  id: "job-1",
  worldId: "world-1",
  jobType: "resume",
  status: "cancelled",
  attempt: 1,
  maxAttempts: 3,
  failureCode: null,
  failureMessage: null,
  createdAt: "2026-04-21T00:00:00.000Z",
  updatedAt: "2026-04-21T00:01:00.000Z",
  startedAt: null,
  finishedAt: "2026-04-21T00:02:00.000Z",
  payload: { source: "test" },
  resultPayload: null,
};

describe("job result copy", () => {
  it("describes superseded lifecycle jobs with the explicit audit fields", () => {
    const job = {
      ...BASE_JOB,
      failureCode: "superseded_by_new_job",
      supersededByJobType: "suspend" as const,
      supersededByPayload: { source: "operator-action" },
    };

    expect(getJobAuditBadgeLabel(job)).toBe("Superseded by suspend");
    expect(getJobSupersededByJobType(job)).toBe("suspend");
    expect(describeJobResult(job)).toBe("Superseded by newer suspend request.");
  });

  it("falls back to legacy superseded result payload fields", () => {
    const job = {
      ...BASE_JOB,
      resultPayload: {
        action: "superseded_by_new_job",
        supersededByJobType: "resume",
      },
    };

    expect(getJobAuditBadgeLabel(job)).toBe("Superseded by resume");
    expect(getJobSupersededByJobType(job)).toBe("resume");
    expect(describeJobResult(job)).toBe("Superseded by newer resume request.");
  });

  it("keeps non-superseded result actions readable", () => {
    expect(
      describeJobResult({
        ...BASE_JOB,
        status: "succeeded",
        resultPayload: { action: "reconciled" },
      }),
    ).toBe("reconciled");
    expect(
      getJobAuditBadgeLabel({
        ...BASE_JOB,
        status: "succeeded",
        resultPayload: { action: "reconciled" },
      }),
    ).toBeNull();
  });

  it("falls back to the failure message when no action is present", () => {
    expect(
      describeJobResult({
        ...BASE_JOB,
        failureCode: "BOOT_FAILED",
        failureMessage: "Manual recovery needed.",
      }),
    ).toBe("Manual recovery needed.");
    expect(describeJobResult(BASE_JOB)).toBe("None");
  });
});
