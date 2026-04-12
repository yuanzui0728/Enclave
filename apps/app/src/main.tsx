import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import "@yinjie/ui/tokens.css";
import "./index.css";
import { BootstrapScreen } from "./components/bootstrap-screen";
import { queryClient } from "./lib/query-client";
import { configureContractsRuntime } from "./lib/runtime-config";
import { router } from "./router";
import { hydrateNativeRuntimeConfig } from "./runtime/runtime-config-store";

async function bootstrap() {
  await hydrateNativeRuntimeConfig();
  configureContractsRuntime();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<BootstrapScreen />}>
          <RouterProvider router={router} />
        </Suspense>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
