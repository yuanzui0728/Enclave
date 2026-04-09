import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { getWorldOwner, updateWorldOwner } from "@yinjie/contracts";
import { AppPage, AppSection, Button, InlineNotice, TextField } from "@yinjie/ui";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function OnboardingPage() {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);
  const storedName = useWorldOwnerStore((state) => state.username);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(storedName ?? "");
  }, [storedName]);

  useEffect(() => {
    let active = true;

    async function syncOwner() {
      try {
        const owner = await getWorldOwner(baseUrl);
        if (!active) {
          return;
        }
        hydrateOwner(owner);
        setName(owner.username ?? "");
      } catch {
        // Keep the form usable even if the instance is not reachable yet.
      }
    }

    void syncOwner();

    return () => {
      active = false;
    };
  }, [baseUrl, hydrateOwner]);

  async function submit() {
    const username = name.trim();
    if (!username) {
      setError("请告诉我你的名字");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const owner = await updateWorldOwner(
        {
          username,
          onboardingCompleted: true,
        },
        baseUrl,
      );
      hydrateOwner(owner);
      void navigate({ to: "/tabs/chat", replace: true });
    } catch (caught) {
      setError(describeRequestError(caught, "进入失败，请稍后重试。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppPage className="flex min-h-full flex-col items-center justify-center py-8 text-center">
      <AppSection className="w-full max-w-xl bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,246,232,0.94)_44%,rgba(240,251,245,0.96))] px-6 py-8">
        <div className="inline-flex rounded-full border border-[rgba(255,179,71,0.24)] bg-white/78 px-3 py-1 text-[11px] uppercase tracking-[0.32em] text-[color:var(--brand-secondary)]">
          世界主人
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-[0.08em] text-[color:var(--text-primary)]">
          给这片世界一个称呼你的方式
        </h1>
        <p className="mt-4 text-sm leading-7 text-[color:var(--text-secondary)]">
          从现在开始，角色会记住你的名字、你的节奏，也会围绕你继续展开新的故事。
        </p>

        <div className="mt-6 grid gap-3 text-left sm:grid-cols-3">
          <div className="rounded-[22px] bg-white/82 p-4 shadow-[var(--shadow-soft)]">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">更自然</div>
            <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">对话会直接围绕你的身份展开。</div>
          </div>
          <div className="rounded-[22px] bg-white/82 p-4 shadow-[var(--shadow-soft)]">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">更亲近</div>
            <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">世界中的角色会更准确地回应你。</div>
          </div>
          <div className="rounded-[22px] bg-white/82 p-4 shadow-[var(--shadow-soft)]">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">更有归属感</div>
            <div className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">你的世界，从这一步开始真正属于你。</div>
          </div>
        </div>

        <div className="mt-8 rounded-[30px] border border-[color:var(--border-faint)] bg-white/84 p-5 text-left shadow-[var(--shadow-section)]">
          <TextField
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void submit();
              }
            }}
            placeholder="输入你希望世界如何称呼你"
            className="text-center text-base"
            autoFocus
          />
          {error ? (
            <InlineNotice className="mt-3" tone="danger">
              {error}
            </InlineNotice>
          ) : null}
          <Button
            onClick={() => void submit()}
            disabled={loading || !name.trim()}
            variant="primary"
            size="lg"
            className="mt-4 w-full rounded-2xl"
          >
            {loading ? "进入中..." : "从这里开始"}
          </Button>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-[color:var(--text-muted)]">
          <Link to="/legal/privacy" className="transition hover:text-[color:var(--text-primary)]">
            隐私政策
          </Link>
          <Link to="/legal/terms" className="transition hover:text-[color:var(--text-primary)]">
            用户协议
          </Link>
          <Link to="/legal/community" className="transition hover:text-[color:var(--text-primary)]">
            社区规范
          </Link>
        </div>
      </AppSection>
    </AppPage>
  );
}
