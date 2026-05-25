import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  AppSection,
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  StatusPill,
  TagBadge,
  TextAreaField,
  TextField,
  useTablistKeyboard,
} from "@yinjie/ui";
import { hasRole, roleLabel } from "../lib/auth-store";
import { relationshipTypeLabel } from "../lib/character-labels";
import { useAuth } from "../lib/use-auth";
import {
  wikiApi,
  type WikiPageView,
  type WikiRevisionSummary,
} from "../lib/wiki-api";

// 简化：wiki 包没有 lucide-react 依赖，inline SVG 一个 speaker 即可。
function SpeakerIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}
import { SnapshotDiff } from "../components/snapshot-diff";
import { TalkPanel } from "../components/talk-panel";
import { WatchToggle } from "../components/watch-toggle";
import { ReportButton } from "../components/report-button";
import { FormRow } from "../components/form-row";
import { formatDateTime } from "../lib/format";
import { useUsernameMap } from "../lib/use-username-map";
import {
  revisionChangedFieldsLabel,
  revisionChangeSourceLabel,
  revisionEditSummaryLabel,
  revisionKindLabel,
  revisionOperationLabel,
  revisionStatusLabel,
} from "../lib/revision-labels";

type Tab = "read" | "edit" | "history" | "talk";

export function CharacterPage() {
  const t = translateRuntimeMessage;
  const { characterId } = useParams({ from: "/character/$characterId" });
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("read");
  const [viewMode, setViewMode] = useState<"stable" | "current">("stable");
  const [lifecycleReason, setLifecycleReason] = useState("");
  const [showLifecycleForm, setShowLifecycleForm] = useState(false);
  const pageQ = useQuery({
    queryKey: ["wiki", "page", characterId, viewMode],
    queryFn: () => wikiApi.getPage(characterId, viewMode),
  });
  // TanStack Router 同 path 不同 :characterId 不重新挂载组件，state 会沿用上一
  // 角色的 tab / viewMode / lifecycle 表单态。直接 pushState（或回退/前进栈穿
  // 越）从 /character/A（讨论 tab + 打开了删除理由）跳到 /character/B 时，B
  // 会被迫停在"讨论 + 红色删除卡"上，跟用户预期"打开 B 看简介"不一致。
  // 监听 characterId 变化重置回 read + stable + 关掉 lifecycle 表单。
  useEffect(() => {
    setTab("read");
    setViewMode("stable");
    setShowLifecycleForm(false);
    setLifecycleReason("");
  }, [characterId]);
  const viewerCanSeeCurrent = pageQ.data?.viewerCanSeeCurrent ?? false;
  useEffect(() => {
    if (!viewerCanSeeCurrent && viewMode === "current") setViewMode("stable");
  }, [viewerCanSeeCurrent, viewMode]);
  const softDeleteMut = useMutation({
    mutationFn: (reason: string) =>
      pageQ.data?.page.isDeleted ||
      pageQ.data?.page.lifecycleStatus === "deleted"
        ? wikiApi.requestRestorePage(characterId, reason)
        : wikiApi.requestDeletePage(characterId, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["wiki", "page", characterId] });
      void qc.invalidateQueries({ queryKey: ["wiki", "characters"] });
      void qc.invalidateQueries({ queryKey: ["wiki", "pending-reviews"] });
      setLifecycleReason("");
      setShowLifecycleForm(false);
    },
  });
  const lifecycleStatus = pageQ.data?.page.lifecycleStatus ?? "active";
  const isDeleted =
    pageQ.data?.page.isDeleted === true || lifecycleStatus === "deleted";
  const isPendingCreate = lifecycleStatus === "pending_create";

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* sr-only h1：原本 h1 只存在于 ReadView 内部的 Card 里，切到"编辑/
          历史/讨论"任一 tab 时 ReadView unmount，整个 character-page 就没
          h1 了。盲用 SR 用户按"H 跳到下一个标题"会跳出页面，体感是"换 tab
          页面没有标题了"。挂一个永久存在的 sr-only h1 把角色名/兜底
          characterId 念出来，4 个 tab 切换时 SR 跳标题不再丢失定位。读 tab
          的可视化 h1 demote 成 h2，保证全局只剩这一颗 h1。 */}
      <h1 className="sr-only">
        {pageQ.data?.content?.name ?? characterId}
      </h1>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        {/* 阅读/编辑/历史/讨论是同 URL 下互斥切换视图的 tab —— 不是 nav 链接，所
            以 TabButton 原本的 aria-current="page" 是错的（page 这个值只用于
            "当前页"导航链接，比如侧栏菜单 / 面包屑）；点了"编辑"屏读会念
            "current page 编辑"误导用户以为离开了角色页。和版本切换条统一改成
            role=tablist + role=tab + aria-selected。 */}
        <MainTabList
          tab={tab}
          setTab={setTab}
          isPendingCreate={isPendingCreate}
          label={t(msg`角色页板块切换`)}
        />
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <WatchToggle characterId={characterId} />
          {user && (
            <ReportButton targetType="wiki_page" targetId={characterId} />
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {pageQ.data && (
          <ProtectionInfo level={pageQ.data.page.protectionLevel} />
        )}
        {isDeleted && (
          <StatusPill>
            <Trans>已删除</Trans>
          </StatusPill>
        )}
        {isPendingCreate && (
          <StatusPill>
            <Trans>待创建</Trans>
          </StatusPill>
        )}
        {pageQ.data?.pendingRevision && (
          <StatusPill>
            <Trans>有待审版本</Trans>
          </StatusPill>
        )}
        {viewerCanSeeCurrent &&
          pageQ.data?.latestRevision?.id !==
            pageQ.data?.stableRevision?.id && (
            <ViewModeTabList
              viewMode={viewMode}
              setViewMode={setViewMode}
              label={t(msg`版本切换`)}
            />
          )}
        {/* pending_create 状态下底层 character 行还没建，submitEdit / soft-delete
            都会拿 "角色不存在" 直接 400。隐藏申请删除/恢复按钮，避免点了走死路；
            用户想撤回 pending_create 让 patroller 在评审队列拒绝即可。 */}
        {user && pageQ.data && !isPendingCreate && (
          <Button
            size="sm"
            variant={isDeleted ? "primary" : "danger"}
            className="w-full sm:ml-auto sm:w-auto"
            disabled={softDeleteMut.isPending}
            onClick={() => setShowLifecycleForm((value) => !value)}
          >
            {isDeleted ? t(msg`申请恢复`) : t(msg`申请删除`)}
          </Button>
        )}
      </div>

      {showLifecycleForm && (
        <Card className="p-4 space-y-3">
          <label className="block">
            <span className="text-sm mb-1 block">
              {isDeleted ? t(msg`恢复理由`) : t(msg`删除理由`)}
            </span>
            <TextAreaField
              rows={3}
              value={lifecycleReason}
              onChange={(event) => setLifecycleReason(event.target.value)}
              placeholder={
                isDeleted
                  ? t(msg`说明为什么这个角色词条应恢复`)
                  : t(msg`说明为什么这个角色词条应归档为红链`)
              }
            />
          </label>
          {softDeleteMut.isError && (
            <ErrorBlock role="alert" message={(softDeleteMut.error as Error).message} />
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={isDeleted ? "primary" : "danger"}
              disabled={
                softDeleteMut.isPending || lifecycleReason.trim().length === 0
              }
              onClick={() => softDeleteMut.mutate(lifecycleReason.trim())}
            >
              {softDeleteMut.isPending
                ? t(msg`提交中...`)
                : isDeleted
                  ? t(msg`提交恢复申请`)
                  : t(msg`提交删除申请`)}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowLifecycleForm(false)}
            >
              <Trans>取消</Trans>
            </Button>
          </div>
        </Card>
      )}

      {isDeleted && (
        <InlineNotice tone="danger">
          <strong>
            <Trans>此词条已被软删除（红链）。</Trans>
          </strong>
          <Trans>
            恢复也按编辑审核流提交，底层角色数据保留以保持运行时引用一致。
          </Trans>
        </InlineNotice>
      )}

      {isPendingCreate && (
        <InlineNotice tone="warning">
          <Trans>
            此角色仍在待创建队列中。巡查员通过创建版本后，才会写入运行时角色注册表。
          </Trans>
        </InlineNotice>
      )}

      {pageQ.data?.drift?.hasDrift && hasRole(user, "patroller") && (
        <DriftBanner
          characterId={characterId}
          drift={pageQ.data.drift}
          onSynced={() =>
            qc.invalidateQueries({ queryKey: ["wiki", "page", characterId] })
          }
        />
      )}

      {pageQ.isLoading && <LoadingBlock />}
      {pageQ.isError && <ErrorBlock role="alert" message={(pageQ.error as Error).message} />}
      {pageQ.data && tab === "read" && <ReadView view={pageQ.data} />}
      {pageQ.data && tab === "edit" && (
        <EditView characterId={characterId} view={pageQ.data} />
      )}
      {pageQ.data && tab === "history" && (
        <HistoryView
          characterId={characterId}
          currentRevisionId={pageQ.data.page.currentRevisionId}
          onChanged={() => void pageQ.refetch()}
        />
      )}
      {tab === "talk" && <TalkPanel characterId={characterId} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      // roving tabindex：只有当前 tab 可 Tab 进入，其它用方向键导航。
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`inline-flex min-h-[36px] min-w-[68px] items-center justify-center rounded-full px-4 py-1.5 text-sm transition-colors ${
        active
          ? "bg-[image:var(--brand-gradient)] text-[color:var(--text-on-brand)] shadow-[var(--shadow-soft)]"
          : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-card-hover)] hover:text-[color:var(--text-primary)]"
      }`}
    >
      {children}
    </button>
  );
}

function ViewModeTabList({
  viewMode,
  setViewMode,
  label,
}: {
  viewMode: "stable" | "current";
  setViewMode: (v: "stable" | "current") => void;
  label: string;
}) {
  const modes = useMemo<Array<"stable" | "current">>(
    () => ["stable", "current"],
    [],
  );
  const onKeyDown = useTablistKeyboard({
    count: modes.length,
    onActivate: (i) => {
      const next = modes[i];
      if (next) setViewMode(next);
    },
  });
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="inline-flex w-full shrink-0 overflow-hidden rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-xs shadow-[var(--shadow-soft)] sm:ml-auto sm:w-auto"
    >
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "stable"}
        tabIndex={viewMode === "stable" ? 0 : -1}
        className={`flex-1 px-3 py-2 sm:flex-none ${
          viewMode === "stable"
            ? "bg-[image:var(--brand-gradient)] text-[color:var(--text-on-brand)]"
            : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
        }`}
        onClick={() => setViewMode("stable")}
      >
        <Trans>稳定版</Trans>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "current"}
        tabIndex={viewMode === "current" ? 0 : -1}
        className={`flex-1 px-3 py-2 sm:flex-none ${
          viewMode === "current"
            ? "bg-[image:var(--brand-gradient)] text-[color:var(--text-on-brand)]"
            : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
        }`}
        onClick={() => setViewMode("current")}
      >
        <Trans>最新版</Trans>
      </button>
    </div>
  );
}

