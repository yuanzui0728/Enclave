import { lazy } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { SiteShell } from "./site-shell";

const HomePage = lazy(async () => {
  const mod = await import("./routes/home-page");
  return { default: mod.HomePage };
});

const PrivacyPage = lazy(async () => {
  const mod = await import("./routes/legal-page");
  return { default: mod.PrivacyPage };
});

const TermsPage = lazy(async () => {
  const mod = await import("./routes/legal-page");
  return { default: mod.TermsPage };
});

const rootRoute = createRootRoute({
  component: SiteShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: PrivacyPage,
});

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terms",
  component: TermsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  privacyRoute,
  termsRoute,
]);

export const router = createRouter({
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
