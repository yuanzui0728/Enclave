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
    <div className="mb-1.5 rounded-[20px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] p-2.5 shadow-none">
      <div className="flex items-center gap-2.5">
        {kind === "images" && imagePreviews?.length ? (
          <div className="grid max-h-[10rem] w-[10rem] grid-cols-3 gap-1 overflow-auto pr-1">
            {imagePreviews.map((item, index) => (
              <div key={`${item.fileName}-${index}`} className="relative">
                <img
                  src={item.previewUrl}
                  alt={item.fileName}
                  // 走查移动端单聊新一轮 R2：和桌面版 DesktopAttachmentDraftBar
                  // (R87 + R104) 对齐 —— previewUrl 是 URL.createObjectURL 出来
                  // 的原图 blob，浏览器默认同步在主线程把原图 decode 再缩到 48×48
                  // 显示。yuanzui0728 在手机端一次相册选 5-9 张相机原图 (单张
                  // 3-5MB)，整组同步 decode 的几十 ms 主线程阻塞会让 composer
                  // 弹出动画 / 输入框 keystroke 掉帧。挂 decoding="async" 走
                  // off-thread decode；缩略图先空、decode 完淡入，主线程不抢。
                  // draggable={false}：iOS Safari / Android Chrome 上长按 <img>
                  // 默认弹系统级图片菜单（保存到相册 / 拷贝 / 分享），用户本意
                  // 是想点缩略图右上角 X 移除却先误触系统菜单；同时手指拖动
                  // 缩略图也可能被浏览器当 native drag 把 blob: URL 文本拖到
                  // textarea 里。
                  decoding="async"
                  draggable={false}
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
          <div className="flex h-14 w-14 items-center justify-center rounded-[16px] border border-[rgba(245, 158, 11,0.14)] bg-[rgba(247,251,248,0.98)] text-[#b45309]">
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
          className="h-8 rounded-full bg-[#f59e0b] px-3 text-[12px] text-[#3b2206] shadow-none hover:bg-[#d97706]"
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