function MainTabList({
  tab,
  setTab,
  isPendingCreate,
  label,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  isPendingCreate: boolean;
  label: string;
}) {
  const visibleTabs = useMemo<Tab[]>(() => {
    const result: Tab[] = ["read"];
    if (!isPendingCreate) result.push("edit");
    result.push("history");
    result.push("talk");
    return result;
  }, [isPendingCreate]);
  const onKeyDown = useTablistKeyboard({
    count: visibleTabs.length,
    onActivate: (i) => {
      const next = visibleTabs[i];
      if (next) setTab(next);
    },
  });
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="wiki-touch-scroll -mx-1 inline-flex overflow-x-auto rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-1 shadow-[var(--shadow-soft)] sm:mx-0 sm:overflow-visible"
    >
      <TabButton active={tab === "read"} onClick={() => setTab("read")}>
        <Trans>阅读</Trans>
      </TabButton>
      {!isPendingCreate && (
        <TabButton active={tab === "edit"} onClick={() => setTab("edit")}>
          <Trans>编辑</Trans>
        </TabButton>
      )}
      <TabButton active={tab === "history"} onClick={() => setTab("history")}>
        <Trans>历史</Trans>
      </TabButton>
      <TabButton active={tab === "talk"} onClick={() => setTab("talk")}>
        <Trans>讨论</Trans>
      </TabButton>
    </div>
  );
}

