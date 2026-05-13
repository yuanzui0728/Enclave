import { lazy, Suspense } from "react";
import { Outlet } from "@tanstack/react-router";
import { RouteTransitionIndicator } from "../../components/route-transition-indicator";
import { AppShell } from "./app-shell";
import { DesktopRuntimeGuard } from "./desktop-runtime-guard";
import { MobileNotificationLaunchBridge } from "./mobile-notification-launch-bridge";
import { SubscriptionExpiredDialogHost } from "../subscription/subscription-expired-dialog-host";

// ConversationStrongReminderHost 静态依赖 lib/socket → socket.io-client (~36KB)，
// 之前把整条 socket 链拉进首屏 modulepreload。组件本身 return null（纯 useEffect
// 注册全局监听），lazy 化 + null fallback 对体验零影响，但 socket.io-client 整条
// 链漂出首屏关键路径，公网 HTTP/1.1 下少 1 个 RTT 排队。
const ConversationStrongReminderHost = lazy(async () => {
  const mod = await import("./conversation-strong-reminder-host");
  return { default: mod.ConversationStrongReminderHost };
});

export function RootLayout() {
  return (
    <AppShell>
      <RouteTransitionIndicator />
      <DesktopRuntimeGuard />
      <Suspense fallback={null}>
        <ConversationStrongReminderHost />
      </Suspense>
      <SubscriptionExpiredDialogHost />
      <MobileNotificationLaunchBridge />
      <Outlet />
    </AppShell>
  );
}
