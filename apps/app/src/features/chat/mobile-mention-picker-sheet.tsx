import { AvatarChip } from "../../components/avatar-chip";

type MentionCandidate = {
  id: string;
  name: string;
  subtitle?: string;
  avatar?: string | null;
};

type MobileMentionPickerSheetProps = {
  open: boolean;
  candidates: MentionCandidate[];
  onClose: () => void;
  onSelect: (candidate: MentionCandidate) => void;
};

export function MobileMentionPickerSheet({
  open,
  candidates,
  onClose,
  onSelect,
}: MobileMentionPickerSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(0,0,0,0.18)]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="关闭选择提醒成员面板"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-[18px] bg-[#f2f2f2] pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-2 shadow-[0_-16px_36px_rgba(15,23,42,0.14)]">
        <div className="flex justify-center pb-2">
          <div className="h-1 w-10 rounded-full bg-[rgba(148,163,184,0.45)]" />
        </div>
        <div className="px-4 pb-2">
          <div className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--text-dim)]">
            群成员
          </div>
          <div className="mt-1 text-[15px] font-medium text-[#111827]">
            选择要提醒的人
          </div>
        </div>
        <div className="max-h-[52vh] overflow-auto bg-white">
          {candidates.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => onSelect(candidate)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left ${
                index > 0 ? "border-t border-black/6" : ""
              }`}
            >
              <AvatarChip
                name={candidate.name}
                src={candidate.avatar}
                size="wechat"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] text-[#111827]">
                  {candidate.name}
                </div>
                {candidate.subtitle ? (
                  <div className="mt-0.5 truncate text-xs text-[#8c8c8c]">
                    {candidate.subtitle}
                  </div>
                ) : null}
              </div>
            </button>
          ))}
        </div>
        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 w-full items-center justify-center rounded-[14px] bg-white text-[17px] font-medium text-[#111827]"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
