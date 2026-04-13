import { DesktopUtilityShell } from "../desktop-utility-shell";
import { useDesktopLayout } from "../../shell/use-desktop-layout";

export function DesktopAddFriendWorkspace() {
  const isDesktopLayout = useDesktopLayout();

  if (!isDesktopLayout) {
    return null;
  }

  return (
    <DesktopUtilityShell
      title="添加朋友"
      subtitle="搜索隐界号或角色名，把世界角色加入通讯录。"
    >
      <div className="flex h-full items-center justify-center px-6 py-10">
        <div className="max-w-[420px] text-center text-sm leading-7 text-[color:var(--text-muted)]">
          桌面版添加朋友工作区正在接入搜索、结果卡和验证发送流程。
        </div>
      </div>
    </DesktopUtilityShell>
  );
}