function ProtectionInfo({ level }: { level: string }) {
  const t = translateRuntimeMessage;
  if (level === "none") return null;
  return (
    <StatusPill>
      {level === "semi" ? t(msg`半保护`) : t(msg`完全保护`)}
    </StatusPill>
  );
}

function ReadView({ view }: { view: WikiPageView }) {
  const t = translateRuntimeMessage;
  const c = view.content;
  const recipe = view.recipe;
  const { resolve: resolveUsername } = useUsernameMap([
    view.currentRevision?.editorUserId,
  ]);
  // 朗读全文（MiniMax TTS HD）：把 bio + personality + coreLogic 拼起来送 /ai/speech。
  // 同一文本的多次点击不重复合成——按 audioUrl 缓存到组件 state。
  const [narrationUrl, setNarrationUrl] = useState<string | null>(null);
  const [narrationLoading, setNarrationLoading] = useState(false);
  const [narrationError, setNarrationError] = useState<string | null>(null);
  // 走查 yuanzui0728 R1：narrationLoading 是 React state，setState 要下一次 commit
  // 才生效，同帧 / 异步 race 双击仍可能两次 await synthesizePageNarration → 烧两份
  // 11000/天 TTS HD 配额（端点没缓存，每次都真合成）。和 wechat-moment-card 同款
  // narrationInflightRef 同步守卫，跳过 React commit 时机风险。
  const narrationInflightRef = useRef(false);
  const narrationAudioRef = useRef<HTMLAudioElement | null>(null);
  const narrationText = useMemo(() => {
    const parts: string[] = [];
    const append = (label: string, value: string | undefined | null) => {
      const trimmed = value?.trim();
      if (trimmed) parts.push(`${label}：${trimmed}`);
    };
    append(t(msg`简介`), c.bio);
    if (c.personality) append(t(msg`性格`), c.personality);
    if (recipe?.prompting.coreLogic) {
      append(t(msg`核心逻辑`), recipe.prompting.coreLogic);
    }
    return parts.join("\n\n").slice(0, 4000);
  }, [c.bio, c.personality, recipe?.prompting.coreLogic, t]);
  // 走查 yuanzui0728 R1：切换到不同角色页（同组件、不同 view.characterId）时，
  // 旧角色的 narrationUrl 还挂着，新角色 listen 按钮一点会触发再合成；同时旧
  // <audio autoPlay> 还可能在后台播。重置 narrationUrl + 释放 audio buffer，
  // 与 wechat-moment-card.tsx 切账户路径同款。
  //
  // 走查 yuanzui0728 本次 R2：原版只 pause 没释放 buffer——注释说"释放"
  // 但代码只 pause。SPA 路由切换 /character/A → /character/B 时 ReadView
  // 复用、view.characterId 变，旧 audio 的 src 还挂着 decoded PCM 一直挂
  // 到 ReadView 整个 unmount（用户跳出 /character/* 路由才会）。每个 TTS
  // ~50-300KB，连续浏览 10-30 个角色 ≈ 数 MB 常驻。和 wechat-moment-card
  // 同款 removeAttribute(src) + load() 显式 release。
  useEffect(() => {
    const audio = narrationAudioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setNarrationUrl(null);
    setNarrationError(null);
    setNarrationLoading(false);
    narrationInflightRef.current = false;
  }, [view.characterId]);
  // 组件卸载时显式释放 audio buffer（Chromium / iOS Safari 后台仍会占内存）
  useEffect(() => {
    return () => {
      const audio = narrationAudioRef.current;
      if (!audio) return;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, []);
  const handleListen = async () => {
    // 同帧双击守卫：narrationLoading 是 React state，下次 commit 才翻 true；
    // 同帧 / 微秒级第二次点击 ref 已 true，绕过烧两份 quota 的双调用。
    if (narrationInflightRef.current) return;
    if (narrationLoading || !narrationText) return;
    // 已合成过：toggle play/pause，绝不再次合成（端点 /ai/speech 无缓存，每
    // 次点都是真烧一份 11000/天 配额；和 wechat-moment-card 同款 toggle）。
    const existing = narrationAudioRef.current;
    if (narrationUrl && existing) {
      if (existing.paused) {
        existing.play().catch(() => {
          // iOS autoplay 限制偶发 reject，保留 native controls 让用户再点 play
        });
      } else {
        existing.pause();
      }
      return;
    }
    narrationInflightRef.current = true;
    setNarrationLoading(true);
    setNarrationError(null);
    try {
      const result = await wikiApi.synthesizePageNarration({
        text: narrationText,
        characterId: view.characterId,
      });
      setNarrationUrl(result.audioUrl);
    } catch (err) {
      setNarrationError(
        err instanceof Error ? err.message : t(msg`朗读生成失败`),
      );
    } finally {
      narrationInflightRef.current = false;
      setNarrationLoading(false);
    }
  };
  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <header className="flex items-start gap-3 sm:gap-4">
        <ReadViewAvatar name={c.name} src={c.avatar} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            {/* 原本是 h1，但 character-page 外层已经挂了一个 sr-only h1 给所有
                4 个 tab 共享，避免 h1 在 tab 切换时消失。这里降级到 h2 维持视
                觉但避免页面双 h1 违反 WCAG 单 h1 原则。 */}
            <h2 className="text-xl font-semibold leading-tight sm:text-2xl">
              {c.name}
            </h2>
            {narrationText ? (
              <button
                type="button"
                onClick={handleListen}
                disabled={narrationLoading}
                aria-label={t(msg`朗读全文`)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border-subtle)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"
                title={
                  narrationError ??
                  (narrationLoading ? t(msg`正在合成…`) : t(msg`朗读全文`))
                }
              >
                <SpeakerIcon size={14} />
                <span>
                  {narrationLoading ? t(msg`生成中`) : t(msg`朗读全文`)}
                </span>
              </button>
            ) : null}
          </div>
          {narrationUrl ? (
            <audio
              ref={narrationAudioRef}
              src={narrationUrl}
              controls
              autoPlay
              preload="auto"
              className="mt-2 w-full"
            />
          ) : null}
          {/* 朗读合成失败（如 TTS provider 503 额度不足）原本只把 narrationError
              塞进按钮 title — 鼠标不悬停 / 屏读用户完全无感，点了"朗读全文"后只见
              按钮闪一下回弹、没有音频也没有任何可见反馈，体感是"点了没反应"。
              补一行可见的 role=alert 文案（与 DriftBanner / ErrorBlock 同款语义），
              让失败原因被念出来也被看到；title 保留给悬停兜底。 */}
          {narrationError && !narrationUrl ? (
            <p
              role="alert"
              className="mt-2 text-xs text-[color:var(--state-danger-text)]"
            >
              {narrationError}
            </p>
          ) : null}
          {(() => {
            // 历史/导入角色 relationship 或 relationshipType 任一为空时，原本固定
            // 渲染 "X · Y"，会出现 " · friend" 或 "朋友 · " 这种孤立分隔符。
            // home-page 卡片同位置已经走条件拼接，详情页对齐避免割裂感。
            // relationshipType 预设是英文哨兵（friend/expert/mentor/family/self），
            // 必须经 relationshipTypeLabel 本地化才不会在详情页露出英文；"custom"
            // 哨兵和纯标点脏数据（如 "。"）映射成空只展示 relationship 文本。
            // 此前只对齐了孤立分隔符却漏了本地化 → 详情页 81 个角色里 78 个露出
            // "测试伙伴 · expert" 这种英文，与列表/搜索（已本地化）不一致。
            const relType = relationshipTypeLabel(c.relationshipType);
            const rel =
              c.relationship && relType
                ? `${c.relationship} · ${relType}`
                : c.relationship || relType || "";
            if (!rel) return null;
            return (
              <div className="mt-1 text-sm text-[var(--text-muted)]">
                {rel}
              </div>
            );
          })()}
          {c.region && c.region.trim() ? (
            <div className="mt-1 text-sm text-[var(--text-muted)]">
              <Trans>地区</Trans>
              {": "}
              {c.region.trim()}
            </div>
          ) : null}
        </div>
      </header>
      <Section label={t(msg`简介`)}>{c.bio || "—"}</Section>
      {c.personality && (
        <Section label={t(msg`性格`)}>{c.personality}</Section>
      )}
      {c.expertDomains.length > 0 && (
        <Section label={t(msg`专长领域`)}>
          <div className="flex flex-wrap gap-2">
            {c.expertDomains.map((d) => (
              <TagBadge key={d}>{d}</TagBadge>
            ))}
          </div>
        </Section>
      )}
      {c.triggerScenes && c.triggerScenes.length > 0 && (
        <Section label={t(msg`触发场景`)}>
          <div className="flex flex-wrap gap-2">
            {c.triggerScenes.map((s) => (
              <TagBadge key={s}>{s}</TagBadge>
            ))}
          </div>
        </Section>
      )}
      {recipe && (
        <>
          {/* 底层逻辑：对齐编辑页「底层逻辑」section（核心逻辑 + 遗忘曲线） */}
          <Section label={t(msg`核心逻辑`)}>
            {recipe.prompting.coreLogic || "—"}
          </Section>
          <Section label={t(msg`遗忘曲线（0-100，默认 70）`)}>
            {recipe.memorySeed?.forgettingCurve ?? "—"}
          </Section>
          {/* 场景提示词：对齐编辑页「聊天回复」+「场景提示词」section 的全部 8 项 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section label={t(msg`聊天场景提示词`)}>
              {recipe.prompting.scenePrompts.chat || "—"}
            </Section>
            <Section label={t(msg`发朋友圈`)}>
              {recipe.prompting.scenePrompts.moments_post || "—"}
            </Section>
            <Section label={t(msg`朋友圈评论 / 回复`)}>
              {recipe.prompting.scenePrompts.moments_comment || "—"}
            </Section>
            <Section label={t(msg`广场发帖`)}>
              {recipe.prompting.scenePrompts.feed_post || "—"}
            </Section>
            <Section label={t(msg`发视频号内容`)}>
              {recipe.prompting.scenePrompts.channel_post || "—"}
            </Section>
            <Section label={t(msg`广场评论`)}>
              {recipe.prompting.scenePrompts.feed_comment || "—"}
            </Section>
            <Section label={t(msg`好友请求 / 摇一摇问候`)}>
              {recipe.prompting.scenePrompts.greeting || "—"}
            </Section>
            <Section label={t(msg`主动提醒`)}>
              {recipe.prompting.scenePrompts.proactive || "—"}
            </Section>
          </div>
          {/* 记忆提示词：对齐编辑页「记忆提示词」section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section label={t(msg`近期记忆提示词`)}>
              {recipe.memorySeed?.recentSummaryPrompt || "—"}
            </Section>
            <Section label={t(msg`长期记忆提示词`)}>
              {recipe.memorySeed?.coreMemoryPrompt || "—"}
            </Section>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Section label={t(msg`发圈频率`)}>
              {recipe.lifeStrategy.momentsFrequency}
            </Section>
            <Section label={t(msg`广场频率`)}>
              {recipe.lifeStrategy.feedFrequency}
            </Section>
            <Section label={t(msg`活跃时段`)}>
              {recipe.lifeStrategy.activeHoursStart ?? "—"}-
              {recipe.lifeStrategy.activeHoursEnd ?? "—"}
            </Section>
          </div>
        </>
      )}
      {view.pendingRevision && (
        <InlineNotice tone="info">
          <Trans>
            有 {view.pendingRevisions.length} 个待审版本，最新为：
          </Trans>
          <strong className="mx-1">v{view.pendingRevision.version}</strong>
          {/* 原写法直接拼 view.pendingRevision.operation/riskLevel 渲染英文枚
              举（"create / high" / "soft_delete / low"），跟邻居 "有 N 个待审
              版本" 中英混排。统一走本地化映射。 */}
          {revisionOperationLabel(view.pendingRevision.operation)} ·{" "}
          {view.pendingRevision.riskLevel === "high"
            ? t(msg`高风险`)
            : t(msg`低风险`)}
        </InlineNotice>
      )}
      <footer className="text-xs text-[var(--text-muted)] pt-3 border-t border-[var(--border-subtle)]">
        {view.viewMode === "current" ? t(msg`最新版`) : t(msg`稳定版`)}：
        {view.currentRevision
          ? t(
              msg`v${view.currentRevision.version} · 由 ${resolveUsername(view.currentRevision.editorUserId)} 提交于 ${formatDateTime(view.currentRevision.createdAt)}`,
            )
          : t(msg`尚未有 wiki 版本（显示后台原始数据）`)}
        {view.stableRevision &&
          view.latestRevision &&
          view.stableRevision.id !== view.latestRevision.id &&
          ` · ${t(msg`稳定版 v${view.stableRevision.version} / 最新版 v${view.latestRevision.version}`)}`}
      </footer>
    </Card>
  );
}

// 角色 avatar 可能是 URL、`/api/...` 资源路径，或单 emoji（隐界 APP 里 142
// 角色 ~80 是 emoji）。`<img src="🧰">` 必然 404 破图，三段式处理。
function ReadViewAvatar({ name, src }: { name: string; src?: string | null }) {
  const trimmed = (src ?? "").trim();
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    setLoadFailed(false);
  }, [trimmed]);

  const base =
    "h-14 w-14 shrink-0 rounded-2xl bg-[color:var(--surface-soft)] sm:h-16 sm:w-16 md:h-20 md:w-20";

  // 三个分支统一标 decorative：紧挨着的 <h1>{c.name}</h1> 已经是 SR 主要可
  // 访问名；img alt={name} / role="img" aria-label={name} / 渐变首字母方块
  // 都会让 SR 在 h1 之外再读一遍角色名，对 emoji avatar 还会读 "image, 🎓"。
  if (trimmed && !loadFailed) {
    if (isLikelyAvatarImageSource(trimmed)) {
      return (
        <img
          src={trimmed}
          alt=""
          // 详情页只有一张大头像；解码 async 让首屏文字先出来，避免大 SVG
          // decode 阻塞 main thread。
          decoding="async"
          onError={() => setLoadFailed(true)}
          className={`${base} object-cover`}
        />
      );
    }
    if (isEmojiAvatar(trimmed)) {
      return (
        <div
          aria-hidden="true"
          className={`${base} grid place-items-center text-3xl leading-none sm:text-4xl md:text-5xl`}
        >
          {trimmed}
        </div>
      );
    }
  }
  // name?.[0] 取的是 UTF-16 code unit，遇到表情 / 扩展平面汉字会切半个代理对。
  // Array.from 按 code point 切，保证字形完整。
  const initial = name ? Array.from(name)[0] : "?";
  return (
    <div
      aria-hidden="true"
      className={`${base.replace("bg-[color:var(--surface-soft)]", "bg-[image:var(--brand-gradient)]")} grid place-items-center text-2xl font-semibold text-[color:var(--text-on-brand)] md:text-3xl`}
    >
      {initial}
    </div>
  );
}

