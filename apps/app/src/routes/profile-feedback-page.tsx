import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bug,
  ClipboardList,
  Gauge,
  Lightbulb,
  MessageSquareText,
} from "lucide-react";
import {
  type CloudFeedbackCategory,
  submitCloudFeedback,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, Button, cn } from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const TITLE_MAX = 100;
const DETAIL_MAX = 4000;

const categoryOptionConfigs: Array<{
  id: CloudFeedbackCategory;
  label: ReturnType<typeof msg>;
  icon: typeof Bug;
}> = [
  { id: "bug", label: msg`功能异常`, icon: Bug },
  { id: "interaction", label: msg`交互体验`, icon: MessageSquareText },
  { id: "performance", label: msg`性能问题`, icon: Gauge },
  { id: "content", label: msg`内容口径`, icon: ClipboardList },
  { id: "feature", label: msg`能力建议`, icon: Lightbulb },
];

type Notice = { tone: "success" | "danger"; message: string } | null;

export function ProfileFeedbackPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const cloudApiBaseUrl = runtimeConfig.cloudApiBaseUrl;
  const username = useWorldOwnerStore((state) => state.username);
  const signature = useWorldOwnerStore((state) => state.signature);

  const [category, setCategory] = useState<CloudFeedbackCategory>("bug");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isDesktopLayout) {
      void navigate({ to: "/desktop/feedback", replace: true });
    }
  }, [isDesktopLayout, navigate]);

  useEffect(() => {
    return () => {
      if (navTimeoutRef.current !== null) {
        clearTimeout(navTimeoutRef.current);
        navTimeoutRef.current = null;
      }
    };
  }, []);

  const categoryOptions = useMemo(
    () =>
      categoryOptionConfigs.map((item) => ({ ...item, label: t(item.label) })),
    [t],
  );

  const goBack = () =>
    navigateBackOrFallback(() => {
      void navigate({ to: "/tabs/profile" });
    });

  const handleSubmit = async () => {
    if (submitting) return;
    const trimmedTitle = title.trim();
    const trimmedDetail = detail.trim();
    if (!trimmedTitle || !trimmedDetail) {
      setNotice({
        tone: "danger",
        message: t(msg`请填写标题和详细描述`),
      });
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      await submitCloudFeedback(
        {
          source: "mobile",
          category,
          priority: "medium",
          title: trimmedTitle,
          detail: trimmedDetail,
          includeSystemSnapshot: false,
          clientRecordId: `mobile-feedback-${Date.now()}`,
          clientSubmittedAt: new Date().toISOString(),
          appPlatform: runtimeConfig.appPlatform || "mobile",
          apiBaseUrl: runtimeConfig.apiBaseUrl || null,
          ownerName: username || null,
          ownerSignature: signature || null,
        },
        cloudApiBaseUrl || undefined,
      );
      setTitle("");
      setDetail("");
      setNotice({
        tone: "success",
        message: t(msg`反馈已提交，感谢你的支持`),
      });
      if (navTimeoutRef.current !== null) {
        clearTimeout(navTimeoutRef.current);
      }
      navTimeoutRef.current = setTimeout(() => {
        navTimeoutRef.current = null;
        void navigate({ to: "/tabs/profile" });
      }, 1500);
    } catch (error) {
      setNotice({
        tone: "danger",
        message: t(msg`提交失败：${describeRequestError(error)}`),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppPage
      className="bg-[color:var(--bg-canvas)] px-0 py-0"
      style={{
        paddingBottom:
          "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
      }}
    >
      <TabPageTopBar
        title={t(msg`反馈`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
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

      <div className="space-y-5 px-4 pt-4">
        <section>
          <div className="mb-2 text-[12px] font-medium text-[color:var(--text-secondary)]">
            {t(msg`反馈类型`)}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {categoryOptions.map((item) => {
              const Icon = item.icon;
              const active = category === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.id)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-[12px] border px-2 py-3 text-[12px] transition-colors",
                    active
                      ? "border-[#15803d] bg-[rgba(7,193,96,0.10)] text-[#15803d]"
                      : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] active:bg-[color:var(--surface-card-hover)]",
                  )}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between text-[12px] font-medium text-[color:var(--text-secondary)]">
            <span>{t(msg`标题`)}</span>
            <span className="text-[color:var(--text-muted)]">
              {title.length}/{TITLE_MAX}
            </span>
          </div>
          <input
            type="text"
            value={title}
            maxLength={TITLE_MAX}
            onChange={(event) => {
              setTitle(event.target.value);
              if (notice?.tone === "danger") setNotice(null);
            }}
            placeholder={t(msg`一句话描述问题`)}
            className="w-full rounded-[12px] border border-[color:var(--border-faint)] bg-white px-3 py-2.5 text-[14px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)] focus:border-[#15803d]"
          />
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between text-[12px] font-medium text-[color:var(--text-secondary)]">
            <span>{t(msg`详细描述`)}</span>
            <span className="text-[color:var(--text-muted)]">
              {detail.length}/{DETAIL_MAX}
            </span>
          </div>
          <textarea
            value={detail}
            maxLength={DETAIL_MAX}
            onChange={(event) => {
              setDetail(event.target.value);
              if (notice?.tone === "danger") setNotice(null);
            }}
            placeholder={t(
              msg`说说你看到了什么、期望是什么，越具体越好，比如：在哪个页面、怎么复现、希望的结果`,
            )}
            rows={8}
            className="w-full resize-none rounded-[12px] border border-[color:var(--border-faint)] bg-white px-3 py-2.5 text-[14px] leading-6 text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)] focus:border-[#15803d]"
          />
        </section>

        {notice ? (
          <div
            className={cn(
              "rounded-[10px] px-3 py-2 text-[12px]",
              notice.tone === "success"
                ? "bg-[rgba(7,193,96,0.08)] text-[#15803d]"
                : "bg-[rgba(220,38,38,0.08)] text-[#b42318]",
            )}
          >
            {notice.message}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={submitting}
          className={cn(
            "flex w-full items-center justify-center rounded-[12px] px-4 py-3 text-[14px] font-medium text-white transition-colors",
            submitting
              ? "bg-[#86d2a8]"
              : "bg-[#15803d] active:bg-[#0f6f33]",
          )}
        >
          {submitting ? t(msg`提交中…`) : t(msg`提交反馈`)}
        </button>

        <p className="pt-1 text-center text-[11px] leading-5 text-[color:var(--text-muted)]">
          {t(
            msg`反馈会同步到隐界云端控制台，处理结果可能不会逐条回复。涉及账号问题请前往设置。`,
          )}
        </p>
      </div>
    </AppPage>
  );
}
