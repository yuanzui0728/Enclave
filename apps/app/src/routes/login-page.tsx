import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { loginUser } from "@yinjie/contracts";
import { AppPage, AppSection, Button, InlineNotice, TextField } from "@yinjie/ui";
import { useSessionStore } from "../store/session-store";

export function LoginPage() {
  const navigate = useNavigate();
  const hydrateSession = useSessionStore((state) => state.hydrateSession);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const canSubmit = username.trim() && password.trim();

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const session = await loginUser({ username, password });
      hydrateSession(session);
      navigate({ to: "/tabs/chat", replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppPage className="flex min-h-full flex-col justify-center">
      <AppSection className="bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(13,22,35,0.72))] px-6 py-8">
        <div className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--text-muted)]">已有入口</div>
        <h1 className="mt-4 text-3xl font-semibold text-white">回到隐界</h1>
        <div className="mt-8 space-y-3">
          <TextField
          placeholder="用户名"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
          <TextField
          type="password"
          placeholder="密码"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        </div>
        {error ? <InlineNotice className="mt-3" tone="danger">{error}</InlineNotice> : null}
        <Button
          onClick={() => void submit()}
          disabled={loading || !canSubmit}
          variant="primary"
          size="lg"
          className="mt-5 w-full rounded-2xl"
        >
          {loading ? "登录中..." : "登录"}
        </Button>
      </AppSection>
    </AppPage>
  );
}
