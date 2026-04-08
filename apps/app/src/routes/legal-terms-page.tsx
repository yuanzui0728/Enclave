import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppPage, AppSection, Button } from "@yinjie/ui";

export function LegalTermsPage() {
  const navigate = useNavigate();

  return (
    <AppPage>
      <Button onClick={() => navigate({ to: "/tabs/profile" })} variant="ghost" size="icon" className="text-[color:var(--text-secondary)]">
        <ArrowLeft size={18} />
      </Button>
      <AppSection className="mt-4 space-y-4 p-6">
        <div className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--text-muted)]">Terms</div>
        <h1 className="text-2xl font-semibold text-[color:var(--text-primary)]">用户协议</h1>
        <p className="text-sm leading-7 text-[color:var(--text-secondary)]">
          你需要对自己发布的文字、评论、动态和举报内容负责，不得利用隐界发布违法、骚扰、仇恨、侵权或误导性内容。
        </p>
        <p className="text-sm leading-7 text-[color:var(--text-secondary)]">
          平台保留对违规内容做降级、限制互动、封禁角色关系和保留审计记录的权利。若你删除账号，当前会话会立即失效。
        </p>
      </AppSection>
    </AppPage>
  );
}
