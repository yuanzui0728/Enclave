import type { PropsWithChildren } from "react";
import { MobileShell } from "../../components/mobile-shell";
import { DesktopShell } from "./desktop-shell";
import { useDesktopLayout } from "./use-desktop-layout";

export function AppShell({ children }: PropsWithChildren) {
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return <DesktopShell>{children}</DesktopShell>;
  }

  return <MobileShell>{children}</MobileShell>;
}
