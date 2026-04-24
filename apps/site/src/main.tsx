import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { AppLocaleProvider } from "@yinjie/i18n";
import "@yinjie/ui/tokens.css";
import "./index.css";
import { router } from "./router";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppLocaleProvider
      surface="site"
      fallback={<div className="site-loading">隐界</div>}
    >
      <RouterProvider router={router} />
    </AppLocaleProvider>
  </React.StrictMode>,
);
