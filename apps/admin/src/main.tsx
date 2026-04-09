import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import "@yinjie/ui/tokens.css";
import "./index.css";
import { queryClient } from "./lib/query-client";
import { configureAdminContractsRuntime } from "./lib/core-api-base";
import { router } from "./router";

configureAdminContractsRuntime();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
