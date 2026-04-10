import { type ReactNode } from "react";
import { Copy, UserRound } from "lucide-react";

type GroupMessageContextMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  onCopyText: () => void;
  onCopySender?: () => void;
};

const MENU_WIDTH = 188;
const MENU_HEIGHT = 108;
const VIEWPORT_PADDING = 12;

export function GroupMessageContextMenu({
  x,
  y,
  onClose,
  onCopyText,
  onCopySender,
}: GroupMessageContextMenuProps) {
  const viewportWidth =
    typeof window === "undefined" ? MENU_WIDTH : window.innerWidth;
  const viewportHeight =
    typeof window === "undefined" ? MENU_HEIGHT : window.innerHeight;
  const left = Math.min(
    Math.max(VIEWPORT_PADDING, x),
    Math.max(VIEWPORT_PADDING, viewportWidth - MENU_WIDTH - VIEWPORT_PADDING),
  );
  const top = Math.min(
    Math.max(VIEWPORT_PADDING, y),
    Math.max(VIEWPORT_PADDING, viewportHeight - MENU_HEIGHT - VIEWPORT_PADDING),
  );

  return (
    <div
      className="fixed inset-0 z-50"
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭消息菜单"
        className="absolute inset-0 cursor-default bg-transparent"
      />

      <div
        style={{ left, top }}
        className="absolute w-[188px] overflow-hidden rounded-[16px] border border-black/6 bg-white py-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <ContextMenuButton
          label="复制消息"
          icon={<Copy size={15} />}
          onClick={onCopyText}
        />
        {onCopySender ? (
          <ContextMenuButton
            label="复制发送者"
            icon={<UserRound size={15} />}
            onClick={onCopySender}
          />
        ) : null}
      </div>
    </div>
  );
}

function ContextMenuButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[#f5f5f5]"
    >
      <span className="text-[color:var(--text-secondary)]">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
