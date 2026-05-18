import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button, Card } from "@yinjie/ui";
import type { WikiContentSnapshot } from "../lib/wiki-api";

const FIELD_LABELS: Record<keyof WikiContentSnapshot, MessageDescriptor> = {
  name: msg`名称`,
  avatar: msg`头像`,
  bio: msg`简介`,
  personality: msg`性格`,
  expertDomains: msg`专长领域`,
  triggerScenes: msg`触发场景`,
  relationship: msg`关系描述`,
  relationshipType: msg`关系类型`,
};

type Side = "server" | "mine";

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.join(", ");
  return String(value);
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  return false;
}

export function ConflictResolver({
  base,
  serverCurrent,
  mine,
  conflictingFields,
  onResolve,
  onCancel,
}: {
  base: WikiContentSnapshot;
  serverCurrent: WikiContentSnapshot;
  mine: WikiContentSnapshot;
  conflictingFields: string[];
  onResolve: (merged: WikiContentSnapshot) => void;
  onCancel: () => void;
}) {
  const t = translateRuntimeMessage;
  // 三个 snapshot 的字段并集 —— 否则 mine 里新增的可选字段（如 personality /
  // triggerScenes，serverCurrent 没有该 key）会被静默丢掉。
  const allKeys = useMemo(() => {
    const set = new Set<keyof WikiContentSnapshot>();
    for (const obj of [serverCurrent, mine, base]) {
      for (const k of Object.keys(obj) as (keyof WikiContentSnapshot)[]) {
        set.add(k);
      }
    }
    return Array.from(set);
  }, [serverCurrent, mine, base]);

  const fields = useMemo(
    () => allKeys.filter((k) => conflictingFields.includes(k as string)),
    [allKeys, conflictingFields],
  );
  const [picks, setPicks] = useState<Record<string, Side>>(() =>
    Object.fromEntries(fields.map((f) => [f, "mine"])),
  );

  function commit() {
    const merged: WikiContentSnapshot = { ...serverCurrent };
    for (const f of allKeys) {
      if (conflictingFields.includes(f as string)) {
        const side = picks[f as string] ?? "mine";
        const value = side === "server" ? serverCurrent[f] : mine[f];
        (merged as Record<string, unknown>)[f] = value;
      } else if (!shallowEqual(mine[f], base[f])) {
        (merged as Record<string, unknown>)[f] = mine[f];
      }
    }
    onResolve(merged);
  }

  // WAI-ARIA radiogroup 模式：Tab 只进 group 一次（指向当前选中那个 radio），
  // 然后用方向键在组内左右切换。原写法两个 button 都默认 tabbable，键盘用户
  // 在 5 字段冲突时要按 10 次 Tab 才能穿过冲突解决器到"应用所选"按钮。
  const onGroupKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, field: string) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" &&
          event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }
      event.preventDefault();
      const current = picks[field] ?? "mine";
      const next: Side = current === "server" ? "mine" : "server";
      setPicks((prev) => ({ ...prev, [field]: next }));
      // 焦点也要跟随移动 —— 屏读才会重新念出新选中的 radio。
      const group = event.currentTarget;
      const radios = group.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      const targetIndex = next === "server" ? 0 : 1;
      const target = radios[targetIndex];
      if (target) target.focus();
    },
    [picks],
  );

  return (
    <Card className="p-4 border-[var(--border-danger)] bg-[rgba(255,251,235,0.7)] space-y-3">
      <div className="text-sm">
        <strong className="text-[var(--state-danger-text)]">
          <Trans>编辑冲突</Trans>
        </strong>
        <Trans>
          ：服务器上的版本已被其他人修改了你也改过的字段。逐字段选择保留哪个版本后重新提交。
        </Trans>
      </div>
      <div className="space-y-2">
        {fields.map((f) => {
          const fieldLabel = FIELD_LABELS[f] ? t(FIELD_LABELS[f]) : (f as string);
          const groupLabel = t(msg`${fieldLabel} 取值选择`);
          const pickedSide = picks[f as string] ?? "mine";
          return (
            <div
              key={f}
              role="radiogroup"
              aria-label={groupLabel}
              onKeyDown={(e) => onGroupKeyDown(e, f as string)}
              className="grid grid-cols-1 gap-2 text-xs items-start sm:grid-cols-[7rem_1fr_1fr]"
            >
              <div className="font-medium text-[var(--text-muted)] pt-2">
                {fieldLabel}
              </div>
              {/* 两个二选一卡片只靠边框色 + 背景色（绿/红）传达选中态，
                  色盲用户跟 SR 用户都看不出当前选了哪边。给按钮加 role=radio
                  + aria-checked 让 NVDA / VoiceOver 报"选中"，并配套 SR 专用
                  的可访问名（"服务器当前 / 我的修改 字段:xxx"）让用户在没
                  视觉的情况下能区分两份内容。
                  roving tabindex：只有当前选中那个 radio 可 Tab 进入，
                  方向键切换另一个，符合 WAI-ARIA APG radiogroup 标准模式。 */}
              <button
                type="button"
                role="radio"
                aria-checked={pickedSide === "server"}
                tabIndex={pickedSide === "server" ? 0 : -1}
                aria-label={t(msg`${fieldLabel} 使用服务器当前版本`)}
                onClick={() => setPicks({ ...picks, [f]: "server" })}
                className={`text-left rounded border px-2 py-1 whitespace-pre-wrap break-words ${
                  pickedSide === "server"
                    ? "border-[var(--brand-primary)] bg-[rgba(220,252,231,0.6)]"
                    : "border-[var(--border-subtle)]"
                }`}
              >
                <div className="text-[10px] uppercase text-[var(--text-muted)] mb-1">
                  <Trans>服务器当前</Trans>
                </div>
                {fmt(serverCurrent[f])}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={pickedSide === "mine"}
                tabIndex={pickedSide === "mine" ? 0 : -1}
                aria-label={t(msg`${fieldLabel} 使用我的修改`)}
                onClick={() => setPicks({ ...picks, [f]: "mine" })}
                className={`text-left rounded border px-2 py-1 whitespace-pre-wrap break-words ${
                  pickedSide === "mine"
                    ? "border-[var(--brand-primary)] bg-[rgba(254,226,226,0.55)]"
                    : "border-[var(--border-subtle)]"
                }`}
              >
                <div className="text-[10px] uppercase text-[var(--text-muted)] mb-1">
                  <Trans>我的修改</Trans>
                </div>
                {fmt(mine[f])}
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={commit}>
          <Trans>应用所选并重新提交</Trans>
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          <Trans>取消</Trans>
        </Button>
      </div>
    </Card>
  );
}
