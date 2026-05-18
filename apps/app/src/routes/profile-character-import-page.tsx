import { useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileJson,
  FileUp,
  RefreshCcw,
  X,
} from "lucide-react";
import {
  importPersonalCharacter,
  type Character,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, Button, cn } from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { navigateBackOrFallback } from "../lib/history-back";
import { resolveAppMediaUrl } from "../lib/media-url";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type Result =
  | {
      kind: "success";
      character: Character;
      overwrote: boolean;
      // 'friend' | 'close' | 'best' | 'blocked' | 'removed'。blocked 来自用户
      // 主动 block 过的关系，re-import 不会自动解除——UI 显示对应文案，避免
      // 误导用户以为又是好友。
      friendshipStatus: string;
    }
  | { kind: "danger"; message: string }
  // 走查 R1：多文件拖入"只取第一个"这种非阻塞提示原本走 danger（红色）卡，
  // 视觉上等同于"导入失败"——实际上 preview 已经成功就位，用户接着点
  // 「导入到我的世界」即可。新增 warning 类型走 amber 色，与 FilePreviewCard
  // 里 schema 缺失的提醒同档。
  | { kind: "warning"; message: string };

type FilePreview = {
  fileName: string;
  fileSize: number;
  payload: Record<string, unknown>;
};

