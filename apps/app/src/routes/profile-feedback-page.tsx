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
import { useCloudSessionStore } from "../store/cloud-session-store";
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
  // 手机号登录走这一路；邮箱/Google 登录走 cloudEmail。两者互斥但都可能为空
  // （未登录 cloud），交给 admin 凭 ownerName 兜底。
  const cloudPhone = useCloudSessionStore((state) => state.phone);
  const cloudEmail = useCloudSessionStore((state) => state.email);

  // 走查新一轮 R1（移动端我-tab 端到端 2026-05-22）：feedback 表单输到一半切走
  // 再回来 title/detail 全丢 —— 用户写长篇反馈（detail 上限 4000 字）时误触
  // 离开（如点底部 tab / Android Back 误关）就重写一遍。用 sessionStorage 草稿
  // 化：mount 时读回上次 draft，每次 onChange 同步写回；handleSubmit 成功后
  // 清掉。category 也一起存（用户挑过的 category 也是输入态）。
  // session 而非 localStorage：feedback 是短期 transient，关 tab 后丢 OK；
  // 且不跨用户共享（多账号切来切去时不要把 A 的反馈草稿误塞给 B 看）。
  const DRAFT_STORAGE_KEY = "yinjie-feedback-draft-mobile-v1";
  const initialDraft = (() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || !parsed) return null;
      return {
        category:
          typeof parsed.category === "string"
            ? (parsed.category as CloudFeedbackCategory)
            : "bug",
        title: typeof parsed.title === "string" ? parsed.title : "",
        detail: typeof parsed.detail === "string" ? parsed.detail : "",
      };
    } catch {
      return null;
    }
  })();
  const [category, setCategory] = useState<CloudFeedbackCategory>(
    initialDraft?.category ?? "bug",
  );
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [detail, setDetail] = useState(initialDraft?.detail ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 任意 input 变化时同步 draft 进 sessionStorage —— 切走 unmount 后再回来
  // 也能读回。category + title + detail 三态合一对象，避免 3 个分别 set 引发
  // 3 次写。debounce 不必要：sessionStorage 写本机几乎免费 (< 1ms / op)。
  useEffect(() => {
    if (typeof window === "undefined") return;
    // title/detail 都空 + category=默认时不写 storage —— 用户没真动过的初始态
    // 不污染 storage，下次进来仍走 "" 初值。
    if (!title && !detail && category === "bug") {
      try {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        /* noop */
      }
      return;
    }
    try {
      sessionStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({ category, title, detail }),
      );
    } catch {
      /* quota/serialize fail 静默忽略，下次切回来变空表单是 graceful degrade */
    }
  }, [category, title, detail]);
  // 新走查 R1：submitting state 同帧双击有 propagation gap—两个 click 闭包都
  // 读到 submitting=false 时都过门，POST /cloud/feedback 重复 2 次。和
  // account-security-panel.tsx changeInFlightRef 同款 sync ref 守卫。
  const submitInFlightRef = useRef(false);

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

  // 桌面布局先 render mobile 表单再被 effect 推到 /desktop/feedback 会有一帧闪烁，
  // 跟其它 profile-info 子页一致：早 return null 让 redirect 一拍内完成。
  // hooks 必须先全部声明完再 early return，否则布局切换时会触发
  // "Rendered fewer hooks than expected" 崩溃。
  if (isDesktopLayout) {
    return null;
  }

  const goBack = () =>
    navigateBackOrFallback(
      () => {
        // 走查 R1（移动端我-tab 端到端走查 2026-05-22）：fallback 路径之前不加
        // replace，从「无 history 可退」走到这一支时会再往 stack 推一格
        // /tabs/profile —— 用户从 profile 进 feedback → 没 history → Android Back
        // 一下到 fallback，再 Back 又能回到 feedback。和 profile-info-* / favorites
        // / settings 等其它兄弟 goBack 同款 replace:true 兜底。
        void navigate({ to: "/tabs/profile", replace: true });
      },
      "/tabs/profile",
    );

  const handleSubmit = async () => {
    // 新走查 R1：sync ref 守卫先于 React state 守卫——同帧双击 React state 同
    // 时是 false，两个 click 都过 `if (submitting) return;`，POST 重复 2 次。
    if (submitInFlightRef.current) return;
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
    submitInFlightRef.current = true;
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
          submitterPhone: cloudPhone || null,
          submitterEmail: cloudEmail || null,
        },
        cloudApiBaseUrl || undefined,
      );
      setTitle("");
      setDetail("");
      setCategory("bug");
      // 走查新一轮 R1：成功后清掉 sessionStorage 草稿 —— 否则下次用户进 feedback
      // 页又会看到刚提交过的草稿，以为没提交成功又重复发一次。
      try {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        /* noop */
      }
      setNotice({
        tone: "success",
        message: t(msg`反馈已提交，感谢你的支持`),
      });
      if (navTimeoutRef.current !== null) {
        clearTimeout(navTimeoutRef.current);
      }
      navTimeoutRef.current = setTimeout(() => {
        navTimeoutRef.current = null;
        // 走查 R1：success 后自动 navigate 缺 replace —— 用户从 profile 进 feedback
        // → 成功 → 1.5s 后 navigate（无 replace 多推一格）→ 落地 /tabs/profile
        // 但 history 是 [profile, feedback, profile]，Android Back / 浏览器后退
        // 又回到「已清空标题/详情」的 feedback 页，看起来像"提交完又被弹回来"。
        // 跟 cleanup history 的语义对齐：成功后不该把 feedback 留在 stack 里。
        void navigate({ to: "/tabs/profile", replace: true });
      }, 1500);
    } catch (error) {
      setNotice({
        tone: "danger",
        message: t(msg`提交失败：${describeRequestError(error)}`),
      });
    } finally {
      setSubmitting(false);
      submitInFlightRef.current = false;
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
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(250,245,237,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
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
                      ? "border-[color:var(--brand-primary)] bg-[rgba(245,158,11,0.10)] text-[color:var(--brand-primary)]"
                      : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-secondary)] active:bg-[color:var(--surface-card-hover)]",
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
            // text-[16px]: iOS Safari/WKWebView focus 时 <16px 会强制 viewport
            // zoom-in；反馈页又是一句话标题 + 一大段详情两连敲，缩放完用户
            // 还要双指捏才能回到原大小，几乎肯定会放弃。
            className="w-full rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2.5 text-[16px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--brand-primary)]"
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
            // text-[16px]: iOS Safari/WKWebView focus 时 <16px 会强制 viewport
            // zoom-in，详情这种长文本框 zoom 完用户基本看不到提交按钮。
            className="w-full resize-none rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2.5 text-[16px] leading-6 text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--brand-primary)]"
          />
        </section>

        {notice ? (
          // 走查 R1：notice 之前是裸 div，盲用/键盘用户提交失败时只能从禁用态
          // 推断结果，没有上下文。danger 用 role="alert"（隐含 aria-live=assertive
          // 立即打断当前朗读），success 用 role="status"（隐含 polite，待空隙朗读）。
          // 跟 account-security-panel.tsx / mobile-friend-moments-page.tsx 同款 a11y。
          <div
            role={notice.tone === "danger" ? "alert" : "status"}
            className={cn(
              "rounded-[12px] px-3 py-2 text-[12px]",
              notice.tone === "success"
                ? "bg-[rgba(245,158,11,0.08)] text-[color:var(--brand-primary)]"
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
              : "bg-[color:var(--brand-primary)] active:bg-[#0f6f33]",
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