const AVATAR_EMOJI_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

function isEmojiAvatar(value: string) {
  if (!value || value.length > 12) return false;
  return AVATAR_EMOJI_PICTOGRAPHIC.test(value);
}

function isLikelyAvatarImageSource(value: string) {
  if (!value) return false;
  // 协议相对 URL（"//evil.example/icon.png"）以 `/` 起头会被当成同源绝对路径
  // 误放过；浏览器实际向 evil.example 发请求，等于让任意写入 avatar 的用户
  // 把所有访客 IP / UA 泄给外部域名。
  // 反斜杠在 WHATWG URL parser 里被当成正斜杠 ("/\evil/x" → "//evil/x" →
  // 协议相对 → http://evil/x)，同样的攻击路径要一起堵。HTTP 图片 URL 没有
  // 任何合法使用反斜杠的场景，整串带 `\` 一律拒。
  if (value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("blob:") ||
    /^https?:\/\//i.test(value) ||
    /^data:image\//i.test(value) ||
    /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(value)
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm font-medium text-[var(--text-muted)] mb-1">
        {label}
      </h3>
      <div className="text-sm leading-7">{children}</div>
    </section>
  );
}

/**
 * 编辑入口卡片。tab='edit' 不再内嵌完整表单——表单已搬到独立路由
 * /character/$characterId/edit，由 WorldCharacterEditPage 渲染，和私有角色
 * 编辑器共享同一套 6-section UX。
 */
