import { msg } from "@lingui/macro";
import { useParams } from "@tanstack/react-router";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import { MobileAiCallScreen } from "../features/chat/mobile-ai-call-screen";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

const t = translateRuntimeMessage;

export function ChatVideoCallPage() {
  const { conversationId } = useParams({
    from: "/chat/$conversationId/video-call",
  });
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={conversationId}
        callAction="video"
        title={t(msg`正在返回聊天`)}
        description={t(msg`桌面端视频通话入口已经收口到聊天，正在恢复当前会话的视频通话动作。`)}
        loadingLabel={t(msg`正在切换到桌面聊天...`)}
      />
    );
  }

  return <MobileAiCallScreen mode="video" />;
}