// 桌面端 profile-page 直接 redirect 到 /desktop/settings 不渲染入口，所以
// "导入角色" Link 只在移动布局出现。但桌面用户通过 URL 直接访问这个页面
// 时不应该被无关 redirect 踢走 — 让它在桌面也可以工作（顶部栏是移动风格
// 但功能完整）。
export function ProfileCharacterImportPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const baseUrl = useAppRuntimeConfig().apiBaseUrl;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [dragging, setDragging] = useState(false);
  // 新轮次 R2：用户在 file picker / 拖拽里快速换两张文件时，readFile 是
  // fire-and-forget，第一次的 file.text() 还在跑、第二次已经开始；如果 file2
  // （较小）先 resolve、file1（较大）后 resolve，最终 setPreview 会被 file1
  // 的回填覆盖，用户在预览卡里看到 file1 的内容、文件名却是 file2 选的那个。
  // 拿一个自增 id 标记 "最新一次 readFile 调用"，过期那条 fall through 直接早退。
  const latestReadIdRef = useRef(0);

  const goBack = () =>
    navigateBackOrFallback(
      () => {
        void navigate({ to: "/tabs/profile", replace: true });
      },
      "/tabs/profile",
    );

  async function readFile(file: File, postReadWarning?: string | null) {
    const readId = ++latestReadIdRef.current;
    // 同步先把旧的清掉——避免新文件 file.text() 还没跑出来时，旧的预览卡 / 失败
    // 提示还挂着误导用户。后续每次 await 之后都要再校 readId 防止 stale 回填。
    setResult(null);
    setPreview(null);
    // 防御性：bundle 实际只有几十 KB，超过 5 MB 几乎一定是用户选错文件
    // （视频、压缩包等）。早早 reject 避免 file.text() 把上 GB 内容读到
    // 浏览器内存里把页面卡死。
    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      if (readId !== latestReadIdRef.current) return;
      setResult({
        kind: "danger",
        message: t(
          msg`文件太大（${formatFileSize(file.size)}），上限 5 MB。确认是 .character.json 文件后再试。`,
        ),
      });
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      if (readId !== latestReadIdRef.current) return;
      setResult({
        kind: "danger",
        message: t(msg`读取文件失败：${(err as Error).message}`),
      });
      return;
    }
    if (readId !== latestReadIdRef.current) return;
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      setResult({
        kind: "danger",
        message: t(
          msg`JSON 解析失败，请确认文件没被破坏：${(err as Error).message}`,
        ),
      });
      return;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      setResult({
        kind: "danger",
        message: t(msg`文件内容不是有效的 JSON 对象。`),
      });
      return;
    }
    const p = payload as Record<string, unknown>;
    if (typeof p.name !== "string" || !p.name.trim()) {
      setResult({
        kind: "danger",
        message: t(msg`文件缺少 name 字段；这不是一个合法的角色 bundle。`),
      });
      return;
    }
    // 纯零宽字符名字 trim 后非空但渲染为空白，导入后通讯录会出现点不开的空标签。
    // 与后端 isPrivateImportNameVisuallyEmpty / wiki 写入路径同语义先在 UI 拒。
    if (p.name.trim().replace(/[​-‍﻿⁠]/g, "").length === 0) {
      setResult({
        kind: "danger",
        message: t(msg`name 不能是仅零宽字符的空白文本，请编辑文件后再试。`),
      });
      return;
    }
    // 走查 R1：name 带换行符 / 控制字符会撑爆通讯录单行渲染，也会把多行指令
    // 注入 AI prompt。后端已经会拒，前端先拒避免一次无谓的网络往返。
    // 第 5 次走查 R1：与后端 characters.service.ts:NAME_CONTROL_CHAR_RE 同步，
    // 把 U+0085 / U+2028 / U+2029 行终止符 + BIDI override (U+202A-U+202E 等)
    // + BOM 一并卡掉。BIDI 尤其关键：name="good‮bad" 视觉上会渲染成 "gooddab"
    // —— 用户在通讯录看到的字面值与 DB 实际存的不一致，且塞进 AI prompt 也
    // 是 token-vs-visual mismatch 形式的 prompt injection 窗口。
    if (
      /[\x00-\x1F\x7F\u0085\u2028\u2029\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/.test(
        p.name,
      )
    ) {
      setResult({
        kind: "danger",
        message: t(
          msg`name 不能包含换行符或控制字符，请编辑文件后再试。`,
        ),
      });
      return;
    }
    setPreview({
      fileName: file.name,
      fileSize: file.size,
      payload: p,
    });
    // readId 在每个 await 后已经校过；如果到这里 readId 仍是最新，再把
    // postReadWarning（如多文件拖入提示）作为 warning 卡叠加显示——preview
    // 已经就位、用户可以继续点导入，所以走 amber 警告色而不是红色 danger，
    // 避免视觉上像"导入失败了"。
    if (postReadWarning && readId === latestReadIdRef.current) {
      setResult({ kind: "warning", message: postReadWarning });
    }
  }

  function pickFile() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void readFile(file);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const files = event.dataTransfer.files;
    const file = files?.[0];
    if (!file) return;
    // 第 5 次走查 R3：用户拖入多个文件时静默只取第一个，用户以为全都进了
    // —— 把"取首个"的提示通过 readFile 一起带进去，在 preview/result 设
    // 完之后再叠加一条 warning（直接在这儿 setResult 会被 readFile 内的
    // setResult(null) 抹掉）。
    const multiFileWarning =
      files && files.length > 1
        ? t(
            msg`检测到 ${files.length} 个文件，只处理第一个（${file.name}）。请逐个导入。`,
          )
        : null;
    void readFile(file, multiFileWarning);
  }

  function clearSelection() {
    setPreview(null);
    setResult(null);
  }

  async function confirmImport() {
    if (!preview) return;
    // 极快双击「导入」按钮可能在 React 重渲染前两次都触发；用 submitting
    // 守卫挡掉（虽然 disabled prop 也会挡，但 React 重渲染有微秒级延迟）。
    if (submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await importPersonalCharacter(preview.payload);
      setResult({
        kind: "success",
        character: res.character,
        overwrote: res.overwrote,
        friendshipStatus: res.friendshipStatus,
      });
      setPreview(null);
      // 通讯录 / 角色列表用 react-query 缓存，staleTime 10-60s 内不会重新拉。
      // 不显式 invalidate，用户立刻点"去通讯录"可能看不到新导入的角色。
      //
      // 新会话3 R1 perf：原 await Promise.all 让 submitting=true 在 invalidate
      // 期间多卡 100-500ms（contacts query 若已经在背景里挂载，refetch 完成
      // 才 resolve），用户没法接着再导入下一个角色。但 invalidateQueries 的
      // "标 stale"语义是同步执行的——refetch 是 async 副作用，对"用户接下来
      // 点去通讯录看到新数据"没影响（页面 mount 时 useQuery 看到 stale 自然
      // refetch）。改成 void fire-and-forget。
      void queryClient.invalidateQueries({
        queryKey: ["app-friends", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-characters", baseUrl],
      });
    } catch (err) {
      setResult({
        kind: "danger",
        message: describeRequestError(err, t(msg`导入失败，请稍后再试`)),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`导入角色`)}
        titleAlign="center"
        leftActions={
          <button
            type="button"
            onClick={goBack}
            aria-label={t(msg`返回`)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] transition-colors active:bg-black/[0.05]"
          >
            <ArrowLeft size={17} />
          </button>
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="space-y-4 px-4 pb-10 pt-3">
        {/* 步骤引导 */}
        <ol className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] p-4 text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
          <li className="flex gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(56,189,248,0.12)] text-[11px] font-semibold text-[#0891b2]">
              1
            </span>
            <span>
              {t(
                msg`在「世界角色管理平台 → 我的私有角色」编辑或新建角色，点「📤 导出 JSON」下载文件`,
              )}
            </span>
          </li>
          <li className="mt-2 flex gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(56,189,248,0.12)] text-[11px] font-semibold text-[#0891b2]">
              2
            </span>
            <span>
              {t(msg`回到这里，拖入或选择刚才下载的 .character.json 文件`)}
            </span>
          </li>
          <li className="mt-2 flex gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(56,189,248,0.12)] text-[11px] font-semibold text-[#0891b2]">
              3
            </span>
            <span>
              {t(
                msg`确认无误后点「导入到我的世界」。同名会覆盖（保留原 id 和好友关系），不同名则新建并加为好友。`,
              )}
            </span>
          </li>
        </ol>

        {/* 文件投放区 / 预览区 */}
        {!preview && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!dragging) setDragging(true);
            }}
            onDragLeave={(e) => {
              // 防止鼠标拖到子元素时父元素 dragLeave 误触发产生闪烁；
              // 只有真正离开整个 drop zone 才 setDragging(false)。
              const next = e.relatedTarget as Node | null;
              if (next && e.currentTarget.contains(next)) return;
              setDragging(false);
            }}
            onDrop={handleDrop}
            className={cn(
              "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors",
              dragging
                ? "border-[#0891b2] bg-[rgba(56,189,248,0.06)]"
                : "border-[color:var(--border-default)] bg-[color:var(--bg-canvas-elevated)]",
            )}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(56,189,248,0.12)] text-[#0891b2]">
              <FileUp size={24} />
            </div>
            <div className="space-y-1">
              <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
                {dragging
                  ? t(msg`松手即可读取`)
                  : t(msg`拖入文件，或点下面按钮选择`)}
              </div>
              <div className="text-[11px] text-[color:var(--text-muted)]">
                {t(msg`仅支持 .character.json / application/json`)}
              </div>
            </div>
            <Button
              type="button"
              variant="primary"
              onClick={pickFile}
              disabled={submitting}
            >
              {t(msg`选择文件`)}
            </Button>
          </div>
        )}

        {preview && (
          <FilePreviewCard
            preview={preview}
            onCancel={clearSelection}
            onConfirm={confirmImport}
            submitting={submitting}
          />
        )}

        {/* 结果反馈 */}
        {result?.kind === "success" && (
          <SuccessCard
            character={result.character}
            overwrote={result.overwrote}
            friendshipStatus={result.friendshipStatus}
            onImportAnother={clearSelection}
            // 导入会自动加好友（characters.service.ts:importPersonalCharacter
            // 末尾的 friendship upsert）。"世界角色"目录的过滤是
            // !friendIds.has(character.id)，导入后的角色已经是好友，
            // 在那里反而看不到 —— 跳通讯录才是用户真正能找到它的地方。
            onGoCharacters={() => void navigate({ to: "/tabs/contacts" })}
          />
        )}
        {result?.kind === "danger" && (
          <div className="flex items-start gap-3 rounded-2xl bg-[rgba(220,38,38,0.08)] px-4 py-3 text-[13px] text-[#b42318]">
            <X size={16} className="mt-0.5 shrink-0" />
            <div>{result.message}</div>
          </div>
        )}
        {result?.kind === "warning" && (
          <div className="flex items-start gap-3 rounded-2xl bg-[rgba(245,158,11,0.10)] px-4 py-3 text-[13px] text-[#92400e]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>{result.message}</div>
          </div>
        )}
      </div>
    </AppPage>
  );
}

