import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { MobileFavoritesPage } from "./mobile-favorites-page";

export function ProfileFavoritesPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();

  useEffect(() => {
    if (isDesktopLayout) {
      void navigate({ to: "/tabs/favorites", replace: true });
    }
  }, [isDesktopLayout, navigate]);

  if (isDesktopLayout) return null;
  return <MobileFavoritesPage showBackButton />;
}
