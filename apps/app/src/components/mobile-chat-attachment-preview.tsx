import { msg } from "@lingui/macro";
import { FileText, X } from "lucide-react";
import { translateRuntimeMessage } from "@yinjie/i18n";
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
  const t = translateRuntimeMessage;

  return (
    <div className="mb-1.5 rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] p-2.5 shadow-none">
      <div className="flex items-center gap-2.5">
        {kind === "images" && imagePreviews?.length ? (
          <div className="grid max-h-[10rem] w-[10rem] grid-cols-3 gap-1 overflow-auto pr-1">
            {imagePreviews.map((item, index) => (
              <div key={`${item.fileName}-${index}`} className="relative">
                <img
                  src={item.previewUrl}
                  alt={item.fileName}
                  className="h-12 w-12 rounded-[12px] border border-white/75 bg-[color:var(--surface-soft)] object-cover"
                />
                {onRemoveImage ? (
                  <button
                    type="button"
                    onClick={() => onRemoveImage(index)}
                    disabled={pending}
                    className="absolute right-0.5 top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/70 disabled:opacity-45"
                    aria-label={t(msg`移除 ${item.fileName}`)}
                  >
                    <X size={11} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-[16px] border border-[rgba(7,193,96,0.14)] bg-[rgba(247,251,248,0.98)] text-[#15803d]">
            <FileText size={22} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
            {kind === "images" && imagePreviews && imagePreviews.length > 1
              ? t(msg`已选 ${imagePreviews.length} 张图片`)
              : fileName}
          </div>
          <div className="mt-0.5 text-[11px] leading-[18px] text-[color:var(--text-muted)]">
            {kind === "images"
              ? t(msg`将按顺序逐张发送图片。`)
              : t(msg`发送前确认一下文件内容。`)}
          </div>
          {kind === "images" ? (
            <div className="mt-0.5 text-[10px] text-[color:var(--text-dim)]">
              {t(msg`最多支持 9 张图片一起发送，可逐张移除。`)}
            </div>
          ) : null}
          {kind === "file" ? (
            <div className="mt-0.5 text-[10px] text-[color:var(--text-dim)]">
              {[mimeType, size ? formatFileSize(size) : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-2.5 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
          className="h-8 rounded-full px-3 text-[12px] hover:bg-black/4"
        >
          {t(msg`取消`)}
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void onSend()}
          disabled={pending}
          className="h-8 rounded-full bg-[#07c160] px-3 text-[12px] text-white shadow-none hover:bg-[#06ad56]"
        >
          {pending
            ? t(msg`发送中...`)
            : kind === "images"
              ? t(msg`发送图片`)
              : t(msg`发送文件`)}
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