function EditView({
  characterId,
  view,
}: {
  characterId: string;
  view: WikiPageView;
}) {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  if (!user) {
    return (
      <Card className="p-6 space-y-3">
        <p>
          <Trans>
            请先{" "}
            <Link to="/login" className="font-medium underline">
              登录
            </Link>{" "}
            后再编辑。
          </Trans>
        </p>
      </Card>
    );
  }
  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <p className="text-sm text-[var(--text-muted)]">
        {/* 原写法 <strong>{user.role}</strong> 裸渲染后端英文枚举（admin /
            patroller / autoconfirmed / newcomer），中文 UI 里一句"当前你的权限
            是 patroller。"显得没翻译；和 root-layout UserMenu / 历史卡 /
            recent-changes 等位置统一走 roleLabel 本地化。 */}
        <Trans>
          当前你的权限是 <strong className="mx-1">{roleLabel(user.role)}</strong>。
          编辑器已统一为和私有角色一致的 6-section 体验，独立成一个页面打开。
          内容字段和角色逻辑改动仍走同一套版本、冲突检测、巡查评审。
        </Trans>
      </p>
      {view.pendingRevision && (
        <InlineNotice tone="warning">
          <Trans>
            ⚠ 当前已有待审版本 v{view.pendingRevision.version}
            ，继续提交可能触发编辑冲突。
          </Trans>
        </InlineNotice>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/character/$characterId/edit"
          params={{ characterId }}
          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--brand-primary)] bg-[image:var(--brand-gradient)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-brand)] shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-card)]"
        >
          {t(msg`✨ 打开编辑器`)}
        </Link>
        <span className="text-xs text-[color:var(--text-muted)]">
          <Trans>编辑器同时支持 AI 一键生成 / 跨导航草稿。</Trans>
        </span>
      </div>
    </Card>
  );
}

