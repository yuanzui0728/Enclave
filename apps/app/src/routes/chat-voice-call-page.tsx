import { useParams } from "@tanstack/react-router";
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import { MobileAiCallScreen } from "../features/chat/mobile-ai-call-screen";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

export function ChatVoiceCallPage() {
  const { conversationId } = useParams({
    from: "/chat/$conversationId/voice-call",
  });
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={conversationId}
        title="正在返回聊天工作区"
        description="桌面端语音通话入口已经收口到聊天工作区，先回到对应会话。"
        loadingLabel="正在切换到桌面聊天..."
      />
    );
  }

  return <MobileAiCallScreen mode="voice" />;
}
