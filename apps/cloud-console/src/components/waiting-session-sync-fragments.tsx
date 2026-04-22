import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import type { CloudWaitingSessionSyncTaskSummary } from "@yinjie/contracts";
import type {
  WaitingSessionSyncContextGroupArtifact,
  WaitingSessionSyncStatusSummary,
} from "../lib/waiting-session-sync-helpers";

const TASK_STATUS_BADGE_STYLES: Record<
  CloudWaitingSessionSyncTaskSummary["status"],
  string
> = {
  failed: "border-rose-300/60 bg-rose-500/10 text-rose-200",
  pending: "border-amber-300/60 bg-amber-500/10 text-amber-100",
  running: "border-sky-300/60 bg-sky-500/10 text-sky-100",
};

const TASK_STATUS_LABELS: Record<
  CloudWaitingSessionSyncTaskSummary["status"],
  string
> = {
  failed: "Failed",
  pending: "Pending",
  running: "Running",
};

function joinClasses(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

type WaitingSessionSyncActionTone =
  | "brand"
  | "danger"
  | "sky"
  | "emerald"
  | "neutral";
type WaitingSessionSyncActionVariant = "default" | "ghost" | "chip";
type WaitingSessionSyncActionSize = "compact" | "regular";

const ACTION_BASE_CLASS_MAP: Record<WaitingSessionSyncActionVariant, string> = {
  default:
    "inline-flex items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-60",
  ghost:
    "inline-flex items-center justify-center rounded-xl border bg-transparent transition disabled:cursor-not-allowed disabled:opacity-60",
  chip:
    "inline-flex items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60",
};

const ACTION_SIZE_CLASS_MAP: Record<
  WaitingSessionSyncActionSize,
  Record<WaitingSessionSyncActionVariant, string>
> = {
  compact: {
    default: "px-3 py-2 text-xs",
    ghost: "px-3 py-2 text-xs",
    chip: "px-3 py-1 text-xs",
  },
  regular: {
    default: "px-4 py-2 text-sm",
    ghost: "px-4 py-2 text-sm",
    chip: "px-4 py-1.5 text-sm",
  },
};

const ACTION_COLOR_CLASS_MAP: Record<
  WaitingSessionSyncActionTone,
  Record<WaitingSessionSyncActionVariant, string>
> = {
  brand: {
    default:
      "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-white hover:opacity-95",
    ghost:
      "border-[color:var(--brand-primary)]/40 text-[color:var(--brand-primary)] hover:border-[color:var(--brand-primary)] hover:text-white",
    chip:
      "border-[color:var(--brand-primary)]/40 text-[color:var(--brand-primary)] hover:border-[color:var(--brand-primary)] hover:text-white",
  },
  danger: {
    default:
      "border-rose-400/40 bg-rose-500/10 text-rose-100 hover:border-rose-300/60",
    ghost:
      "border-rose-300/40 text-rose-100 hover:border-rose-200/60 hover:text-white",
    chip:
      "border-rose-300/40 text-rose-100 hover:border-rose-200/60 hover:text-white",
  },
  sky: {
    default:
      "border-sky-200/30 bg-sky-400/10 text-sky-50 hover:border-sky-100/50",
    ghost:
      "border-sky-200/30 text-sky-100 hover:border-sky-100/50 hover:text-white",
    chip:
      "border-sky-200/30 text-sky-50 hover:border-sky-100/50",
  },
  emerald: {
    default:
      "border-emerald-200/30 bg-emerald-400/10 text-emerald-50 hover:border-emerald-100/50",
    ghost:
      "border-emerald-200/30 text-emerald-100 hover:border-emerald-100/50 hover:text-white",
    chip:
      "border-emerald-200/30 text-emerald-50 hover:border-emerald-100/50",
  },
  neutral: {
    default:
      "border-[color:var(--border-faint)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)]",
    ghost:
      "border-[color:var(--border-faint)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]",
    chip:
      "border-[color:var(--border-faint)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
  },
};

export function getWaitingSessionSyncActionClassName({
  tone,
  variant = "default",
  size = "compact",
  className,
}: {
  tone: WaitingSessionSyncActionTone;
  variant?: WaitingSessionSyncActionVariant;
  size?: WaitingSessionSyncActionSize;
  className?: string;
}) {
  return joinClasses(
    ACTION_BASE_CLASS_MAP[variant],
    ACTION_SIZE_CLASS_MAP[size][variant],
    ACTION_COLOR_CLASS_MAP[tone][variant],
    className,
  );
}

export function getWaitingSessionSyncActionLinkClassName({
  tone,
  variant = "default",
  size = "compact",
  className,
}: {
  tone: WaitingSessionSyncActionTone;
  variant?: WaitingSessionSyncActionVariant;
  size?: WaitingSessionSyncActionSize;
  className?: string;
}) {
  return getWaitingSessionSyncActionClassName({
    tone,
    variant,
    size,
    className: joinClasses(
      "underline decoration-dotted underline-offset-4",
      className,
    ),
  });
}

export function WaitingSessionSyncActionButton({
  tone,
  variant = "default",
  size = "compact",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone: WaitingSessionSyncActionTone;
  variant?: WaitingSessionSyncActionVariant;
  size?: WaitingSessionSyncActionSize;
}) {
  return (
    <button
      {...props}
      type={type}
      className={getWaitingSessionSyncActionClassName({
        tone,
        variant,
        size,
        className,
      })}
    />
  );
}

export function WaitingSessionSyncActionAnchor({
  tone,
  variant = "default",
  size = "compact",
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  tone: WaitingSessionSyncActionTone;
  variant?: WaitingSessionSyncActionVariant;
  size?: WaitingSessionSyncActionSize;
}) {
  return (
    <a
      {...props}
      className={getWaitingSessionSyncActionLinkClassName({
        tone,
        variant,
        size,
        className,
      })}
    />
  );
}

export function WaitingSessionSyncCountChip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={joinClasses(
        "rounded-full border border-[color:var(--border-faint)] px-3 py-1 text-xs text-[color:var(--text-secondary)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function WaitingSessionSyncTaskStatusBadge({
  status,
  className,
}: {
  status: CloudWaitingSessionSyncTaskSummary["status"];
  className?: string;
}) {
  return (
    <span
      className={joinClasses(
        "inline-flex rounded-full border px-3 py-1 text-xs font-medium",
        TASK_STATUS_BADGE_STYLES[status],
        className,
      )}
    >
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}

export function WaitingSessionSyncStatusPills({
  summary,
  className,
}: {
  summary: WaitingSessionSyncStatusSummary;
  className?: string;
}) {
  return (
    <div className={joinClasses("flex flex-wrap gap-2 text-xs", className)}>
      <span className="rounded-full border border-rose-300/40 bg-rose-500/10 px-3 py-1 text-rose-100">
        Failed {summary.failed}
      </span>
      <span className="rounded-full border border-amber-300/40 bg-amber-500/10 px-3 py-1 text-amber-100">
        Pending {summary.pending}
      </span>
      <span className="rounded-full border border-sky-300/40 bg-sky-500/10 px-3 py-1 text-sky-100">
        Running {summary.running}
      </span>
    </div>
  );
}

export function WaitingSessionSyncArtifactSummary({
  artifact,
  className,
}: {
  artifact: WaitingSessionSyncContextGroupArtifact;
  className?: string;
}) {
  return (
    <div
      className={joinClasses(
        "rounded-2xl border border-sky-200/30 bg-sky-400/10 px-4 py-3 text-xs text-sky-50",
        className,
      )}
    >
      <div className="uppercase tracking-[0.18em] text-sky-100/80">
        Artifact summary
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="rounded-full border border-sky-200/30 px-3 py-1">
          Ids {artifact.taskIds.length}
        </span>
        <span className="rounded-full border border-sky-200/30 px-3 py-1">
          Keys {artifact.taskKeys.length}
        </span>
        <span className="rounded-full border border-sky-200/30 px-3 py-1">
          Targets {artifact.targetValues.length}
        </span>
      </div>
      <div className="mt-3 leading-6 text-sky-50/85">
        <div>Target values: {artifact.targetValues.join(" · ")}</div>
        {artifact.worldDetailPath ? (
          <div>World detail: {artifact.worldDetailPath}</div>
        ) : null}
      </div>
    </div>
  );
}
