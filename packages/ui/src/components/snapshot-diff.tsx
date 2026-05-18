import type { ReactNode } from "react";

export type SnapshotDiffShape = {
  name?: string | null;
  avatar?: string | null;
  bio?: string | null;
  personality?: string | null;
  expertDomains?: string[] | null;
  triggerScenes?: string[] | null;
  relationship?: string | null;
  relationshipType?: string | null;
};

// English defaults keep this UI primitive surface-agnostic; surface apps pass
// `fieldLabels`, `oldLabel`, `newLabel`, `emptyLabel` via their own i18n layer.
// i18n-ignore-start: source-of-truth English defaults; surface apps override.
const DEFAULT_FIELD_LABELS: Record<keyof SnapshotDiffShape, string> = {
  name: "Name",
  avatar: "Avatar",
  bio: "Bio",
  personality: "Personality",
  expertDomains: "Expert domains",
  triggerScenes: "Trigger scenes",
  relationship: "Relationship",
  relationshipType: "Relationship type",
};
// i18n-ignore-end

const DEFAULT_OLD_LABEL = "Old";
const DEFAULT_NEW_LABEL = "New";
const DEFAULT_EMPTY_LABEL = "No field changes detected.";

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.join(", ");
  return String(value);
}

export type SnapshotDiffProps = {
  before: SnapshotDiffShape | null;
  after: SnapshotDiffShape;
  changedFields?: string[];
  /** When provided, render a leading control cell per row. */
  renderRowLead?: (field: keyof SnapshotDiffShape) => ReactNode;
  emptyLabel?: ReactNode;
  fieldLabels?: Partial<Record<keyof SnapshotDiffShape, string>>;
  oldLabel?: string;
  newLabel?: string;
};

export function SnapshotDiff({
  before,
  after,
  changedFields,
  renderRowLead,
  emptyLabel,
  fieldLabels,
  oldLabel = DEFAULT_OLD_LABEL,
  newLabel = DEFAULT_NEW_LABEL,
}: SnapshotDiffProps) {
  const resolvedFieldLabels = { ...DEFAULT_FIELD_LABELS, ...(fieldLabels ?? {}) };
  const keys = (Object.keys(after) as (keyof SnapshotDiffShape)[]).filter(
    (k) => {
      if (k === "avatar" || !resolvedFieldLabels[k]) {
        // hide unknown keys but keep avatar — let the predicate below decide
      }
      if (changedFields && changedFields.length > 0) {
        if (
          changedFields.includes("__create__") ||
          changedFields.includes("__delete__") ||
          changedFields.includes("__restore__") ||
          changedFields.includes("__revert__")
        ) {
          return true;
        }
        return changedFields.includes(k);
      }
      return JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after[k] ?? null);
    },
  );
  if (keys.length === 0) {
    return (
      <div className="text-xs text-[var(--text-muted)]">
        {emptyLabel ?? DEFAULT_EMPTY_LABEL}
      </div>
    );
  }
  const cols = renderRowLead ? "grid-cols-[1.5rem_7rem_1fr_1fr]" : "grid-cols-[7rem_1fr_1fr]";
  return (
    <div className="space-y-2">
      {keys.map((k) => {
        const beforeVal = fmt(before?.[k]);
        const afterVal = fmt(after[k]);
        return (
          <div key={k} className={`grid ${cols} gap-2 text-xs`}>
            {renderRowLead ? (
              <div className="flex items-start pt-1">{renderRowLead(k)}</div>
            ) : null}
            <div className="font-medium text-[var(--text-muted)] pt-1">
              {resolvedFieldLabels[k] ?? k}
            </div>
            <div className="rounded border border-[var(--border-subtle)] bg-[rgba(254,226,226,0.35)] px-2 py-1 whitespace-pre-wrap break-all">
              <span className="text-[10px] uppercase text-[var(--text-muted)] mr-1">
                {oldLabel}
              </span>
              {beforeVal}
            </div>
            <div className="rounded border border-[var(--border-subtle)] bg-[rgba(220,252,231,0.45)] px-2 py-1 whitespace-pre-wrap break-all">
              <span className="text-[10px] uppercase text-[var(--text-muted)] mr-1">
                {newLabel}
              </span>
              {afterVal}
            </div>
          </div>
        );
      })}
    </div>
  );
}
