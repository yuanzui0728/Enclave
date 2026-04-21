import { describe, expect, it } from "vitest";
import {
  ALL_WORLD_LIFECYCLE_ACTIONS,
  CONFIRMABLE_WORLD_LIFECYCLE_ACTIONS,
  DASHBOARD_ACTIVE_JOB_ACTIONS,
  DASHBOARD_ATTENTION_ACTIONS,
  DASHBOARD_FAILED_JOB_ACTIONS,
  JOBS_PAGE_ACTIONS,
  WORLDS_PAGE_ACTIONS,
  WORLD_LIFECYCLE_ACTION_RULES,
  canResumeWorld,
  canRetryWorld,
  canSuspendWorld,
  createWorldActionAriaLabel,
  createWorldActionConfirmationCopy,
  createWorldActionDisplayLabel,
  createWorldActionLabel,
  createWorldActionPendingLabel,
  listAllowedWorldActions,
  requiresWorldActionConfirmation,
} from "../src/lib/world-lifecycle-actions";

const ACTION_RULE_CASES = Object.entries(WORLD_LIFECYCLE_ACTION_RULES).map(
  ([status, allowed]) => ({
    status: status as keyof typeof WORLD_LIFECYCLE_ACTION_RULES,
    allowed: [...allowed],
  }),
);

describe("world lifecycle action rules", () => {
  it.each(ACTION_RULE_CASES)(
    "keeps the expected allowed actions for $status worlds",
    ({ status, allowed }) => {
      expect(
        listAllowedWorldActions(status, ALL_WORLD_LIFECYCLE_ACTIONS),
      ).toEqual(allowed);
    },
  );

  it.each(ACTION_RULE_CASES)(
    "keeps helper predicates aligned with the shared rule table for $status worlds",
    ({ status, allowed }) => {
      expect(canResumeWorld(status)).toBe(allowed.includes("resume"));
      expect(canSuspendWorld(status)).toBe(allowed.includes("suspend"));
      expect(canRetryWorld(status)).toBe(allowed.includes("retry"));
    },
  );

  it("marks only suspend and retry as confirmation actions", () => {
    expect(requiresWorldActionConfirmation("resume")).toBe(false);
    expect(requiresWorldActionConfirmation("suspend")).toBe(true);
    expect(requiresWorldActionConfirmation("retry")).toBe(true);
    expect(requiresWorldActionConfirmation("reconcile")).toBe(false);
    expect(CONFIRMABLE_WORLD_LIFECYCLE_ACTIONS).toEqual(["suspend", "retry"]);
  });

  it("keeps surface-level action subsets aligned with the shared rule table", () => {
    expect(WORLDS_PAGE_ACTIONS).toEqual([
      "resume",
      "suspend",
      "retry",
      "reconcile",
    ]);
    expect(JOBS_PAGE_ACTIONS).toEqual(["resume", "retry", "reconcile"]);
    expect(DASHBOARD_ACTIVE_JOB_ACTIONS).toEqual(["resume", "reconcile"]);
    expect(DASHBOARD_FAILED_JOB_ACTIONS).toEqual([
      "resume",
      "retry",
      "reconcile",
    ]);
    expect(DASHBOARD_ATTENTION_ACTIONS).toEqual([
      "resume",
      "retry",
      "reconcile",
    ]);
  });
});

describe("world lifecycle action labels", () => {
  const world = { name: "Mock World" };

  it("builds consistent display, pending, aria, and notice labels", () => {
    expect(createWorldActionDisplayLabel("resume")).toBe("Resume");
    expect(createWorldActionDisplayLabel("suspend")).toBe("Suspend");
    expect(createWorldActionDisplayLabel("retry")).toBe("Retry");
    expect(createWorldActionDisplayLabel("reconcile")).toBe("Reconcile");

    expect(createWorldActionPendingLabel("resume")).toBe("Resuming...");
    expect(createWorldActionPendingLabel("suspend")).toBe("Suspending...");
    expect(createWorldActionPendingLabel("retry")).toBe("Retrying...");
    expect(createWorldActionPendingLabel("reconcile")).toBe(
      "Reconciling...",
    );

    expect(createWorldActionAriaLabel("resume", world)).toBe(
      "Resume Mock World",
    );
    expect(createWorldActionAriaLabel("suspend", world)).toBe(
      "Suspend Mock World",
    );
    expect(createWorldActionAriaLabel("retry", world)).toBe(
      "Retry Mock World",
    );
    expect(createWorldActionAriaLabel("reconcile", world)).toBe(
      "Reconcile Mock World",
    );

    expect(createWorldActionLabel("resume", world)).toBe(
      "Mock World resume queued.",
    );
    expect(createWorldActionLabel("suspend", world)).toBe(
      "Mock World suspend queued.",
    );
    expect(createWorldActionLabel("retry", world)).toBe(
      "Mock World retry queued.",
    );
    expect(createWorldActionLabel("reconcile", world)).toBe(
      "Mock World reconcile triggered.",
    );
  });

  it("builds action-specific confirmation copy", () => {
    expect(createWorldActionConfirmationCopy("suspend", world)).toEqual({
      title: "Suspend Mock World?",
      description:
        "The world will move toward sleeping state and active sessions may need to reconnect after it wakes again.",
      confirmLabel: "Suspend world",
      pendingLabel: "Suspending...",
      danger: true,
    });

    expect(createWorldActionConfirmationCopy("retry", world)).toEqual({
      title: "Retry recovery for Mock World?",
      description:
        "This will queue a new recovery action and clear the current failure state for the world.",
      confirmLabel: "Retry recovery",
      pendingLabel: "Retrying...",
      danger: true,
    });
  });
});
