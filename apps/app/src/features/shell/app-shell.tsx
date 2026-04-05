import type { PropsWithChildren } from "react";
import { MobileShell } from "../../components/mobile-shell";

export function AppShell({ children }: PropsWithChildren) {
  return <MobileShell>{children}</MobileShell>;
}
