import { Outlet } from "@tanstack/react-router";
import { AppShell } from "./app-shell";
import { DesktopRuntimeGuard } from "./desktop-runtime-guard";
import { MobileNotificationLaunchBridge } from "./mobile-notification-launch-bridge";

export function RootLayout() {
  return (
    <AppShell>
      <DesktopRuntimeGuard />
      <MobileNotificationLaunchBridge />
      <Outlet />
    </AppShell>
  );
}