function FilePreviewCard({
  preview,
  onCancel,
  onConfirm,
  submitting,
}: {
  preview: FilePreview;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  const t = useRuntimeTranslator();
  const p = preview.payload;
  const name = typeof p.name === "string" ? p.name : "";
  const avatar = typeof p.avatar === "string" ? p.avatar : "";
  const bio = typeof p.bio === "string" ? p.bio : "";
  const relationship = typeof p.relationship === "string" ? p.relationship : "";
  const relationshipType =
    typeof p.relationshipType === "string" ? p.relationshipType : "friend";
  // 走查 R2：后端 assertPrivateCharacterFieldLimits / characters.service patch
  // 路径已经会 trim 每个元素 + 丢空白条目，预览这里也跟上 — 否则用户在 wiki
  // 端误填了空白 chip（"  " / ""），preview 渲染出"看不见的小药丸"占位，导入
  // 后却没有，体验和数据对不上。trim 后再过滤空串。
  const expertDomains = Array.isArray(p.expertDomains)
    ? (p.expertDomains as unknown[])
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];
  const schema = typeof p.$schema === "string" ? p.$schema : null;
  const hasExpectedSchema = schema === "yinjie-private-character/v1";
  // 后端 characters.controller#parsePrivateCharacterImportBody 对"$schema 非空
  // 且不匹配"直接抛 400 — 早期 UI 只 warn"仍可尝试导入"导致用户点完撞 400。
  // 这里区分：missing 仍允许（后端也允许），mismatch 直接 disable 导入按钮。
  const schemaMismatch = schema !== null && !hasExpectedSchema;
  return (
    <div className="space-y-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] p-4">
      <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-muted)]">
        <FileJson size={14} />
        <span className="truncate">{preview.fileName}</span>
        <span className="opacity-50">·</span>
        <span>{formatFileSize(preview.fileSize)}</span>
      </div>

      <div className="flex items-start gap-3">
        <PreviewAvatar avatar={avatar} name={name} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="truncate text-[16px] font-semibold text-[color:var(--text-primary)]">
            {name}
          </div>
          <div className="truncate text-[11px] text-[color:var(--text-muted)]">
            {relationship || relationshipType}
          </div>
          {bio && (
            <p className="line-clamp-3 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
              {bio}
            </p>
          )}
        </div>
      </div>

      {expertDomains.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {expertDomains.slice(0, 6).map((d, idx) => (
            <span
              key={`${d}-${idx}`}
              className="rounded-full bg-[color:var(--surface-soft)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]"
            >
              {d}
            </span>
          ))}
          {expertDomains.length > 6 && (
            <span className="rounded-full bg-[color:var(--surface-soft)] px-2 py-0.5 text-[10px] text-[color:var(--text-muted)]">
              {t(msg`+${expertDomains.length - 6}`)}
            </span>
          )}
        </div>
      )}

      {!hasExpectedSchema && (
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-[11px] leading-relaxed",
            schemaMismatch
              ? "bg-[rgba(220,38,38,0.08)] text-[#b42318]"
              : "bg-[rgba(245,158,11,0.10)] text-[#92400e]",
          )}
        >
          {schemaMismatch
            ? t(
                msg`文件 $schema 是 "${schema}"，与期望的 "yinjie-private-character/v1" 不一致。请到「世界角色管理平台 → 我的私有角色」重新导出文件。`,
              )
            : t(
                msg`文件缺少 $schema 标识；仍可尝试导入，但建议检查内容是否齐全。`,
              )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--border-faint)] pt-3">
        <Button
          type="button"
          variant="primary"
          onClick={onConfirm}
          disabled={submitting || schemaMismatch}
        >
          {submitting ? t(msg`导入中…`) : t(msg`✅ 导入到我的世界`)}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={submitting}
        >
          {t(msg`换一个文件`)}
        </Button>
      </div>
    </div>
  );
}

