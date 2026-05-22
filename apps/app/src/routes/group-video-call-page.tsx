import { msg } from "@lingui/macro";
import { useParams } from "@tanstack/react-router";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import { MobileGroupCallScreen } from "../features/chat/mobile-group-call-screen";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

const t = translateRuntimeMessage;

export function GroupVideoCallPage() {
  const { groupId } = useParams({
    from: "/group/$groupId/video-call",
  });
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={groupId}
        callAction="video"
        title={t(msg`正在返回群聊`)}
        description={t(msg`桌面端群视频通话入口已经收口到聊天，正在恢复当前群聊的视频通话动作。`)}
        loadingLabel={t(msg`正在切换到桌面群聊...`)}
      />
    );
  }

  return <MobileGroupCallScreen mode="video" />;
}
