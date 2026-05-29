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
import { invalidateFriendDisplayQueries } from "../features/contacts/invalidate-friend-display";
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
  // 新走查 R1：confirmImport 同帧双击守卫。原本只有 `if (submitting) return;`
  // —— submitting 是 React state，同帧 <16ms 第二次 click 时闭包里读到的 submitting
  // 仍是 false（state 还没 propagate）；两次都过门后会发 2 个 importPersonalCharacter
  // POST，server 按 name upsert 是幂等的但仍浪费 RTT；更关键的是 onSuccess 会
  // setQueryData / invalidateQueries 多跑一遍 + 第二次 res 覆盖第一次 res 让
  // friendshipStatus / overwrote 标志可能错位（race 决定）。Sync ref 兜 react
  // state 的 propagation gap，跟 account-security-panel.tsx changeInFlightRef 同款。
  const importInFlightRef = useRef(false);

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
      // R3 走查：file.text() 不剥 UTF-8 BOM (﻿)。Windows Notepad / 部分
      // 旧编辑器 save UTF-8 文件时默认会写 BOM，JSON.parse 规范不允许 BOM 起头
      // 直接抛 "Unexpected token ﻿ in JSON at position 0"。bundle 内容
      // 本身完全合法、用户也找不到原因。先剥首字符 BOM 再 parse；中间字符的
      // BOM 已经被 name 的 NAME_CONTROL_CHAR_RE 兜住。
      const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
      payload = JSON.parse(normalized);
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
    // 极快双击「导入」按钮可能在 React 重渲染前两次都触发；submitting state
    // 守卫存在 React state propagation gap（同帧 click 闭包读到的还是 false），
    // 真正同步的守卫是 ref。新走查 R1：补 importInFlightRef，原 submitting
    // 守卫保留作 fail-fast 双层兜底（slow-network 下 disabled 也会兜住）。
    if (importInFlightRef.current) return;
    if (submitting) return;
    importInFlightRef.current = true;
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
      //
      // R10 走查（2026-05-23 第 5 次会话）：之前补的 6 条 invalidate 只覆盖了
      // friends / characters / character-id / conversations / conversation-messages /
      // channels-forward-friends。重导入同名角色（avatar/bio 全换）时，下列三组
      // 仍会让用户在 staleTime 内看到旧值：
      //   - 朋友圈 / 个人 moments / 单角色 moments（app-moments / app-moments-paged /
      //     app-moments-character）：后端 momentsService 实时按 character.avatar 填
      //     authorAvatar，cache 内是旧 snapshot
      //   - 广场动态（app-feed / app-feed-paged / app-feed-post）：同理
      //   - 群面板成员列表 / 群详情（app-group-members / app-group / app-contact-groups）：
      //     角色已是群成员时，群面板拉的成员列表里 memberAvatar 是按 character.avatar
      //     回填的（group.service.ts:442），cache 旧时显示旧头像
      // invalidateFriendDisplayQueries 已经把前两组共享 helper（remark/tags 更新走的
      // 同一组 9 条 key）；这里复用 + 补 group 三条 + import 自身的 3 条（character/
      // characters/forward）。
      void invalidateFriendDisplayQueries(queryClient, baseUrl);
      void queryClient.invalidateQueries({
        queryKey: ["app-characters", baseUrl],
      });
      // 第四波 R1：channels-forward-picker（朋友圈 → 转发到聊天）走的是
      // 独立 query key ["channels-forward-friends", baseUrl] + staleTime 30s
      // （components/channels-forward-picker.tsx:71），目的是「弹窗才拉」
      // 不被无关页面重渲触发。代价是任何朋友列表的 mutation 都没把它一起
      // invalidate：grep 过整个 apps/app/src，全站只有它自己在用这个 key。
      // 用户刚 import 完一个角色，30s 内打开 forward picker 看到的还是
      // 缓存里的旧列表，新角色凭空消失，要等 staleTime 过去或退出 picker
      // 重开才会出现。这里跟着 app-friends 一起 invalidate，picker 下一次
      // 打开就拉到新角色。
      void queryClient.invalidateQueries({
        queryKey: ["channels-forward-friends", baseUrl],
      });
      // 第四波 R2：overwrote=true 路径下后端按 name 复用旧 character id，
      // avatar/bio/personality/recipe/profile 全换。但 character-detail-page
      // 的 query ["app-character", baseUrl, characterId] staleTime=15s，
      // 用户如果刚刚在角色详情页看过这位、退出来重新 import 一份新 bundle，
      // 再回到详情页（15s 内）展示的还是 import 前的 avatar/bio——肉眼以为
      // import 没生效。带着 res.character.id 精准 invalidate 这一条；新建
      // 路径下这条 key 本来就没缓存，invalidate 也是 no-op 不会产生多余
      // refetch。
      void queryClient.invalidateQueries({
        queryKey: ["app-character", baseUrl, res.character.id],
      });
      // R10 走查补：群面板的 3 条。新建路径下角色不在任何群，invalidate 是 no-op；
      // 重导入路径下若用户把同名角色加进过群聊，群面板下次打开就拉到新 avatar/name
      // 而不是 staleTime 内的旧值。
      void queryClient.invalidateQueries({
        queryKey: ["app-group", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-group-members", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-contact-groups", baseUrl],
      });
    } catch (err) {
      setResult({
        kind: "danger",
        message: describeRequestError(err, t(msg`导入失败，请稍后再试`)),
      });
    } finally {
      setSubmitting(false);
      importInFlightRef.current = false;
    }
  }

  return (
    <AppPage
      className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0"
      // 第三波 R1：preview / success 卡显示时 drop zone 是 unmounted 的，桌面
      // 用户（直接访问 /profile/character-import 走移动布局）顺手在页面的其它
      // 区域（步骤说明 ol、success 卡、底部 padding 等）松开拖入的文件，浏览器
      // default = 跳转打开那个 file:// URL —— preview / 进行中的 import / 整页
      // state 全丢。AppPage 自己只是裸 div 没装全局 drag preventDefault，整个 app
      // 也没在 root 装；那就在这一页装：dragOver/drop 一律 preventDefault，
      // 把"丢错位置"变成静默 no-op。dropzone 内部 onDragOver/onDrop 仍然第一
      // 个 fire（捕获到子元素就先跑），冒泡到 AppPage 时 preventDefault 已经
      // 是 no-op，正常 readFile 不受影响。
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
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
        <ol className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] p-4 text-[length:var(--text-caption)] leading-relaxed text-[color:var(--text-secondary)]">
          <li className="flex gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[length:var(--text-eyebrow)] font-semibold text-[color:var(--brand-primary)]">
              1
            </span>
            <span>
              {t(
                msg`在「世界角色管理平台 → 我的私有角色」编辑或新建角色，点「📤 导出 JSON」下载文件`,
              )}
            </span>
          </li>
          <li className="mt-2 flex gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[length:var(--text-eyebrow)] font-semibold text-[color:var(--brand-primary)]">
              2
            </span>
            <span>
              {t(msg`回到这里，拖入或选择刚才下载的 .character.json 文件`)}
            </span>
          </li>
          <li className="mt-2 flex gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[length:var(--text-eyebrow)] font-semibold text-[color:var(--brand-primary)]">
              3
            </span>
            <span>
              {t(
                msg`确认无误后点「导入到我的世界」。同名会覆盖（保留原 id 和好友关系），不同名则新建并加为好友。`,
              )}
            </span>
          </li>
        </ol>

        {/* 文件投放区 / 预览区。
            新一轮 R1：原条件只看 !preview，但 confirmImport 成功末尾会
            setPreview(null) 让 preview 清空，于是导入成功后页面同时渲染
            「空的 drop zone」+「success 卡」。移动端 375 宽视口里这是
            ~490px 的纵向堆叠，视觉上空 drop zone 顶在 success 卡上面像是
            「咦，让我再放点东西？」——成功反馈和"再导入"动作打架。
            同时让 SuccessCard 的「再导入一个」沦为"关掉成功提示"按钮，没真实
            语义。改成 success 状态时隐藏 drop zone：只展示 success 卡，
            用户点「再导入一个」（clearSelection 把 result=null）后 drop zone
            自然回来 —— 该按钮终于有真正的 next-step 意义。 */}
        {!preview && result?.kind !== "success" && (
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
                ? "border-[color:var(--brand-primary)] bg-[color-mix(in_srgb,var(--brand-primary)_6%,transparent)]"
                : "border-[color:var(--border-default)] bg-[color:var(--bg-canvas-elevated)]",
            )}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]">
              <FileUp size={24} />
            </div>
            <div className="space-y-1">
              <div className="text-[length:var(--text-body)] font-medium text-[color:var(--text-primary)]">
                {dragging
                  ? t(msg`松手即可读取`)
                  : t(msg`拖入文件，或点下面按钮选择`)}
              </div>
              <div className="text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
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
          // 走查 R3（移动端我-tab 端到端 2026-05-22）：之前 danger 卡缺 role —— 用户
          // 拖入非法 JSON / 缺 name / 超大文件等 readFile 抛错时，盲用户没法听到
          // 失败原因，只能反复试。role="alert"（隐含 aria-live=assertive）让屏幕
          // 阅读器立即朗读 result.message。和 profile-info-* / account-security
          // / favorites 等其它兄弟页 a11y 一致。
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl bg-[color:var(--state-danger-bg)] px-4 py-3 text-[length:var(--text-caption)] text-[color:var(--state-danger-text)]"
          >
            <X size={16} className="mt-0.5 shrink-0" />
            <div>{result.message}</div>
          </div>
        )}
        {result?.kind === "warning" && (
          // 走查 R3：warning 卡（如"拖入多文件只取第一个"提示）也补 role="status"
          // —— 不像 danger 那么紧急（preview 已就位用户可以继续），polite 待空隙
          // 朗读不打断主操作流。
          <div
            role="status"
            className="flex items-start gap-3 rounded-2xl bg-[color:var(--brand-primary)]/10 px-4 py-3 text-[length:var(--text-caption)] text-[color:var(--brand-primary)]"
          >
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
      <div className="flex items-center gap-2 text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
        <FileJson size={14} />
        <span className="truncate">{preview.fileName}</span>
        <span className="opacity-50">·</span>
        <span>{formatFileSize(preview.fileSize)}</span>
      </div>

      <div className="flex items-start gap-3">
        <PreviewAvatar avatar={avatar} name={name} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="truncate text-[length:var(--text-title)] font-semibold text-[color:var(--text-primary)]">
            {name}
          </div>
          <div className="truncate text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
            {relationship || relationshipType}
          </div>
          {bio && (
            <p className="line-clamp-3 text-[length:var(--text-caption)] leading-relaxed text-[color:var(--text-secondary)]">
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
            "rounded-lg px-3 py-2 text-[length:var(--text-eyebrow)] leading-relaxed",
            schemaMismatch
              ? "bg-[color:var(--state-danger-bg)] text-[color:var(--state-danger-text)]"
              : "bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]",
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
          ? "border-[color:var(--state-warning-bg)]/30 bg-[color:var(--brand-primary)]/8"
          : "border-[color:var(--state-success-bg)]/30 bg-[color:var(--state-success-bg)]",
      )}
    >
      <div
        className={cn(
          "flex items-start gap-2 text-[length:var(--text-caption)] font-medium",
          isBlocked ? "text-[color:var(--brand-primary)]" : "text-[color:var(--state-success-text)]",
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
          "text-[length:var(--text-eyebrow)]",
          isBlocked ? "text-[color:var(--brand-primary)]/80" : "text-[#047857]/80",
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
  // 走查 R4：原 isUrl 只判 "http(s)://" 或 "/" 前缀；但 "//cdn.example.com/x.png"
  // 这种 scheme-relative URL 也 startsWith("/")，会被当 displayable URL 渲染成
  // <img src="//evil.com/track.gif">。浏览器按 page protocol（https）解析，
  // preview 静默触发跨域请求 → 用户 IP / Referer 漏给第三方 tracker，相当于
  // 在加载预览阶段就被打点。后端 isSafeAvatarValueBackend 已经走
  // SCHEME_RELATIVE_AVATAR_RE = /^[/\\][/\\]/ 拒掉这一类（导入时 400），但
  // preview 在用户点导入之前就 render，进 <img> 就已经把请求发出去了。
  // 收紧：只接受 "/foo" 但不接受 "//foo"（也不接受 "\\foo"）。不在白名单内的
  // 一律走 emoji/文字 fallback，不发请求。
  const isUrl =
    /^https?:\/\//i.test(trimmed) ||
    (trimmed.startsWith("/") && !/^[/\\][/\\]/.test(trimmed));
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
  // 走查 R3：trimmed/name 都可能以 emoji 起头（wiki 私有角色 avatar 常用 emoji
  // 单字 + 名字也可能取 "🤖小助手" 这种 emoji 前缀）。slice(0,1) / slice(0,2)
  // 走 UTF-16 code unit，会把 surrogate pair 砍半留 lone surrogate → 渲染成
  // 方块替换字符。改成走 iterator（Array.from），按 code point 切片。
  // - avatar 有值：取首 2 个 code point（兼容 "AB" 两字、单 emoji 都展示
  //   全字）；
  // - avatar 空：从 name 取首 1 个 code point；
  // - 实在啥都没有：留给下面 || "🪞" 兜底。
  const display =
    trimmed.length > 0
      ? Array.from(trimmed).slice(0, 2).join("")
      : Array.from(name)[0] ?? "";
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[color:var(--brand-soft)] text-lg text-[color:var(--brand-primary)]">
      {display || "🪞"}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
