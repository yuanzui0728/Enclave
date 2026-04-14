import { type ReactNode } from "react";

export type DesktopOfficialMessageContextMenuItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  dividerBefore?: boolean;
};

type DesktopOfficialMessageContextMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  items: DesktopOfficialMessageContextMenuItem[];
};

const MENU_WIDTH = 196;
const MENU_ITEM_HEIGHT = 42;
const MENU_DIVIDER_HEIGHT = 10;
const MENU_VERTICAL_PADDING = 16;
const VIEWPORT_PADDING = 12;

export function DesktopOfficialMessageContextMenu({
  x,
  y,
  onClose,
  items,
}: DesktopOfficialMessageContextMenuProps) {
  const visibleItems = items.filter((item) => item);
  const dividerCount = visibleItems.filter((item) => item.dividerBefore).length;
  const menuHeight =
    visibleItems.length * MENU_ITEM_HEIGHT +
    dividerCount * MENU_DIVIDER_HEIGHT +
    MENU_VERTICAL_PADDING;
  const viewportWidth =
    typeof window === "undefined" ? MENU_WIDTH : window.innerWidth;
  const viewportHeight =
    typeof window === "undefined" ? menuHeight : window.innerHeight;
  const left = Math.min(
    Math.max(VIEWPORT_PADDING, x),
    Math.max(VIEWPORT_PADDING, viewportWidth - MENU_WIDTH - VIEWPORT_PADDING),
  );
  const top = Math.min(
    Math.max(VIEWPORT_PADDING, y),
    Math.max(VIEWPORT_PADDING, viewportHeight - menuHeight - VIEWPORT_PADDING),
  );

  return (
    <div
      className="fixed inset-0 z-50"
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭公众号消息菜单"
        className="absolute inset-0 cursor-default bg-transparent"
      />

      <div
        style={{ left, top }}
        className="absolute w-[196px] overflow-hidden rounded-[14px] border border-[color:var(--border-faint)] bg-white/96 py-1.5 shadow-[var(--shadow-overlay)] backdrop-blur-xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {visibleItems.map((item) => (
          <div key={item.key}>
            {item.dividerBefore ? <MenuDivider /> : null}
            <ContextMenuButton
              icon={item.icon}
              label={item.label}
              onClick={item.onClick}
              disabled={item.disabled}
              danger={item.danger}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ContextMenuButton({
  icon,
  label,
  onClick,
  disabled = false,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition ${
        danger
          ? "text-[#dc2626] hover:bg-[rgba(220,38,38,0.06)]"
          : "text-[color:var(--text-primary)] hover:bg-[color:var(--surface-console)]"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        className={
          danger
            ? "text-[rgba(220,38,38,0.88)]"
            : "text-[color:var(--text-secondary)]"
        }
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

function MenuDivider() {
  return <div className="mx-3 my-1 border-t border-[color:var(--border-faint)]" />;
}
