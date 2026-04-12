import { FileText, X } from "lucide-react";
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
  onRemoveImage?: (index: number) => void;
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
  onRemoveImage,
  onSend,
}: MobileChatAttachmentPreviewProps) {
  return (
    <div className="mb-2 rounded-[22px] border border-black/5 bg-white p-3 shadow-none">
      <div className="flex items-center gap-3">
        {kind === "images" && imagePreviews?.length ? (
          <div className="grid max-h-[11.5rem] w-[11.5rem] grid-cols-3 gap-1 overflow-auto pr-1">
            {imagePreviews.map((item, index) => (
              <div key={`${item.fileName}-${index}`} className="relative">
                <img
                  src={item.previewUrl}
                  alt={item.fileName}
                  className="h-14 w-14 rounded-[14px] border border-white/75 bg-[color:var(--surface-soft)] object-cover"
                />
                {onRemoveImage ? (
                  <button
                    type="button"
                    onClick={() => onRemoveImage(index)}
                    disabled={pending}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/70 disabled:opacity-45"
                    aria-label={`移除${item.fileName}`}
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-[18px] border border-[rgba(7,193,96,0.14)] bg-[rgba(247,251,248,0.98)] text-[#15803d]">
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
              最多支持 9 张图片一起发送，可逐张移除。
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
          className="hover:bg-black/4"
        >
          取消
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void onSend()}
          disabled={pending}
          className="bg-[#07c160] text-white shadow-none hover:bg-[#06ad56]"
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
