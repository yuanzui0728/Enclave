import { useParams } from "@tanstack/react-router";
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import { MobileGroupCallScreen } from "../features/chat/mobile-group-call-screen";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

export function GroupVideoCallPage() {
  const { groupId } = useParams({
    from: "/group/$groupId/video-call",
  });
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={groupId}
        title="正在返回群聊工作区"
        description="桌面端群视频通话入口已经收口到聊天工作区，先回到对应群聊。"
        loadingLabel="正在切换到桌面群聊..."
      />
    );
  }

  return <MobileGroupCallScreen mode="video" />;
}