function HistoryView({
  characterId,
  currentRevisionId,
  onChanged,
}: {
  characterId: string;
  currentRevisionId: string | null;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const historyQ = useQuery({
    queryKey: ["wiki", "history", characterId],
    queryFn: () => wikiApi.getHistory(characterId, 100),
  });

  const revertMut = useMutation({
    mutationFn: (input: { toRevisionId: string; reason: string }) =>
      wikiApi.revert(characterId, input.toRevisionId, input.reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["wiki", "history", characterId] });
      void qc.invalidateQueries({ queryKey: ["wiki", "page", characterId] });
      onChanged();
    },
  });

  const revisions = historyQ.data ?? [];
  const { resolve: resolveUsername } = useUsernameMap(
    revisions.map((r) => r.editorUserId),
  );
  const previousById = useMemo(() => {
    const sorted = [...revisions].sort((a, b) => a.version - b.version);
    const map = new Map<string, WikiRevisionSummary | null>();
    let prev: WikiRevisionSummary | null = null;
    for (const r of sorted) {
      map.set(r.id, prev);
      if (r.status === "approved") prev = r;
    }
    return map;
  }, [revisions]);

  if (historyQ.isLoading) return <LoadingBlock />;
  if (historyQ.isError)
    return <ErrorBlock role="alert" message={(historyQ.error as Error).message} />;

  const canRevert = hasRole(user, "patroller");
  return (
    <div className="space-y-3">
      {revisions.length === 0 && (
        <Card className="p-4">
          <p className="text-sm text-[var(--text-muted)]">
            <Trans>还没有任何编辑记录。</Trans>
          </p>
        </Card>
      )}
      {revisions.map((rev) => (
        <RevisionCard
          key={rev.id}
          rev={rev}
          editorName={resolveUsername(rev.editorUserId)}
          previous={previousById.get(rev.id) ?? null}
          isCurrent={rev.id === currentRevisionId}
          canRevert={canRevert}
          // 用 mutateAsync 把 promise 透传到 RevisionCard：子组件 await 成功
          // 才关闭/清空"回滚原因"表单。原写法 mutate() 即触即清，revertMut
          // 失败（401 / conflict / 同 rev 被他人撤回）时 ErrorBlock 浮出但
          // reason 已被清空 + 折回，巡查员要重新展开 + 重打原因。
          onRevert={(reason) =>
            revertMut.mutateAsync({ toRevisionId: rev.id, reason })
          }
          // 历史 tab 多版本同时存在；revertMut 共享时点其中一条所有"回滚"
          // 按钮一起灰。只灰 variables.toRevisionId 命中的那条。
          reverting={
            revertMut.isPending &&
            revertMut.variables?.toRevisionId === rev.id
          }
        />
      ))}
      {revertMut.isError && (
        <ErrorBlock role="alert" message={(revertMut.error as Error).message} />
      )}
    </div>
  );
}

