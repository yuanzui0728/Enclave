import { Outlet } from "@tanstack/react-router";
import { AppShell } from "./app-shell";
import { DesktopRuntimeGuard } from "./desktop-runtime-guard";

export function RootLayout() {
  return (
    <AppShell>
      <DesktopRuntimeGuard />
      <Outlet />
    </AppShell>
  );
}