function SuccessCard({
  character,
  overwrote,
  friendshipStatus,
  onImportAnother,
  onGoCharacters,
}: {
  character: Character;
  overwrote: boolean;
  friendshipStatus: string;
  onImportAnother: () => void;
  onGoCharacters: () => void;
}) {
  const t = useRuntimeTranslator();
  // 第 5 次走查 R3：blocked 状态的角色 re-import 不会被自动解除（backend 故意
  // 保留用户主动 block 的动作）。原 UI 无论 friendship 状态都说"已自动加为
  // 你的好友"，blocked 用户看到这条会以为自己刚把对方加回来——但去通讯录
  // 看仍在黑名单里。改成基于 friendshipStatus 分支显示。
  const isBlocked = friendshipStatus === "blocked";
  return (
    <div
      className={cn(
        "space-y-3 rounded-2xl border p-4",
        isBlocked
          ? "border-amber-400/30 bg-[rgba(245,158,11,0.08)]"
          : "border-emerald-400/30 bg-[rgba(16,185,129,0.08)]",
      )}
    >
      <div
        className={cn(
          "flex items-start gap-2 text-[13px] font-medium",
          isBlocked ? "text-[#b45309]" : "text-[#047857]",
        )}
      >
        <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
        <div>
          {overwrote
            ? t(msg`已覆盖同名角色：${character.name}`)
            : t(msg`已导入新角色：${character.name}`)}
        </div>
      </div>
      <div
        className={cn(
          "text-[11px]",
          isBlocked ? "text-[#b45309]/80" : "text-[#047857]/80",
        )}
      >
        {isBlocked
          ? t(
              msg`这位仍在你的黑名单里——角色数据已更新，但需要先解除拉黑才能继续对话。`,
            )
          : overwrote
            ? t(msg`原有 id 和好友关系都保留了。`)
            : t(msg`已自动加为你的好友，可以在通讯录里找到。`)}
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onGoCharacters}
        >
          {t(msg`去通讯录`)}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onImportAnother}
        >
          <RefreshCcw size={14} className="mr-1" />
          {t(msg`再导入一个`)}
        </Button>
      </div>
    </div>
  );
}

