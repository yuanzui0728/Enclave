import { FileText } from "lucide-react";
import { Button } from "@yinjie/ui";

type MobileChatAttachmentPreviewProps = {
  kind: "image" | "file";
  fileName: string;
  previewUrl?: string;
  mimeType?: string;
  size?: number;
  pending?: boolean;
  onCancel: () => void;
  onSend: () => void | Promise<void>;
};

export function MobileChatAttachmentPreview({
  kind,
  fileName,
  previewUrl,
  mimeType,
  size,
  pending = false,
  onCancel,
  onSend,
}: MobileChatAttachmentPreviewProps) {
  return (
    <div className="mb-2 rounded-[22px] border border-white/80 bg-white/92 p-3 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        {kind === "image" && previewUrl ? (
          <img
            src={previewUrl}
            alt={fileName}
            className="h-16 w-16 rounded-[18px] border border-white/75 bg-[color:var(--surface-soft)] object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-[18px] border border-white/75 bg-[linear-gradient(135deg,rgba(196,181,253,0.22),rgba(129,140,248,0.18))] text-[color:var(--brand-primary)]">
            <FileText size={24} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
            {fileName}
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {kind === "image"
              ? "发送前确认一下图片内容。"
              : "发送前确认一下文件内容。"}
          </div>
          {kind === "file" ? (
            <div className="mt-1 text-[11px] text-[color:var(--text-dim)]">
              {[mimeType, size ? formatFileSize(size) : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
        >
          取消
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void onSend()}
          disabled={pending}
        >
          {pending ? "发送中..." : kind === "image" ? "发送图片" : "发送文件"}
        </Button>
      </div>
    </div>
  );
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${size} B`;
}
