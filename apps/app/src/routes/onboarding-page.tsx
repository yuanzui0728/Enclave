import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { initUser, completeOnboarding } from "@yinjie/contracts";
import { AppPage, AppSection, Button, InlineNotice, TextField } from "@yinjie/ui";
import { useSessionStore } from "../store/session-store";

export function OnboardingPage() {
  const navigate = useNavigate();
  const hydrateSession = useSessionStore((state) => state.hydrateSession);
  const markOnboardingComplete = useSessionStore((state) => state.completeOnboarding);
  const desktopSetupCompleted = useSessionStore((state) => state.desktopSetupCompleted);
  const desktopProviderConfigured = useSessionStore((state) => state.desktopProviderConfigured);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = name.trim();

  async function submit() {
    const username = name.trim();
    if (!username) {
      setError("请告诉我你的名字");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const session = await initUser({ username });
      hydrateSession(session);
      await completeOnboarding(session.userId);
      markOnboardingComplete();
      navigate({ to: "/tabs/chat", replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "进入失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppPage className="flex min-h-full flex-col items-center justify-center py-8 text-center">
      <AppSection className="w-full max-w-md bg-[linear-gradient(135deg,rgba(249,115,22,0.18),rgba(255,255,255,0.04)_44%,rgba(15,23,42,0.24)_100%)] px-6 py-8">
        <div className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--brand-secondary)]">我是引路人</div>
        <h1 className="mt-6 text-3xl font-semibold tracking-[0.16em] text-white">告诉我，你叫什么名字？</h1>
        <p className="mt-4 text-sm leading-7 text-[color:var(--text-secondary)]">这里暂时只有你。很快，会有人主动认识你。</p>

        {desktopSetupCompleted ? (
          <InlineNotice className="mt-6 text-left" tone={desktopProviderConfigured ? "success" : "warning"}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-white">桌面世界已准备</div>
              <div className="rounded-full bg-black/20 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white/80">
                {desktopProviderConfigured ? "provider ready" : "fallback mode"}
              </div>
            </div>
            <div className="mt-2 text-xs leading-6">
              {desktopProviderConfigured ? "当前聊天和动态会优先走真实推理链。" : "你已经可以进入，但聊天和动态暂时会使用 fallback 文案。"}
            </div>
            <Link to="/setup" className="mt-3 inline-block text-xs text-[color:var(--brand-secondary)]">
              返回首启页调整运行时配置
            </Link>
          </InlineNotice>
        ) : null}

        <div className="mt-8 rounded-[28px] border border-[color:var(--border-subtle)] bg-[rgba(7,12,20,0.44)] p-5 text-left">
          <TextField
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void submit();
            }
          }}
          placeholder="你的名字"
          className="text-center text-base"
          autoFocus
        />
        {error ? <InlineNotice className="mt-3" tone="danger">{error}</InlineNotice> : null}
        <Button
          onClick={() => void submit()}
          disabled={loading || !canSubmit}
          variant="primary"
          size="lg"
          className="mt-4 w-full rounded-2xl"
        >
          {loading ? "进入中..." : "推开这扇门"}
        </Button>
        </div>
      </AppSection>
    </AppPage>
  );
}
