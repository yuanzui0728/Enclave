import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { AppLocaleProvider } from "@yinjie/i18n";
import { LoadingBlock } from "@yinjie/ui";
import "@yinjie/ui/tokens.css";
import "./index.css";
import { queryClient } from "./lib/query-client";
import { applyAdminHashBootstrap } from "./lib/admin-hash-bootstrap";
import { configureAdminContractsRuntime } from "./lib/core-api-base";
import { initAdminDensity } from "./lib/use-density";
import { router } from "./router";
import { AdminBootstrapGate } from "./components/admin-bootstrap-gate";

// 先处理 #yinjie-bootstrap= hash（云控制台一键进后台），再让 contracts runtime
// 读 localStorage 拿 apiBaseUrl/admin secret，否则 gate 会先弹邮箱登录页。
applyAdminHashBootstrap();
configureAdminContractsRuntime();
initAdminDensity();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppLocaleProvider
      surface="admin"
      fallback={<LoadingBlock className="m-6" />}
    >
      <QueryClientProvider client={queryClient}>
        <AdminBootstrapGate>
          <RouterProvider router={router} />
        </AdminBootstrapGate>
      </QueryClientProvider>
    </AppLocaleProvider>
  </React.StrictMode>,
);
