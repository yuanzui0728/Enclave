import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { Copy, Inbox, LoaderCircle, Phone, UsersRound } from "lucide-react";
import {
  decideAvatarEncounter,
  getAvatarEncounter,
  getAvatarEncounterOverview,
  isApiRequestError,
  listReceivedAvatarEncounters,
  startAvatarEncounter,
  type AvatarEncounterContact,
  type AvatarEncounterDecision,
  type AvatarEncounterStatus,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { InlineNotice, cn } from "@yinjie/ui";
import { AvatarEncounterDecisionBar } from "../components/avatar-encounter-decision-bar";
import { AvatarEncounterInboxCard } from "../components/avatar-encounter-inbox-card";
import { AvatarEncounterTranscript } from "../components/avatar-encounter-transcript";
import { MobileDiscoverToolShell } from "../components/mobile-discover-tool-shell";
import { RouteRedirectState } from "../components/route-redirect-state";
import { parseMobileDiscoverToolRouteState } from "../features/discover/mobile-discover-tool-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { translateAppErrorCode } from "../lib/error-translate";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { openSubscriptionExpiredDialog } from "../lib/subscription-expired";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { writeClipboardText } from "../runtime/native-clipboard";
import { useCloudSessionStore } from "../store/cloud-session-store";

export function DiscoverAvatarEncounterPage() {
  const t = useRuntimeTranslator();
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    void navigate({
      to: "/tabs/discover",
      hash: hash || undefined,
      replace: true,
    });
  }, [hash, isDesktopLayout, navigate]);

  if (isDesktopLayout) {
    return (
      <RouteRedirectState
        title={t(msg`正在切换到桌面发现页`)}
        description={t(msg`分身相遇当前只在移动端开放，先回到主发现页。`)}
        loadingLabel={t(msg`正在切换到桌面发现页...`)}
      />
    );
  }

  return <MobileAvatarEncounterPage />;
}

type ActiveTab = "discover" | "received";

// 联系方式类型 → 展示文案。
function useContactKindLabel() {
  const t = useRuntimeTranslator();
  return (kind: AvatarEncounterContact["kind"]) => {
    switch (kind) {
      case "wechat":
        return t(msg`微信`);
      case "phone":
        return t(msg`手机号`);
      case "other":
      default:
        return t(msg`联系方式`);
    }
  };
}

// 已结束 / 已决策的终态——决策条不再可点。
function isDecidedStatus(status: AvatarEncounterStatus): boolean {
  return (
    status === "matched" ||
    status === "closed_initiator_skipped" ||
    status === "closed_recipient_skipped"
  );
}

function MobileAvatarEncounterPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const runtimeConfig = useAppRuntimeConfig();
  const cloudApiBaseUrl = runtimeConfig.cloudApiBaseUrl ?? "";
  const accessToken = useCloudSessionStore((state) => state.accessToken);
  const contactKindLabel = useContactKindLabel();

  const routeState = useMemo(
    () => parseMobileDiscoverToolRouteState(hash),
    [hash],
  );
  // 可从 #tab=received seed 初始 tab（收件箱推送 deep-link 用），默认发现相遇。
  const [activeTab, setActiveTab] = useState<ActiveTab>(() =>
    /(?:^|[#&])tab=received(?:&|$)/.test(hash) ? "received" : "discover",
  );

  const overviewQuery = useQuery({
    queryKey: ["avatar-encounter-overview", cloudApiBaseUrl, accessToken],
    queryFn: () =>
      getAvatarEncounterOverview(accessToken ?? "", cloudApiBaseUrl),
    enabled: Boolean(accessToken),
  });

  const remainingCredits = overviewQuery.data?.remainingCredits ?? null;

  const heroDescription =
    remainingCredits === null
      ? t(msg`让你的分身替你去认识新的人。`)
      : t(msg`今日剩余 ${remainingCredits} 次。`);

  function navigateToRouteStateReturn() {
    if (!routeState.returnPath || isDesktopOnlyPath(routeState.returnPath)) {
      return false;
    }
    void navigate({
      to: routeState.returnPath,
      ...(routeState.returnHash ? { hash: routeState.returnHash } : {}),
    });
    return true;
  }

  const handleBack = () =>
    navigateBackOrFallback(
      () => {
        if (navigateToRouteStateReturn()) {
          return;
        }
        void navigate({ to: "/tabs/discover" });
      },
      (routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
        ? routeState.returnPath
        : undefined) ?? "/tabs/discover",
    );

  return (
    <MobileDiscoverToolShell
      title={t(msg`分身相遇`)}
      subtitle={t(msg`让你的分身替你去认识新的人`)}
      heroTitle={t(msg`分身相遇`)}
      heroVisual={<UsersRound size={28} />}
      heroDescription={heroDescription}
      onBack={handleBack}
    >
      {!accessToken ? (
        // 分身相遇是跨用户功能，必须登录云账号。本地 world / 未登云的用户在这里
        // 友好提示，而不是点「开始相遇」后拿到一句英文 401。
        <InlineNotice
          className="rounded-[12px] px-3 py-2.5 text-[12px] leading-5 shadow-none"
          tone="info"
          role="status"
        >
          {t(msg`分身相遇需要登录云账号后使用。`)}
        </InlineNotice>
      ) : (
        <>
      {/* 页内分段 tab：发现相遇 / 我的相遇。 */}
      <div className="flex rounded-[14px] bg-[color:var(--surface-soft)] p-1">
        {(
          [
            { key: "discover", label: msg`发现相遇` },
            { key: "received", label: msg`我的相遇` },
          ] as const
        ).map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex-1 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "bg-[color:var(--surface-card)] text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]"
                  : "text-[color:var(--text-secondary)]",
              )}
            >
              {t(tab.label)}
            </button>
          );
        })}
      </div>

      {activeTab === "discover" ? (
        <DiscoverTab
          accessToken={accessToken}
          cloudApiBaseUrl={cloudApiBaseUrl}
          remainingCredits={remainingCredits}
          contactKindLabel={contactKindLabel}
          onRefetchOverview={() => void overviewQuery.refetch()}
        />
      ) : (
        <ReceivedTab
          accessToken={accessToken}
          cloudApiBaseUrl={cloudApiBaseUrl}
          contactKindLabel={contactKindLabel}
        />
      )}
        </>
      )}
    </MobileDiscoverToolShell>
  );
}

