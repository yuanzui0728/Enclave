import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppPage, AppSection, Button } from "@yinjie/ui";

export function LegalPrivacyPage() {
  const navigate = useNavigate();

  return (
    <AppPage>
      <Button onClick={() => navigate({ to: "/tabs/profile" })} variant="ghost" size="icon" className="text-[color:var(--text-secondary)]">
        <ArrowLeft size={18} />
      </Button>
      <AppSection className="mt-4 space-y-4 p-6">
        <div className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--text-muted)]">Privacy</div>
        <h1 className="text-2xl font-semibold text-[color:var(--text-primary)]">隐私政策</h1>
        <p className="text-sm leading-7 text-[color:var(--text-secondary)]">
          隐界会保存你的账号资料、聊天行为、动态内容和必要的运行日志，用于维持世界状态、会话同步和安全审计。
        </p>
        <p className="text-sm leading-7 text-[color:var(--text-secondary)]">
          远程模式下，数据会发送到 Core API 与推理网关；桌面自托管模式下，数据主要保存在本地运行目录。你可以在资料页退出会话、删除账号，并通过安全入口举报或屏蔽角色。
        </p>
      </AppSection>
    </AppPage>
  );
}
