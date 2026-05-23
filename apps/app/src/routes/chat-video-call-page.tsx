import { useEffect } from "react";
import { msg } from "@lingui/macro";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import { RouteRedirectState } from "../components/route-redirect-state";
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

  return <MobileChatVideoCallUnavailableRedirect conversationId={conversationId} />;
}

// 视频通话功能未上线：mobile 端原本会 mount MobileAiCallScreen 进入半成品的
// 通话屏，现在直接重定向回 /chat/$conversationId 并带 ?callUnavailable=video，
// conversation-thread-panel 会消费 query 弹「敬请期待」dialog 并把 query 抹掉。
// 镜像桌面端 DesktopChatRouteRedirectShell 的过渡 UX。
function MobileChatVideoCallUnavailableRedirect({
  conversationId,
}: {
  conversationId: string;
}) {
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });

  useEffect(() => {
    void navigate({
      to: "/chat/$conversationId",
      params: { conversationId },
      search: { callUnavailable: "video" },
      replace: true,
      ...(hash ? { hash } : {}),
    });
  }, [conversationId, hash, navigate]);

  return (
    <RouteRedirectState
      title={t(msg`视频通话功能开发中`)}
      description={t(msg`该功能暂未开放，敬请期待。`)}
      loadingLabel={t(msg`正在返回聊天...`)}
    />
  );
}
