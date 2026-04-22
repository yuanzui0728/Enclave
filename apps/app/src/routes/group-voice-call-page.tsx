import { useParams } from "@tanstack/react-router";
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import { MobileGroupCallScreen } from "../features/chat/mobile-group-call-screen";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

export function GroupVoiceCallPage() {
  const { groupId } = useParams({
    from: "/group/$groupId/voice-call",
  });
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={groupId}
        callAction="voice"
        title="正在返回群聊工作区"
        description="桌面端群语音通话入口已经收口到聊天工作区，正在恢复当前群聊的语音通话动作。"
        loadingLabel="正在切换到桌面群聊..."
      />
    );
  }

  return <MobileGroupCallScreen mode="voice" />;
}
