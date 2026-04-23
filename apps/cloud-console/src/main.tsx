import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { AppLocaleProvider } from "@yinjie/i18n";
import { LoadingBlock } from "@yinjie/ui";
import "@yinjie/ui/tokens.css";
import "./index.css";
import { queryClient } from "./lib/query-client";
import { router } from "./router";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppLocaleProvider
      surface="cloud-console"
      fallback={<LoadingBlock className="m-6" />}
    >
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppLocaleProvider>
  </React.StrictMode>,
);
