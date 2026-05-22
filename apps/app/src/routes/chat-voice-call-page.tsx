import { msg } from "@lingui/macro";
import { useParams } from "@tanstack/react-router";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import { MobileAiCallScreen } from "../features/chat/mobile-ai-call-screen";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

const t = translateRuntimeMessage;

export function ChatVoiceCallPage() {
  const { conversationId } = useParams({
    from: "/chat/$conversationId/voice-call",
  });
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={conversationId}
        callAction="voice"
        title={t(msg`正在返回聊天`)}
        description={t(msg`桌面端语音通话入口已经收口到聊天，正在恢复当前会话的语音通话动作。`)}
        loadingLabel={t(msg`正在切换到桌面聊天...`)}
      />
    );
  }

  return <MobileAiCallScreen mode="voice" />;
}
