import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  generateXhsPromoCopy,
  generateXhsPromoImage,
  getMyXhsRewardSummary,
  resolveCoreApiBaseUrl,
  submitMyXhsRewardClaim,
  type XhsRewardClaimSummary,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  AppPage,
  AppSection,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
} from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { clearCloudRuntimeSession } from "../lib/cloud-session";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { pickImageFiles } from "../runtime/native-image-picker";
import { writeClipboardText } from "../runtime/native-clipboard";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useCloudSessionStore } from "../store/cloud-session-store";

function formatDateTime(value?: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toLocaleString();
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (await writeClipboardText(text)) return true;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through
    }
  }
  return false;
}

export function ProfileXhsRewardPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const accessToken = useCloudSessionStore((state) => state.accessToken);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  // 文案区：默认空，用户可自写；点「帮我生成文案」才填充候选。
  const [copyText, setCopyText] = useState("");
  const [copyOptions, setCopyOptions] = useState<string[]>([]);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  // 提交凭证
  const [postUrl, setPostUrl] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2600);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  // 预览 objectURL 生命周期：换图/卸载时释放。
  useEffect(() => {
    return () => {
      if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    };
  }, [screenshotPreview]);

  const summaryQuery = useQuery({
    queryKey: ["xhs-reward-summary", accessToken],
    queryFn: () => getMyXhsRewardSummary(accessToken ?? ""),
    enabled: Boolean(accessToken),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const copyMutation = useMutation({
    mutationFn: () => generateXhsPromoCopy({ count: 3 }, baseUrl),
    onSuccess: (result) => {
      setCopyOptions(result.options ?? []);
      // 没填过就直接把第一条放进去，用户可再编辑。
      if (!copyText.trim() && result.options?.[0]) {
        setCopyText(result.options[0]);
      }
    },
    onError: (error) => {
      setFeedback({
        tone: "danger",
        message: describeRequestError(error, t(msg`文案生成失败，请稍后重试。`)),
      });
    },
  });

  const imageMutation = useMutation({
    mutationFn: () => generateXhsPromoImage({}, baseUrl),
    onSuccess: (result) => {
      if (result.quotaExhausted || !result.images?.length) {
        setGeneratedImageUrl(null);
        setFeedback({
          tone: "danger",
          message: t(msg`今日配图额度已用完，可直接用文案发布。`),
        });
        return;
      }
      const raw = result.images[0].url;
      const abs = raw.startsWith("http")
        ? raw
        : `${resolveCoreApiBaseUrl(baseUrl)}${raw}`;
      setGeneratedImageUrl(abs);
    },
    onError: (error) => {
      setFeedback({
        tone: "danger",
        message: describeRequestError(error, t(msg`配图生成失败，请稍后重试。`)),
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: (payload: FormData) =>
      submitMyXhsRewardClaim(payload, accessToken ?? "", baseUrl),
    onSuccess: () => {
      setFeedback({
        tone: "success",
        message: t(msg`已提交，请等待运营审核。`),
      });
      setPostUrl("");
      if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
      setScreenshotPreview(null);
      setScreenshotFile(null);
      void summaryQuery.refetch();
    },
    onError: (error) => {
      setFeedback({
        tone: "danger",
        message: describeRequestError(error, t(msg`提交失败，请稍后重试。`)),
      });
    },
  });

  const handlePickScreenshot = useCallback(async () => {
    const files = await pickImageFiles({ multiple: false });
    const file = files[0];
    if (!file) return;
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
  }, [screenshotPreview]);

  const handleCopyCopy = useCallback(async () => {
    const ok = await copyTextToClipboard(copyText.trim());
    setFeedback({
      tone: ok ? "success" : "danger",
      message: ok ? t(msg`已复制文案。`) : t(msg`复制失败，请手动选中复制。`),
    });
  }, [copyText, t]);

  const handleSubmit = useCallback(() => {
    if (submittingRef.current) return;
    if (!postUrl.trim()) {
      setFeedback({ tone: "danger", message: t(msg`请填写小红书帖子链接。`) });
      return;
    }
    if (!screenshotFile) {
      setFeedback({ tone: "danger", message: t(msg`请上传发帖截图。`) });
      return;
    }
    submittingRef.current = true;
    const form = new FormData();
    form.append("postUrl", postUrl.trim());
    form.append("screenshot", screenshotFile);
    submitMutation.mutate(form, {
      onSettled: () => {
        submittingRef.current = false;
      },
    });
  }, [postUrl, screenshotFile, submitMutation, t]);

  const handleGoLogin = useCallback(() => {
    clearCloudRuntimeSession();
    void navigate({ to: "/welcome", replace: true });
  }, [navigate]);

  const goBack = () =>
    navigateBackOrFallback(
      () => void navigate({ to: "/profile/subscription", replace: true }),
      "/profile/subscription",
    );

  const mobileTopBar = !isDesktopLayout ? (
    <TabPageTopBar
      title={t(msg`发小红书赢会员`)}
      titleAlign="center"
      leftActions={
        <Button
          onClick={goBack}
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none active:bg-black/[0.05]"
          aria-label={t(msg`返回`)}
        >
          <ArrowLeft size={17} />
        </Button>
      }
    />
  ) : null;

  if (!accessToken) {
    return (
      <AppPage className="bg-[color:var(--bg-canvas)] px-4 pt-6">
        {mobileTopBar}
        <AppSection className="mx-auto max-w-3xl space-y-3 px-5 py-6">
          <InlineNotice tone="info">
            {t(msg`此功能需要登录隐界云账号。`)}
          </InlineNotice>
          <Button onClick={handleGoLogin} className="w-full">
            {t(msg`去登录云账号`)}
          </Button>
        </AppSection>
      </AppPage>
    );
  }

  if (summaryQuery.isLoading) {
    return (
      <AppPage className="bg-[color:var(--bg-canvas)] px-4 pt-6">
        {mobileTopBar}
        <AppSection className="mx-auto max-w-3xl">
          <LoadingBlock label={t(msg`正在加载…`)} />
        </AppSection>
      </AppPage>
    );
  }

  if (summaryQuery.error) {
    return (
      <AppPage className="bg-[color:var(--bg-canvas)] px-4 pt-6">
        {mobileTopBar}
        <AppSection className="mx-auto max-w-3xl">
          <ErrorBlock role="alert" message={describeRequestError(summaryQuery.error)} />
        </AppSection>
      </AppPage>
    );
  }

  const summary = summaryQuery.data;
  if (!summary) return null;

  return (
    <AppPage
      className="bg-[color:var(--bg-canvas)] px-4 pt-6"
      style={{
        paddingBottom:
          "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
      }}
    >
      {!isDesktopLayout ? (
        <TabPageTopBar
          title={summary.title || t(msg`发小红书赢会员`)}
          titleAlign="center"
          leftActions={
            <Button
              onClick={goBack}
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none active:bg-black/[0.05]"
              aria-label={t(msg`返回`)}
            >
              <ArrowLeft size={17} />
            </Button>
          }
        />
      ) : null}

      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {/* 规则说明 */}
        <AppSection className="overflow-hidden rounded-[24px] border-[color:var(--border-faint)] bg-[linear-gradient(135deg,#fff7ed,#ffffff)] px-6 py-6 shadow-none">
          {isDesktopLayout ? (
            <h1 className="text-2xl font-semibold text-[color:var(--text-primary)]">
              {summary.title || t(msg`发小红书赢会员`)}
            </h1>
          ) : null}
          <p className={`${isDesktopLayout ? "mt-2 " : ""}text-sm leading-7 text-[color:var(--text-secondary)]`}>
            {summary.body}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--text-muted)]">
            <span className="rounded-full bg-[color:var(--surface-secondary)] px-3 py-1">
              {t(msg`每条审核通过 = ${summary.rewardDays} 天会员`)}
            </span>
            <span className="rounded-full bg-[color:var(--surface-secondary)] px-3 py-1">
              {t(msg`还可提交 ${summary.remainingQuota} 次`)}
            </span>
          </div>
          {!summary.enabled ? (
            <InlineNotice className="mt-4" tone="muted">
              {t(msg`活动暂未开放。`)}
            </InlineNotice>
          ) : null}
        </AppSection>

        {summary.enabled ? (
          <>
            {/* 文案区（opt-in 生成，可自写） */}
            <AppSection className="rounded-[24px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-6 py-6 shadow-none">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                  {t(msg`第一步 · 准备文案`)}
                </div>
                <Button
                  variant="secondary"
                  className="rounded-full border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-none"
                  disabled={copyMutation.isPending}
                  onClick={() => copyMutation.mutate()}
                >
                  {copyMutation.isPending ? t(msg`生成中…`) : t(msg`帮我生成文案`)}
                </Button>
              </div>
              <p className="mt-2 text-xs text-[color:var(--text-muted)]">
                {t(msg`可以自己写，也可以点上面按钮让我们帮你生成（每次都不一样）。`)}
              </p>

              {copyOptions.length ? (
                <div className="mt-3 space-y-2">
                  {copyOptions.map((option, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setCopyText(option)}
                      className="block w-full rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-4 py-3 text-left text-xs leading-6 text-[color:var(--text-secondary)] active:bg-black/[0.04]"
                    >
                      {option}
                    </button>
                  ))}
                  <div className="text-xs text-[color:var(--text-muted)]">
                    {t(msg`点一条放入下方编辑框，可再修改。`)}
                  </div>
                </div>
              ) : null}

              <textarea
                value={copyText}
                onChange={(event) => setCopyText(event.target.value)}
                rows={6}
                placeholder={t(msg`在这里写你的小红书文案，或点「帮我生成文案」。`)}
                className="mt-3 w-full rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-4 py-3 text-sm leading-6 text-[color:var(--text-primary)] outline-none"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  variant="secondary"
                  className="rounded-full border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-none"
                  disabled={!copyText.trim()}
                  onClick={() => void handleCopyCopy()}
                >
                  {t(msg`复制文案`)}
                </Button>
              </div>
            </AppSection>

            {/* 配图区（独立 opt-in） */}
            <AppSection className="rounded-[24px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-6 py-6 shadow-none">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                  {t(msg`第二步 · 生成配图（可选）`)}
                </div>
                <Button
                  variant="secondary"
                  className="rounded-full border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-none"
                  disabled={imageMutation.isPending}
                  onClick={() => imageMutation.mutate()}
                >
                  {imageMutation.isPending ? t(msg`生成中…`) : t(msg`生成配图`)}
                </Button>
              </div>
              <p className="mt-2 text-xs text-[color:var(--text-muted)]">
                {t(msg`这是给你下载后发到小红书的素材，和下方「发帖截图」不是一回事。`)}
              </p>
              {generatedImageUrl ? (
                <div className="mt-3 flex flex-col items-start gap-2">
                  <img
                    src={generatedImageUrl}
                    alt={t(msg`生成的配图`)}
                    className="max-h-[320px] rounded-[16px] border border-[color:var(--border-faint)]"
                  />
                  <a
                    href={generatedImageUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-[color:var(--text-link,#2563eb)] underline"
                  >
                    {t(msg`下载配图（或长按保存）`)}
                  </a>
                </div>
              ) : null}
            </AppSection>

            {/* 提交凭证 */}
            <AppSection className="rounded-[24px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-6 py-6 shadow-none">
              <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                {t(msg`第三步 · 提交发帖凭证`)}
              </div>
              <p className="mt-2 text-xs text-[color:var(--text-muted)]">
                {summary.submitHint}
              </p>

              <label className="mt-4 block text-xs text-[color:var(--text-muted)]">
                {t(msg`小红书帖子链接`)}
              </label>
              <input
                value={postUrl}
                onChange={(event) => setPostUrl(event.target.value)}
                placeholder={t(msg`粘贴你发布的小红书帖子链接`)}
                className="mt-1 w-full rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none"
              />

              <label className="mt-4 block text-xs text-[color:var(--text-muted)]">
                {t(msg`发帖截图`)}
              </label>
              <div className="mt-1 flex items-center gap-3">
                <Button
                  variant="secondary"
                  className="rounded-full border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-none"
                  onClick={() => void handlePickScreenshot()}
                >
                  {screenshotFile ? t(msg`重新选择`) : t(msg`选择截图`)}
                </Button>
                {screenshotPreview ? (
                  <img
                    src={screenshotPreview}
                    alt={t(msg`截图预览`)}
                    className="h-16 w-16 rounded-[12px] border border-[color:var(--border-faint)] object-cover"
                  />
                ) : null}
              </div>

              <Button
                variant="primary"
                className="mt-5 w-full rounded-full bg-[color:var(--brand-primary)] text-[color:var(--text-on-brand)] shadow-none hover:bg-[color:var(--brand-primary)] active:bg-[color:var(--brand-primary)]"
                disabled={submitMutation.isPending}
                onClick={handleSubmit}
              >
                {submitMutation.isPending ? t(msg`提交中…`) : t(msg`提交审核`)}
              </Button>

              {feedback ? (
                <InlineNotice
                  className="mt-3"
                  tone={feedback.tone}
                  role={feedback.tone === "danger" ? "alert" : "status"}
                >
                  {feedback.message}
                </InlineNotice>
              ) : null}
            </AppSection>
          </>
        ) : null}

        {/* 审核状态列表 */}
        <AppSection className="rounded-[24px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-6 py-6 shadow-none">
          <div className="text-sm font-semibold text-[color:var(--text-primary)]">
            {t(msg`我的提交记录`)}
          </div>
          <ClaimList claims={summary.recentClaims} />
        </AppSection>
      </div>
    </AppPage>
  );
}

function ClaimList({ claims }: { claims: XhsRewardClaimSummary[] }) {
  const t = useRuntimeTranslator();
  const statusLabel = useMemo(
    () => ({
      pending: t(msg`审核中`),
      approved: t(msg`已通过`),
      rejected: t(msg`已拒绝`),
    }),
    [t],
  );
  if (!claims.length) {
    return (
      <InlineNotice className="mt-4" tone="muted">
        {t(msg`还没有提交记录。`)}
      </InlineNotice>
    );
  }
  return (
    <div className="mt-4 space-y-3">
      {claims.map((claim) => (
        <div
          key={claim.id}
          className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-4 py-3 text-sm text-[color:var(--text-secondary)]"
        >
          <div className="flex items-center justify-between gap-2">
            <a
              href={claim.postUrl}
              target="_blank"
              rel="noreferrer"
              className="truncate text-xs text-[color:var(--text-link,#2563eb)] underline"
            >
              {claim.postUrl}
            </a>
            <span className="shrink-0 text-xs font-medium text-[color:var(--text-primary)]">
              {statusLabel[claim.status]}
            </span>
          </div>
          <div className="mt-1 text-xs">
            {t(msg`提交时间`)}: {formatDateTime(claim.createdAt) ?? "-"}
          </div>
          {claim.reviewNote ? (
            <div className="mt-1 text-xs">
              {t(msg`备注`)}: {claim.reviewNote}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
