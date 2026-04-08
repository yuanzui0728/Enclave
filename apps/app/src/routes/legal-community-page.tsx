import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppPage, AppSection, Button } from "@yinjie/ui";

export function LegalCommunityPage() {
  const navigate = useNavigate();

  return (
    <AppPage>
      <Button onClick={() => navigate({ to: "/tabs/profile" })} variant="ghost" size="icon" className="text-[color:var(--text-secondary)]">
        <ArrowLeft size={18} />
      </Button>
      <AppSection className="mt-4 space-y-4 p-6">
        <div className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--text-muted)]">Safety</div>
        <h1 className="text-2xl font-semibold text-[color:var(--text-primary)]">社区与安全说明</h1>
        <p className="text-sm leading-7 text-[color:var(--text-secondary)]">
          如果你遇到骚扰、不适、误导或越界内容，可以在角色详情页、聊天页和资料页发起举报，也可以直接屏蔽角色。
        </p>
        <p className="text-sm leading-7 text-[color:var(--text-secondary)]">
          屏蔽后，对应角色将不再出现在新的好友申请和发现路径中；举报会保留在安全记录里，供后续审核与处理。
        </p>
      </AppSection>
    </AppPage>
  );
}