// ── 发现相遇 ────────────────────────────────────────────────────────────────

type DiscoverTabProps = {
  accessToken: string | null;
  cloudApiBaseUrl: string;
  remainingCredits: number | null;
  contactKindLabel: (kind: AvatarEncounterContact["kind"]) => string;
  onRefetchOverview: () => void;
};

function DiscoverTab({
  accessToken,
  cloudApiBaseUrl,
  remainingCredits,
  contactKindLabel,
  onRefetchOverview,
}: DiscoverTabProps) {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  // 当前这次相遇的本地状态：脚本 + 决策。startMutation 成功后落进来。
  const [decision, setDecision] = useState<AvatarEncounterDecision | null>(
    null,
  );
  const [revealedContact, setRevealedContact] =
    useState<AvatarEncounterContact | null>(null);
  const [contactCopied, setContactCopied] = useState(false);

  const startMutation = useMutation({
    mutationFn: () => startAvatarEncounter(accessToken ?? "", cloudApiBaseUrl),
    onMutate: () => {
      // 新一次相遇起手时把上一次的决策 / 披露状态清掉。
      setDecision(null);
      setRevealedContact(null);
      setContactCopied(false);
    },
    onSuccess: () => {
      // 扣了 1 次额度，刷新 hero 上的剩余次数。
      onRefetchOverview();
    },
  });

  const session = startMutation.data ?? null;

  const decideMutation = useMutation({
    mutationFn: (next: AvatarEncounterDecision) => {
      if (!session) {
        throw new Error("no session"); // i18n-ignore-line: guard
      }
      return decideAvatarEncounter(
        session.id,
        { decision: next },
        accessToken ?? "",
        cloudApiBaseUrl,
      );
    },
    onSuccess: (result, variables) => {
      setDecision(variables);
      if (result.status === "matched" && result.contact) {
        setRevealedContact(result.contact);
      }
    },
  });

  // 日额度撞墙：禁用按钮 + 提示「了解会员」。
  const dailyLimitHit =
    startMutation.isError &&
    isApiRequestError(startMutation.error) &&
    startMutation.error.errorCode === "AVATAR_ENCOUNTER_DAILY_LIMIT";
  const creditsExhausted = remainingCredits !== null && remainingCredits <= 0;
  const startDisabled =
    startMutation.isPending || dailyLimitHit || creditsExhausted;

  async function handleCopyContact() {
    if (!revealedContact) return;
    const ok = await writeClipboardText(revealedContact.value);
    setContactCopied(ok);
  }

  return (
    <div className="space-y-3">
      {/* 开始相遇按钮（无脚本时显示）/ 生成中 loading。 */}
      {!session ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => startMutation.mutate()}
            disabled={startDisabled}
            aria-busy={startMutation.isPending || undefined}
            className={cn(
              "flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-[linear-gradient(135deg,var(--brand-primary),var(--brand-primary))] text-[14px] font-semibold text-white transition-opacity active:opacity-90",
              startDisabled && "opacity-60",
            )}
          >
            {startMutation.isPending ? (
              <>
                <LoaderCircle size={16} className="animate-spin" />
                {t(msg`你的分身正在替你相遇…`)}
              </>
            ) : (
              <>
                <UsersRound size={16} />
                {t(msg`开始相遇`)}
              </>
            )}
          </button>

          {startMutation.isPending ? (
            <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-5 text-center">
              <LoaderCircle
                size={22}
                className="mx-auto animate-spin text-[#f43f5e]"
              />
              <div className="mt-2 text-[13px] text-[color:var(--text-secondary)]">
                {t(msg`你的分身正在替你相遇…`)}
              </div>
              <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                {t(msg`生成对话可能需要一点时间，请耐心等待。`)}
              </div>
            </div>
          ) : (
            <div className="text-center text-[12px] leading-5 text-[color:var(--text-muted)]">
              {remainingCredits !== null
                ? t(msg`每次相遇会消耗 1 次额度，今日剩余 ${remainingCredits} 次。`)
                : t(msg`每次相遇会消耗 1 次额度。`)}
            </div>
          )}

          {dailyLimitHit || creditsExhausted ? (
            <InlineNotice
              className="rounded-[12px] px-3 py-2 text-[12px] leading-5 shadow-none"
              tone="warning"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">
                  {t(msg`今日的分身相遇次数已用完，明天再来。`)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    openSubscriptionExpiredDialog({
                      message: t(
                        msg`升级会员可获得更多每日分身相遇次数。`,
                      ),
                    })
                  }
                  className="shrink-0 rounded-full border border-[color:var(--brand-primary)]/24 bg-[color:var(--surface-card)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--brand-primary)]"
                >
                  {t(msg`了解会员`)}
                </button>
              </div>
            </InlineNotice>
          ) : startMutation.isError && !startMutation.isPending ? (
            <StartErrorNotice
              error={startMutation.error}
              onRetry={() => startMutation.mutate()}
            />
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <AvatarEncounterTranscript
            summary={session.transcript.summary}
            turns={session.transcript.turns}
            partner={session.partner}
          />

          <AvatarEncounterDecisionBar
            decision={decision}
            status={
              // 决策成功后用 decideMutation 返回的 status；否则用 session 初始 status。
              decideMutation.data?.status ?? session.status
            }
            pending={decideMutation.isPending}
            onWant={() => decideMutation.mutate("want")}
            onSkip={() => decideMutation.mutate("skip")}
          />

          {/* 匹配成功披露对方联系方式（仅 status==='matched' && contact）。 */}
          {revealedContact ? (
            <MatchedContactBlock
              contact={revealedContact}
              copied={contactCopied}
              onCopy={() => void handleCopyContact()}
              contactKindLabel={contactKindLabel}
            />
          ) : null}

          {decideMutation.isError ? (
            <EncounterDecideError error={decideMutation.error} />
          ) : null}

          {/* 已做完决策后给一个「再来一次 / 回发现」收口（额度允许时）。 */}
          {decision ? (
            <button
              type="button"
              onClick={() => {
                if (creditsExhausted) {
                  void navigate({ to: "/tabs/discover" });
                  return;
                }
                startMutation.reset();
                startMutation.mutate();
              }}
              className="w-full rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2.5 text-[13px] font-medium text-[color:var(--text-secondary)] transition-colors active:bg-black/[0.04]"
            >
              {creditsExhausted ? t(msg`回到发现`) : t(msg`再相遇一次`)}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function StartErrorNotice({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const t = useRuntimeTranslator();
  if (!(error instanceof Error)) {
    return null;
  }
  // NO_CANDIDATE / AI_GENERATION_FAILED / WORLD_NOT_READY 都可重试；
  // DISABLED 需要先去设置开启（给链接更合适，这里仍保留重试兜底）。
  const message =
    (isApiRequestError(error) ? translateAppErrorCode(error) : null) ??
    error.message;
  return (
    <InlineNotice
      className="rounded-[12px] px-3 py-2 text-[12px] leading-5 shadow-none"
      tone="danger"
      role="alert"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1">{message}</span>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-full border border-[rgba(180,130,20,0.08)] bg-[color:var(--surface-card)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
        >
          {t(msg`再试一次`)}
        </button>
      </div>
    </InlineNotice>
  );
}

// ── 收到的相遇 ──────────────────────────────────────────────────────────────

type ReceivedTabProps = {
  accessToken: string | null;
  cloudApiBaseUrl: string;
  contactKindLabel: (kind: AvatarEncounterContact["kind"]) => string;
};

function ReceivedTab({
  accessToken,
  cloudApiBaseUrl,
  contactKindLabel,
}: ReceivedTabProps) {
  const t = useRuntimeTranslator();
  const [openId, setOpenId] = useState<string | null>(null);

  const inboxQuery = useQuery({
    queryKey: ["avatar-encounter-inbox", cloudApiBaseUrl, accessToken],
    // 不做无限分页：只取第一页，nextCursor 忽略（保持务实）。
    queryFn: () =>
      listReceivedAvatarEncounters(accessToken ?? "", undefined, cloudApiBaseUrl),
    enabled: Boolean(accessToken),
  });

  if (openId) {
    return (
      <ReceivedDetail
        encounterId={openId}
        accessToken={accessToken}
        cloudApiBaseUrl={cloudApiBaseUrl}
        contactKindLabel={contactKindLabel}
        onBack={() => {
          setOpenId(null);
          void inboxQuery.refetch();
        }}
      />
    );
  }

  const items = inboxQuery.data?.items ?? [];

  return (
    <div className="space-y-3">
      {inboxQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-[color:var(--text-muted)]">
          <LoaderCircle size={16} className="animate-spin" />
          {t(msg`正在加载我的相遇…`)}
        </div>
      ) : inboxQuery.isError && inboxQuery.error instanceof Error ? (
        <InlineNotice
          className="rounded-[12px] px-3 py-2 text-[12px] leading-5 shadow-none"
          tone="danger"
          role="alert"
        >
          {(isApiRequestError(inboxQuery.error)
            ? translateAppErrorCode(inboxQuery.error)
            : null) ?? inboxQuery.error.message}
        </InlineNotice>
      ) : items.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-10 text-center">
          <Inbox size={26} className="mx-auto text-[color:var(--text-dim)]" />
          <div className="mt-2 text-[13px] text-[color:var(--text-secondary)]">
            {t(msg`还没有相遇记录`)}
          </div>
          <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
            {t(msg`你发起的、以及别人和你分身的相遇都会出现在这里。`)}
          </div>
        </div>
      ) : (
        items.map((item) => (
          <AvatarEncounterInboxCard
            key={item.id}
            item={item}
            onClick={() => setOpenId(item.id)}
          />
        ))
      )}
    </div>
  );
}

type ReceivedDetailProps = {
  encounterId: string;
  accessToken: string | null;
  cloudApiBaseUrl: string;
  contactKindLabel: (kind: AvatarEncounterContact["kind"]) => string;
  onBack: () => void;
};

function ReceivedDetail({
  encounterId,
  accessToken,
  cloudApiBaseUrl,
  contactKindLabel,
  onBack,
}: ReceivedDetailProps) {
  const t = useRuntimeTranslator();
  const [decision, setDecision] = useState<AvatarEncounterDecision | null>(
    null,
  );
  const [revealedContact, setRevealedContact] =
    useState<AvatarEncounterContact | null>(null);
  const [contactCopied, setContactCopied] = useState(false);

  const viewQuery = useQuery({
    queryKey: ["avatar-encounter-view", cloudApiBaseUrl, accessToken, encounterId],
    queryFn: () =>
      getAvatarEncounter(encounterId, accessToken ?? "", cloudApiBaseUrl),
    enabled: Boolean(accessToken),
  });

  const view = viewQuery.data ?? null;

  // 进详情时把服务端已有的决策 / 披露 seed 进本地状态。
  useEffect(() => {
    if (!view) return;
    setDecision(view.myDecision);
    if (view.status === "matched" && view.contact) {
      setRevealedContact(view.contact);
    }
  }, [view]);

  const decideMutation = useMutation({
    mutationFn: (next: AvatarEncounterDecision) =>
      decideAvatarEncounter(
        encounterId,
        { decision: next },
        accessToken ?? "",
        cloudApiBaseUrl,
      ),
    onSuccess: (result, variables) => {
      setDecision(variables);
      if (result.status === "matched" && result.contact) {
        setRevealedContact(result.contact);
      }
    },
  });

  async function handleCopyContact() {
    if (!revealedContact) return;
    const ok = await writeClipboardText(revealedContact.value);
    setContactCopied(ok);
  }

  const effectiveStatus = decideMutation.data?.status ?? view?.status;
  // 服务端已 decided（myDecision 非空 / 终态）时锁住决策条。
  const locked =
    Boolean(view?.myDecision) ||
    Boolean(decision) ||
    (effectiveStatus ? isDecidedStatus(effectiveStatus) : false);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="text-[13px] font-medium text-[#f43f5e] active:opacity-80"
      >
        {t(msg`‹ 返回我的相遇`)}
      </button>

      {viewQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-[color:var(--text-muted)]">
          <LoaderCircle size={16} className="animate-spin" />
          {t(msg`正在加载这次相遇…`)}
        </div>
      ) : viewQuery.isError && viewQuery.error instanceof Error ? (
        <InlineNotice
          className="rounded-[12px] px-3 py-2 text-[12px] leading-5 shadow-none"
          tone="danger"
          role="alert"
        >
          {(isApiRequestError(viewQuery.error)
            ? translateAppErrorCode(viewQuery.error)
            : null) ?? viewQuery.error.message}
        </InlineNotice>
      ) : view ? (
        <>
          <AvatarEncounterTranscript
            summary={view.transcript.summary}
            turns={view.transcript.turns}
            partner={view.partner}
          />

          <AvatarEncounterDecisionBar
            decision={locked ? decision ?? view.myDecision : null}
            status={effectiveStatus ?? view.status}
            pending={decideMutation.isPending}
            onWant={() => decideMutation.mutate("want")}
            onSkip={() => decideMutation.mutate("skip")}
          />

          {revealedContact ? (
            <MatchedContactBlock
              contact={revealedContact}
              copied={contactCopied}
              onCopy={() => void handleCopyContact()}
              contactKindLabel={contactKindLabel}
            />
          ) : null}

          {decideMutation.isError ? (
            <EncounterDecideError error={decideMutation.error} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// ── 决策报错条（发现 / 收件箱共用） ──────────────────────────────────────────

// 想认识对方（want）前要先填联系方式：后端拦 CONTACT_REQUIRED → 这里出友好提示 +
// 「去填写」链接（跳 /profile/info/contact，填完 world 推快照回池，回来再点 want 即过；
// 这次相遇已落库 awaiting_*，也能从「我的相遇」找回，不会丢脚本）。其余错误走普通 danger。
function EncounterDecideError({ error }: { error: unknown }) {
  const t = useRuntimeTranslator();
  if (!(error instanceof Error)) {
    return null;
  }
  const contactRequired =
    isApiRequestError(error) &&
    error.errorCode === "AVATAR_ENCOUNTER_CONTACT_REQUIRED";
  if (contactRequired) {
    return (
      <InlineNotice
        className="rounded-[12px] px-3 py-2 text-[12px] leading-5 shadow-none"
        tone="warning"
        role="alert"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1">
            {t(msg`想要对方联系方式，需先填写你自己的。这次相遇已存到「我的相遇」，填好后回到那里继续即可。`)}
          </span>
          <Link
            to="/profile/info/contact"
            className="shrink-0 rounded-full border border-[color:var(--brand-primary)]/24 bg-[color:var(--surface-card)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--brand-primary)]"
          >
            {t(msg`去填写`)}
          </Link>
        </div>
      </InlineNotice>
    );
  }
  return (
    <InlineNotice
      className="rounded-[12px] px-3 py-2 text-[12px] leading-5 shadow-none"
      tone="danger"
      role="alert"
    >
      {(isApiRequestError(error) ? translateAppErrorCode(error) : null) ??
        error.message}
    </InlineNotice>
  );
}

// ── 匹配联系方式披露（发现 / 收件箱共用） ─────────────────────────────────────

function MatchedContactBlock({
  contact,
  copied,
  onCopy,
  contactKindLabel,
}: {
  contact: AvatarEncounterContact;
  copied: boolean;
  onCopy: () => void;
  contactKindLabel: (kind: AvatarEncounterContact["kind"]) => string;
}) {
  const t = useRuntimeTranslator();
  return (
    <div className="rounded-[16px] border border-[rgba(244,63,94,0.2)] bg-[linear-gradient(180deg,rgba(255,241,242,0.96),rgba(255,255,255,0.96))] px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#9f1239]">
        <Phone size={13} />
        {t(msg`对方的联系方式`)}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-[color:var(--text-muted)]">
            {contactKindLabel(contact.kind)}
          </div>
          <div
            className="truncate text-[15px] font-semibold text-[color:var(--text-primary)]"
            data-i18n-skip="true"
          >
            {contact.value}
          </div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="flex shrink-0 items-center gap-1 rounded-full bg-[#f43f5e] px-3 py-1.5 text-[12px] font-medium text-white active:opacity-90"
        >
          <Copy size={13} />
          {copied ? t(msg`已复制`) : t(msg`复制`)}
        </button>
      </div>
    </div>
  );
}
