import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, Card, ErrorBlock, TextField } from "@yinjie/ui";
import { setSession } from "../lib/auth-store";
import { wikiApi } from "../lib/wiki-api";

export function RegisterPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await wikiApi.register(username, password);
      setSession(session.token, session.user);
      void navigate({ to: "/" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-md mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">注册</h1>
      <p className="text-sm text-[var(--text-muted)] mb-3">
        新账号默认为<strong className="mx-1">新人</strong>
        ，提交的编辑需经巡查员审核后生效。
      </p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-sm mb-1 block">用户名</span>
          <TextField
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={2}
          />
        </label>
        <label className="block">
          <span className="text-sm mb-1 block">密码</span>
          <TextField
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>
        {error && <ErrorBlock message={error} />}
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? "注册中..." : "注册"}
        </Button>
      </form>
    </Card>
  );
}
