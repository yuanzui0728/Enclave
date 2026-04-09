import { FileText } from "lucide-react";
import { Button } from "@yinjie/ui";

type MobileChatAttachmentPreviewProps = {
  kind: "images" | "file";
  fileName: string;
  imagePreviews?: Array<{
    fileName: string;
    previewUrl: string;
  }>;
  mimeType?: string;
  size?: number;
  pending?: boolean;
  onCancel: () => void;
  onSend: () => void | Promise<void>;
};

export function MobileChatAttachmentPreview({
  kind,
  fileName,
  imagePreviews,
  mimeType,
  size,
  pending = false,
  onCancel,
  onSend,
}: MobileChatAttachmentPreviewProps) {
  return (
    <div className="mb-2 rounded-[22px] border border-white/80 bg-white/92 p-3 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        {kind === "images" && imagePreviews?.length ? (
          <div className="grid w-[7.75rem] grid-cols-2 gap-1">
            {imagePreviews.slice(0, 4).map((item, index) => (
              <div key={`${item.fileName}-${index}`} className="relative">
                <img
                  src={item.previewUrl}
                  alt={item.fileName}
                  className="h-14 w-14 rounded-[14px] border border-white/75 bg-[color:var(--surface-soft)] object-cover"
                />
                {index === 3 && imagePreviews.length > 4 ? (
                  <div className="absolute inset-0 flex items-center justify-center rounded-[14px] bg-black/45 text-xs font-medium text-white">
                    +{imagePreviews.length - 4}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-[18px] border border-white/75 bg-[linear-gradient(135deg,rgba(196,181,253,0.22),rgba(129,140,248,0.18))] text-[color:var(--brand-primary)]">
            <FileText size={24} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
            {kind === "images" && imagePreviews && imagePreviews.length > 1
              ? `已选 ${imagePreviews.length} 张图片`
              : fileName}
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {kind === "images"
              ? "将按顺序逐张发送图片。"
              : "发送前确认一下文件内容。"}
          </div>
          {kind === "images" ? (
            <div className="mt-1 text-[11px] text-[color:var(--text-dim)]">
              最多支持 9 张图片一起发送。
            </div>
          ) : null}
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
          {pending ? "发送中..." : kind === "images" ? "发送图片" : "发送文件"}
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
