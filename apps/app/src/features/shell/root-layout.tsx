import { Outlet } from "@tanstack/react-router";
import { AppShell } from "./app-shell";
import { ConversationStrongReminderHost } from "./conversation-strong-reminder-host";
import { DesktopRuntimeGuard } from "./desktop-runtime-guard";
import { MobileNotificationLaunchBridge } from "./mobile-notification-launch-bridge";

export function RootLayout() {
  return (
    <AppShell>
      <DesktopRuntimeGuard />
      <ConversationStrongReminderHost />
      <MobileNotificationLaunchBridge />
      <Outlet />
    </AppShell>
  );
}
