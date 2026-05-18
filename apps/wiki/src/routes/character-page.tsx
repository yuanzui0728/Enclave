import { useEffect, useMemo, useState } from "react";
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
} from "@yinjie/ui";
import { hasRole } from "../lib/auth-store";
import { useAuth } from "../lib/use-auth";
import {
  wikiApi,
  type WikiPageView,
  type WikiRevisionSummary,
} from "../lib/wiki-api";
import { SnapshotDiff } from "../components/snapshot-diff";
import { TalkPanel } from "../components/talk-panel";
import { WatchToggle } from "../components/watch-toggle";
import { ReportButton } from "../components/report-button";
import { FormRow } from "../components/form-row";
import { formatDateTime } from "../lib/format";
import { useUsernameMap } from "../lib/use-username-map";

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
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        {/* 阅读/编辑/历史/讨论是同 URL 下互斥切换视图的 tab —— 不是 nav 链接，所
            以 TabButton 原本的 aria-current="page" 是错的（page 这个值只用于
            "当前页"导航链接，比如侧栏菜单 / 面包屑）；点了"编辑"屏读会念
            "current page 编辑"误导用户以为离开了角色页。和版本切换条统一改成
            role=tablist + role=tab + aria-selected。 */}
        <div
          role="tablist"
          aria-label={t(msg`角色页板块切换`)}
          className="wiki-touch-scroll -mx-1 inline-flex overflow-x-auto rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-1 shadow-[var(--shadow-soft)] sm:mx-0 sm:overflow-visible"
        >
          <TabButton active={tab === "read"} onClick={() => setTab("read")}>
            <Trans>阅读</Trans>
          </TabButton>
          {/* pending_create 期间 character 实体尚未生成，submitEdit 会 400；
              直接隐藏编辑入口，避免点了"打开编辑器 → 提交"全程后才报"角色不存在"。 */}
          {!isPendingCreate && (
            <TabButton active={tab === "edit"} onClick={() => setTab("edit")}>
              <Trans>编辑</Trans>
            </TabButton>
          )}
          <TabButton
            active={tab === "history"}
            onClick={() => setTab("history")}
          >
            <Trans>历史</Trans>
          </TabButton>
          <TabButton active={tab === "talk"} onClick={() => setTab("talk")}>
            <Trans>讨论</Trans>
          </TabButton>
        </div>
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
            // 稳定版 / 最新版是互斥切换 ReadView 内容的 tab，不是独立 toggle。
            // 原写法 role=group + 内层 aria-pressed 是 toggle 语义（NVDA 念成
            // "稳定版 pressed"），跟视觉「胶囊高亮当前段」对不上。对齐桌面/移动
            // 视频号 section tabs 的修法：外层 role=tablist + aria-label，内层
            // role=tab + aria-selected，让 SR 听到"已选中 稳定版 / 最新版 选项卡"。
            <div
              role="tablist"
              aria-label={t(msg`版本切换`)}
              className="inline-flex w-full shrink-0 overflow-hidden rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-xs shadow-[var(--shadow-soft)] sm:ml-auto sm:w-auto"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "stable"}
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
  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <header className="flex items-start gap-3 sm:gap-4">
        <ReadViewAvatar name={c.name} src={c.avatar} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight sm:text-2xl">
            {c.name}
          </h1>
          {(() => {
            // 历史/导入角色 relationship 或 relationshipType 任一为空时，原本固定
            // 渲染 "X · Y"，会出现 " · friend" 或 "朋友 · " 这种孤立分隔符。
            // home-page 卡片同位置已经走条件拼接，详情页对齐避免割裂感。
            const rel =
              c.relationship && c.relationshipType
                ? `${c.relationship} · ${c.relationshipType}`
                : c.relationship || c.relationshipType || "";
            if (!rel) return null;
            return (
              <div className="mt-1 text-sm text-[var(--text-muted)]">
                {rel}
              </div>
            );
          })()}
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
          <Section label={t(msg`核心逻辑`)}>
            {recipe.prompting.coreLogic || "—"}
          </Section>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section label={t(msg`聊天 Prompt`)}>
              {recipe.prompting.scenePrompts.chat || "—"}
            </Section>
            <Section label={t(msg`主动触达 Prompt`)}>
              {recipe.prompting.scenePrompts.proactive || "—"}
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
          {view.pendingRevision.operation} / {view.pendingRevision.riskLevel}
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
        <Trans>
          当前你的权限是 <strong className="mx-1">{user.role}</strong>。
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
          onRevert={(reason) =>
            revertMut.mutate({ toRevisionId: rev.id, reason })
          }
          reverting={revertMut.isPending}
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
  onRevert: (reason: string) => void;
  reverting: boolean;
}) {
  const t = translateRuntimeMessage;
  const [showDiff, setShowDiff] = useState(false);
  const [showRevert, setShowRevert] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Card className="flex items-start gap-3 p-3 text-sm">
      <div className="w-10 shrink-0 pt-0.5 font-mono text-[var(--text-muted)] sm:w-12">
        v{rev.version}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <strong>{editorName}</strong>
          <span className="text-xs text-[var(--text-muted)]">
            {rev.editorRoleAtTime}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {formatDateTime(rev.createdAt)}
          </span>
          <StatusPill>{rev.status}</StatusPill>
          <StatusPill>{rev.operation}</StatusPill>
          {rev.revisionKind !== "content" && (
            <StatusPill>{rev.revisionKind}</StatusPill>
          )}
          {rev.riskLevel === "high" && (
            <StatusPill>
              <Trans>高风险</Trans>
            </StatusPill>
          )}
          {rev.changeSource !== "edit" && (
            <StatusPill>{rev.changeSource}</StatusPill>
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
        {rev.editSummary && (
          <div className="mt-1 break-words">{rev.editSummary}</div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
          {rev.diffFromParent?.changed && (
            <span className="break-words">
              <Trans>字段：{rev.diffFromParent.changed.join(", ")}</Trans>
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
          {canRevert && !isCurrent && rev.status === "approved" && (
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
            {rev.recipeSnapshot && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-[var(--text-muted)]">
                  <Trans>查看角色逻辑快照</Trans>
                </summary>
                <pre className="mt-2 p-3 bg-[var(--bg-canvas)] rounded overflow-auto max-h-[40vh] md:max-h-[60vh]">
                  {JSON.stringify(rev.recipeSnapshot, null, 2)}
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
                onClick={() => {
                  onRevert(reason.trim());
                  setShowRevert(false);
                  setReason("");
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
      {syncMut.isError && (
        <p className="mt-2 text-xs text-[var(--state-danger-text)]">
          {(syncMut.error as Error).message}
        </p>
      )}
    </Card>
  );
}
