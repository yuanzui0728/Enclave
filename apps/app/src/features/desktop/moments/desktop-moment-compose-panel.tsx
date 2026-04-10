import { Button, ErrorBlock, TextAreaField } from "@yinjie/ui";
import { X } from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";

type DesktopMomentComposePanelProps = {
  createPending: boolean;
  errorMessage?: string | null;
  ownerAvatar?: string | null;
  ownerUsername?: string | null;
  text: string;
  onClose: () => void;
  onCreate: () => void;
  onTextChange: (value: string) => void;
};

export function DesktopMomentComposePanel({
  createPending,
  errorMessage,
  ownerAvatar,
  ownerUsername,
  text,
  onClose,
  onCreate,
  onTextChange,
}: DesktopMomentComposePanelProps) {
  return (
    <div className="absolute inset-0 z-20 flex justify-end bg-[rgba(15,23,42,0.16)] backdrop-blur-[2px]">
      <div className="flex h-full w-full max-w-[380px] flex-col border-l border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,239,0.98))] shadow-[-24px_0_48px_rgba(15,23,42,0.10)]">
        <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.06)] px-5 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
              发朋友圈
            </div>
            <div className="mt-1 text-[16px] font-semibold text-[color:var(--text-primary)]">
              直接发到当前动态流
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(15,23,42,0.06)] bg-white text-[color:var(--text-secondary)] transition hover:bg-[rgba(248,250,252,0.98)]"
            aria-label="关闭发帖面板"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 px-5 py-5">
          <div className="rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-3">
              <AvatarChip name={ownerUsername} src={ownerAvatar} />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
                  {ownerUsername ?? "我"}
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                  桌面端首版先支持文本发布
                </div>
              </div>
            </div>

            <TextAreaField
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              placeholder="写下这一刻的想法..."
              className="mt-5 min-h-[200px] resize-none border-[rgba(15,23,42,0.08)] bg-[rgba(248,250,252,0.98)]"
              autoFocus
            />

            {errorMessage ? (
              <div className="mt-4">
                <ErrorBlock message={errorMessage} />
              </div>
            ) : null}

            <div className="mt-4 text-[12px] text-[color:var(--text-muted)]">
              发布后会直接插入到动态流顶部。
            </div>

            <div className="mt-5 flex items-center justify-end">
              <Button
                variant="primary"
                disabled={!text.trim() || createPending}
                onClick={onCreate}
              >
                {createPending ? "发布中..." : "发布"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