function RevisionCard({
  rev,
  editorName,
  previous,
  isCurrent,
  canRevert,
  onRevert,
  reverting,
}: {
  rev: WikiRevisionSummary;
  editorName: string;
  previous: WikiRevisionSummary | null;
  isCurrent: boolean;
  canRevert: boolean;
  onRevert: (reason: string) => Promise<unknown>;
  reverting: boolean;
}) {
  const t = translateRuntimeMessage;
  const [showDiff, setShowDiff] = useState(false);
  const [showRevert, setShowRevert] = useState(false);
  const [reason, setReason] = useState("");
  // 历史列表为省负载已 drop 掉 recipeSnapshot（见 wiki-page.service.getHistory）；
  // 点开"查看对比"时才按需拉这一条修订的完整数据拿 recipeSnapshot。
  // enabled 还额外 gate 在 revisionKind !== 'content'：后端只给 recipe/lifecycle
  // 修订存 recipeSnapshot，content 修订（改简介/名等，正常 wiki 最常见的编辑类型）
  // 一律不带（wiki-edit.service 的 content 路径 create 时就不写 recipeSnapshot 列，
  // 全库 91 条 content 修订 0 条有 recipe）。对 content 修订点开 diff 时再发一发
  // getRevision 纯属白打——拉回来 recipeSnapshot 必为 null，还会闪一下"正在加载角色
  // 逻辑快照…"。据此跳过，content 修订展开 diff 零额外请求、无误导 loading 文案。
  // 展开过一次后 react-query 缓存，收起再展开不再重拉。
  const mayHaveRecipe = rev.revisionKind !== "content";
  const revisionDetailQ = useQuery({
    queryKey: ["wiki", "revision", rev.characterId, rev.id],
    queryFn: () => wikiApi.getRevision(rev.characterId, rev.id),
    enabled: showDiff && mayHaveRecipe,
    staleTime: 5 * 60 * 1000,
  });
  // 列表里 recipeSnapshot 已被 drop（undefined）；优先用按需拉到的完整修订。
  // 留 rev.recipeSnapshot 兜底：万一后端将来又把它放回列表也不会丢。
  const recipeSnapshot =
    revisionDetailQ.data?.recipeSnapshot ?? rev.recipeSnapshot ?? null;
  return (
    <Card className="flex items-start gap-3 p-3 text-sm">
      <div className="w-10 shrink-0 pt-0.5 font-mono text-[var(--text-muted)] sm:w-12">
        v{rev.version}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <strong>{editorName}</strong>
          <span className="text-xs text-[var(--text-muted)]">
            {/* 同 pending-reviews / recent-changes：editorRoleAtTime 是英文
                enum，原写法直接渲染让中文用户看到一串 "patroller" / "admin"
                夹在中文历史卡里像漏译。 */}
            {roleLabel(rev.editorRoleAtTime)}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {formatDateTime(rev.createdAt)}
          </span>
          {/* 原写法 4 处 <StatusPill>{rev.<enum>}</StatusPill> 裸渲染英文后端
              字面量；中文 UI 的历史 tab 上排出"approved create recipe edit"
              和邻居 "高风险" "当前版本" "待巡查" 中英混排。统一走
              revisionLabels.ts 的本地化映射。 */}
          <StatusPill>{revisionStatusLabel(rev.status)}</StatusPill>
          <StatusPill>{revisionOperationLabel(rev.operation)}</StatusPill>
          {rev.revisionKind !== "content" && (
            <StatusPill>{revisionKindLabel(rev.revisionKind)}</StatusPill>
          )}
          {rev.riskLevel === "high" && (
            <StatusPill>
              <Trans>高风险</Trans>
            </StatusPill>
          )}
          {rev.changeSource !== "edit" && (
            <StatusPill>
              {revisionChangeSourceLabel(rev.changeSource)}
            </StatusPill>
          )}
          {isCurrent && (
            <StatusPill>
              <Trans>当前版本</Trans>
            </StatusPill>
          )}
          {!rev.isPatrolled && rev.status === "approved" && (
            <span className="text-xs px-2 py-0.5 rounded bg-[rgba(254,243,199,0.6)] text-[#92400e]">
              <Trans>待巡查</Trans>
            </span>
          )}
        </div>
        {/* revert 版本的 editSummary 由后端拼成英文机器串
            `Revert to v{N}: {reason}`，反破坏机器人 reason 形如
            `antivandal_bot:critical_field_cleared` —— 历史 tab 之前裸渲染让 zh-CN
            用户在「回滚」卡正文看到一整串英文前缀 + snake_case 内部码（与
            recent-changes 同源问题，那边已修；这里是 reference_wiki_zwalk_role_fixtures
            标记的遗留）。走 revisionEditSummaryLabel 本地化机器模式；人工自由
            填写的摘要不匹配机器正则 → 原样透传，绝不误伤。 */}
        {revisionEditSummaryLabel(rev.editSummary) && (
          <div className="mt-1 break-words">
            {revisionEditSummaryLabel(rev.editSummary)}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
          {revisionChangedFieldsLabel(rev.diffFromParent?.changed) && (
            <span className="break-words">
              <Trans>
                字段：{revisionChangedFieldsLabel(rev.diffFromParent?.changed)}
              </Trans>
            </span>
          )}
          <button
            type="button"
            className="inline-flex min-h-[32px] items-center rounded-md px-2 py-1 underline hover:text-[var(--text-primary)]"
            onClick={() => setShowDiff((v) => !v)}
          >
            {showDiff ? t(msg`收起对比`) : t(msg`查看对比`)}
          </button>
          {previous && (
            <Link
              to="/character/$characterId/diff"
              params={{ characterId: rev.characterId }}
              search={{ from: previous.id, to: rev.id }}
              className="inline-flex min-h-[32px] items-center rounded-md px-2 py-1 underline hover:text-[var(--text-primary)]"
            >
              <Trans>独立对比</Trans>
            </Link>
          )}
          {/* 生命周期版本（soft_delete / restore，revisionKind==='lifecycle'）
              后端 revert 直接拒 400「生命周期版本请通过删除 / 恢复申请处理，
              不支持直接回滚」。原写法对所有 approved 非当前版本都渲染"回滚到
              此版本"，巡查员在历史里点到一条"删除/恢复"记录的回滚按钮 → 展开
              表单 → 填原因 → 提交才撞 400，是个必然失败的死路操作。和后端
              gate 对齐，对 lifecycle 版本直接不显示回滚入口（删除/恢复请走
              页面顶部的"申请删除 / 申请恢复"）。 */}
          {canRevert &&
            !isCurrent &&
            rev.status === "approved" &&
            rev.revisionKind !== "lifecycle" && (
              <button
                type="button"
                className="inline-flex min-h-[32px] items-center rounded-md px-2 py-1 underline hover:text-[var(--text-primary)]"
                onClick={() => setShowRevert((v) => !v)}
              >
                <Trans>回滚到此版本</Trans>
              </button>
            )}
        </div>
        {showDiff && (
          <div className="mt-3 rounded border border-[var(--border-subtle)] p-3">
            <SnapshotDiff
              before={previous?.contentSnapshot ?? null}
              after={rev.contentSnapshot}
              changedFields={rev.diffFromParent?.changed}
            />
            {/* recipeSnapshot 按需加载：拉取中先提示，拉到非空才渲染快照
                details；该修订本就无角色逻辑快照（多数纯档案/lifecycle 修订）则
                什么都不显示，避免空 details。 */}
            {revisionDetailQ.isLoading && (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                <Trans>正在加载角色逻辑快照…</Trans>
              </p>
            )}
            {revisionDetailQ.isError && (
              <p
                role="alert"
                className="mt-3 text-xs text-[var(--state-danger-text)]"
              >
                {(revisionDetailQ.error as Error).message}
              </p>
            )}
            {recipeSnapshot && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-[var(--text-muted)]">
                  <Trans>查看角色逻辑快照</Trans>
                </summary>
                <pre className="mt-2 p-3 bg-[var(--bg-canvas)] rounded overflow-auto max-h-[40vh] md:max-h-[60vh]">
                  {JSON.stringify(recipeSnapshot, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
        {showRevert && (
          <div className="mt-3 rounded border border-[var(--border-subtle)] p-3 space-y-2">
            <label className="block text-sm">
              <span className="block mb-1">
                <Trans>回滚原因（必填）</Trans>
              </span>
              <TextField
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t(msg`例如：v3 涉及破坏性内容`)}
              />
            </label>
            <div className="flex gap-2">
              <Button
                variant="danger"
                size="sm"
                disabled={reverting || reason.trim().length === 0}
                onClick={async () => {
                  // 等 mutation resolve 才 close+clear；失败时保留 reason 让
                  // 巡查员对照 ErrorBlock 调整原因再重试，不必从 0 重打。
                  try {
                    await onRevert(reason.trim());
                    setShowRevert(false);
                    setReason("");
                  } catch {
                    // 父组件 useMutation 的 isError 已渲染到 ErrorBlock，吞 reject
                    // 避免 unhandled promise rejection。
                  }
                }}
              >
                {reverting ? t(msg`回滚中...`) : t(msg`确认回滚`)}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRevert(false)}
              >
                <Trans>取消</Trans>
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function DriftBanner({
  characterId,
  drift,
  onSynced,
}: {
  characterId: string;
  drift: {
    hasDrift: boolean;
    contentDrift: string[];
    recipeDrift: string[];
    source: string;
  };
  onSynced: () => void;
}) {
  const t = translateRuntimeMessage;
  const syncMut = useMutation({
    mutationFn: () => wikiApi.syncPageFromCharacter(characterId),
    onSuccess: () => onSynced(),
  });
  const totalDrift = drift.contentDrift.length + drift.recipeDrift.length;
  return (
    <Card className="border-[color:var(--state-warning-bg)] bg-[rgba(255,247,205,0.6)] p-4">
      <div className="flex flex-col items-start gap-2 sm:flex-row">
        <div className="flex-1 text-sm">
          <strong>
            <Trans>⚠ 角色已被管理员后台直接修改</Trans>
          </strong>
          <p className="mt-1 text-[var(--text-muted)]">
            <Trans>
              wiki 当前版本与运行时实际角色数据存在 {totalDrift} 处差异
              （source: {drift.source}）。点击右侧按钮可把当前实际值作为新版本写入 wiki 历史。
            </Trans>
          </p>
          {drift.contentDrift.length > 0 && (
            <p className="mt-1 text-xs">
              <Trans>内容字段：</Trans>
              <span className="font-mono">{drift.contentDrift.join(", ")}</span>
            </p>
          )}
          {drift.recipeDrift.length > 0 && (
            <p className="mt-1 text-xs">
              <Trans>逻辑字段：</Trans>
              <span className="font-mono">
                {drift.recipeDrift.slice(0, 8).join(", ")}
                {drift.recipeDrift.length > 8
                  ? ` ${t(msg`… (+${drift.recipeDrift.length - 8})`)}`
                  : ""}
              </span>
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="primary"
          className="w-full shrink-0 sm:w-auto"
          disabled={syncMut.isPending}
          onClick={() => syncMut.mutate()}
        >
          {syncMut.isPending ? t(msg`同步中...`) : t(msg`纳入 wiki 历史`)}
        </Button>
      </div>
      {/* "纳入 wiki 历史" mutation 失败时只是一段普通 <p>，SR 完全静默；
          补 role=alert 让屏读把后端错误念出来。 */}
      {syncMut.isError && (
        <p
          role="alert"
          className="mt-2 text-xs text-[var(--state-danger-text)]"
        >
          {(syncMut.error as Error).message}
        </p>
      )}
    </Card>
  );
}
