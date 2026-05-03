import type { WikiContentSnapshot } from "../lib/wiki-api";

const FIELD_LABELS: Record<keyof WikiContentSnapshot, string> = {
  name: "名称",
  avatar: "头像",
  bio: "简介",
  personality: "性格",
  expertDomains: "专长领域",
  triggerScenes: "触发场景",
  relationship: "关系描述",
  relationshipType: "关系类型",
};

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.join(", ");
  return String(value);
}

export function SnapshotDiff({
  before,
  after,
  changedFields,
}: {
  before: WikiContentSnapshot | null;
  after: WikiContentSnapshot;
  changedFields?: string[];
}) {
  const keys = (Object.keys(after) as (keyof WikiContentSnapshot)[]).filter(
    (k) => {
      if (changedFields && changedFields.length > 0) {
        if (changedFields.includes("__revert__")) return true;
        return changedFields.includes(k);
      }
      return JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after[k] ?? null);
    },
  );
  if (keys.length === 0) {
    return (
      <div className="text-xs text-[var(--text-muted)]">未检测到字段变化。</div>
    );
  }
  return (
    <div className="space-y-2">
      {keys.map((k) => {
        const beforeVal = fmt(before?.[k]);
        const afterVal = fmt(after[k]);
        return (
          <div
            key={k}
            className="grid grid-cols-[7rem_1fr_1fr] gap-2 text-xs"
          >
            <div className="font-medium text-[var(--text-muted)] pt-1">
              {FIELD_LABELS[k] ?? k}
            </div>
            <div className="rounded border border-[var(--border-subtle)] bg-[rgba(254,226,226,0.35)] px-2 py-1 whitespace-pre-wrap break-words">
              <span className="text-[10px] uppercase text-[var(--text-muted)] mr-1">
                旧
              </span>
              {beforeVal}
            </div>
            <div className="rounded border border-[var(--border-subtle)] bg-[rgba(220,252,231,0.45)] px-2 py-1 whitespace-pre-wrap break-words">
              <span className="text-[10px] uppercase text-[var(--text-muted)] mr-1">
                新
              </span>
              {afterVal}
            </div>
          </div>
        );
      })}
    </div>
  );
}
