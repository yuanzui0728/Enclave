import { cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";

// 微信群通话单个参与者格：圆角方头像 + 名字；活跃说话者高亮绿环；未加入降透明度。
type WeChatGroupCallTileProps = {
  name: string;
  avatar?: string | null;
  joined: boolean;
  isActiveSpeaker: boolean;
  disabled?: boolean;
  onToggle?: () => void;
};

export function WeChatGroupCallTile({
  name,
  avatar,
  joined,
  isActiveSpeaker,
  disabled = false,
  onToggle,
}: WeChatGroupCallTileProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="flex flex-col items-center gap-1.5 disabled:cursor-default"
    >
      <span
        className={cn(
          "relative rounded-xl transition",
          isActiveSpeaker &&
            "ring-2 ring-[color:var(--brand-primary)] ring-offset-2 ring-offset-[#0b0b0c]",
          !joined && "opacity-45 grayscale",
        )}
      >
        <AvatarChip name={name} src={avatar} size="wechat" />
      </span>
      <span className="max-w-[64px] truncate text-[length:var(--text-caption)] leading-none text-white/80">
        {name}
      </span>
    </button>
  );
}
