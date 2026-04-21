import type { CloudWorldSummary } from "@yinjie/contracts";
import {
  createWorldActionAriaLabel,
  createWorldActionDisplayLabel,
  createWorldActionPendingLabel,
  type WorldLifecycleAction,
} from "../lib/world-lifecycle-actions";

type WorldLifecycleActionButtonsProps = {
  actions: readonly WorldLifecycleAction[];
  world: Pick<CloudWorldSummary, "name">;
  onAction: (action: WorldLifecycleAction) => void;
  pendingAction?: WorldLifecycleAction | null;
  disabled?: boolean;
  disabledActions?: readonly WorldLifecycleAction[];
  className?: string;
  buttonClassName?: string;
};

const DEFAULT_ACTION_GROUP_CLASS_NAME = "flex flex-wrap gap-2";
const DEFAULT_ACTION_BUTTON_CLASS_NAME =
  "rounded-lg border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)] disabled:opacity-60";

export function WorldLifecycleActionButtons({
  actions,
  world,
  onAction,
  pendingAction = null,
  disabled = false,
  disabledActions,
  className = DEFAULT_ACTION_GROUP_CLASS_NAME,
  buttonClassName = DEFAULT_ACTION_BUTTON_CLASS_NAME,
}: WorldLifecycleActionButtonsProps) {
  if (!actions.length) {
    return null;
  }

  const disabledActionSet = new Set(disabledActions ?? []);

  return (
    <div className={className}>
      {actions.map((action) => {
        const isPending = pendingAction === action;
        const actionDisabled = disabled || disabledActionSet.has(action);

        return (
          <button
            key={action}
            type="button"
            disabled={actionDisabled}
            aria-label={createWorldActionAriaLabel(action, world)}
            onClick={() => onAction(action)}
            className={buttonClassName}
          >
            {isPending
              ? createWorldActionPendingLabel(action)
              : createWorldActionDisplayLabel(action)}
          </button>
        );
      })}
    </div>
  );
}