function PreviewAvatar({ avatar, name }: { avatar: string; name: string }) {
  const trimmed = (avatar ?? "").trim();
  const isUrl = /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/");
  const [imgFailed, setImgFailed] = useState(false);
  // 用户切换/换文件预览不同 avatar 时重试加载，否则 imgFailed 状态粘住。
  useEffect(() => {
    setImgFailed(false);
  }, [trimmed]);
  if (isUrl && !imgFailed) {
    // 走 resolveAppMediaUrl 与 AvatarChip 保持一致：相对路径
    // (例：/api/wiki/avatars/xxx.png) 用裸 <img src> 会按 page origin 解析，
    // 在多租户公网代理场景下打不到当前 world 的 /api/*。这里 absolutize 后
    // 预览跟导入后角色卡里的真实头像一致，不会出现"预览裂图 / 入库后正常"
    // 的诡异断层。
    return (
      <img
        src={resolveAppMediaUrl(trimmed) || trimmed}
        alt=""
        className="h-12 w-12 shrink-0 rounded-2xl object-cover"
        onError={() => setImgFailed(true)}
      />
    );
  }
  const display = trimmed.length > 0 ? trimmed.slice(0, 2) : name.slice(0, 1);
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[rgba(139,92,246,0.12)] text-lg text-[#7c3aed]">
      {display || "🪞"}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
