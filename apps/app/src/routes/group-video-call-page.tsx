import { useEffect } from "react";
import { msg } from "@lingui/macro";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import { RouteRedirectState } from "../components/route-redirect-state";
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

  return <MobileGroupVideoCallUnavailableRedirect groupId={groupId} />;
}

// 视频通话功能未上线：mobile 端原本会 mount MobileGroupCallScreen，现在直接
// 重定向回 /group/$groupId 并带 ?callUnavailable=video，group-chat-thread-panel
// 会消费 query 弹「敬请期待」dialog 并把 query 抹掉。和单聊路由同款。
function MobileGroupVideoCallUnavailableRedirect({
  groupId,
}: {
  groupId: string;
}) {
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });

  useEffect(() => {
    void navigate({
      to: "/group/$groupId",
      params: { groupId },
      search: { callUnavailable: "video" },
      replace: true,
      ...(hash ? { hash } : {}),
    });
  }, [groupId, hash, navigate]);

  return (
    <RouteRedirectState
      title={t(msg`视频通话功能开发中`)}
      description={t(msg`该功能暂未开放，敬请期待。`)}
      loadingLabel={t(msg`正在返回群聊...`)}
    />
  );
}
