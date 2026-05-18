import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { init as initAnalytics, track } from "@yinjie/analytics";
import { AppLocaleProvider } from "@yinjie/i18n";
import { LoadingBlock, TelemetryErrorBoundary } from "@yinjie/ui";
import "@yinjie/ui/tokens.css";
import "./index.css";
import { queryClient } from "./lib/query-client";
import { router } from "./router";

if (typeof window !== "undefined") {
  initAnalytics({
    appId: "wiki",
    endpoint: `${window.location.origin}/telemetry/events/batch`,
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TelemetryErrorBoundary
      onError={(error, info) => {
        const err = error instanceof Error ? error : null;
        track("react_render_error", {
          message: err?.message ?? String(error).slice(0, 1000),
          name: err?.name ?? null,
          stack: err?.stack?.slice(0, 2000) ?? null,
          componentStack: info.componentStack?.slice(0, 2000) ?? null,
        });
      }}
    >
      <AppLocaleProvider
        surface="wiki"
        fallback={<LoadingBlock className="m-6" label="加载中..." />}
      >
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AppLocaleProvider>
    </TelemetryErrorBoundary>
  </React.StrictMode>,
);
