import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation } from "@tanstack/react-router";
import { getSystemStatus } from "@yinjie/contracts";
import { AdminShell } from "./admin-shell";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";
import { DesktopRuntimeGuard } from "./desktop-runtime-guard";
import { getAdminSecret, setAdminSecret } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

export function RootLayout() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const [secret, setSecret] = useState(getAdminSecret);
  const [editingSecret, setEditingSecret] = useState(!getAdminSecret());
  const [draft, setDraft] = useState(getAdminSecret);

  const statusQuery = useQuery({
    queryKey: ["admin-shell-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
    retry: false,
  });

  const routeMeta = useMemo(() => resolveRouteMeta(location.pathname), [location.pathname]);
  const characterContext = useMemo(() => resolveCharacterContext(location.pathname), [location.pathname]);

  function saveSecret() {
    setAdminSecret(draft);
    setSecret(draft);
    setEditingSecret(false);
    void queryClient.invalidateQueries();
  }

  return (
    <>
      <DesktopRuntimeGuard />
      <AdminShell
        sidebar={
          <AdminSidebar
            secret={secret}
            editingSecret={editingSecret}
            draft={draft}
            onDraftChange={setDraft}
            onSaveSecret={saveSecret}
            onEditSecret={() => setEditingSecret(true)}
            coreApiHealthy={Boolean(statusQuery.data?.coreApi.healthy)}
            providerReady={Boolean(statusQuery.data?.inferenceGateway.activeProvider)}
            ownerCount={statusQuery.data?.worldSurface.ownerCount ?? null}
            navLinks={NAV_ITEMS}
            contextTitle={characterContext ? "角色工作区" : undefined}
            contextLinks={characterContext?.links}
          />
        }
        topbar={
          <AdminTopbar
            eyebrow={routeMeta.eyebrow}
            title={routeMeta.title}
            description={routeMeta.description}
          />
        }
      >
        <Outlet />
      </AdminShell>
    </>
  );
}

const NAV_ITEMS = [
  { to: "/", label: "运行总览", hint: "先看实例健康、异常和下一步。" },
  { to: "/setup", label: "实例设置", hint: "处理接口、模型和运行时准备。" },
  { to: "/characters", label: "角色中心", hint: "查看角色名册、工厂和运行逻辑。" },
  { to: "/reply-logic", label: "回复逻辑", hint: "排查真实回复链路和全局规则。" },
  { to: "/evals", label: "评测分析", hint: "集中看 runs、对比和 trace。" },
] as const;

function resolveRouteMeta(pathname: string) {
  if (pathname === "/") {
    return {
      eyebrow: "运行总览",
      title: "实例运营首页",
      description: "从这里判断实例健康度、异常优先级以及下一步进入哪个工作区。",
    };
  }

  if (pathname === "/setup") {
    return {
      eyebrow: "实例设置",
      title: "运行准备与模型配置",
      description: "先确认远程 API 和世界实例状态，再补齐推理服务配置。",
    };
  }

  if (pathname === "/characters") {
    return {
      eyebrow: "角色中心",
      title: "角色名册与工作入口",
      description: "在一个工作区里完成角色筛选、摘要查看和快捷跳转。",
    };
  }

  if (pathname.startsWith("/characters/") && pathname.endsWith("/factory")) {
    return {
      eyebrow: "角色工厂",
      title: "角色制造与发布",
      description: "整理配方、比对发布差异，并把草稿发布到运行时。",
    };
  }

  if (pathname.startsWith("/characters/") && pathname.endsWith("/runtime")) {
    return {
      eyebrow: "角色运行逻辑台",
      title: "角色当前状态与可观测性",
      description: "查看这个角色现在如何运行，并在同一页面完成人工干预。",
    };
  }

  if (pathname.startsWith("/characters/")) {
    return {
      eyebrow: "角色编辑",
      title: "角色资料编辑",
      description: "按模块整理基础资料、人格设定与行为约束，减少长表单迷路感。",
    };
  }

  if (pathname === "/reply-logic") {
    return {
      eyebrow: "回复逻辑",
      title: "世界级回复调试台",
      description: "围绕角色、会话和全局规则排查回复链路，而不是在长页面里找模块。",
    };
  }

  if (pathname === "/evals") {
    return {
      eyebrow: "评测分析",
      title: "评测运行与 Trace 工作台",
      description: "集中查看 runs、compare 和 trace，逐步收口成更清晰的多视图结构。",
    };
  }

  return {
    eyebrow: "管理后台",
    title: "运营工作台",
    description: "围绕实例运行、角色运营和回复分析组织后台操作。",
  };
}

function resolveCharacterContext(pathname: string) {
  const matched = pathname.match(/^\/characters\/([^/]+)(?:\/(factory|runtime))?$/);
  if (!matched) {
    return null;
  }

  const characterId = matched[1];
  if (characterId === "new") {
    return null;
  }

  const activeSegment = matched[2] ?? "profile";

  return {
    links: [
      {
        label: "基础资料",
        href: `/characters/${characterId}`,
        active: activeSegment === "profile",
      },
      {
        label: "角色工厂",
        href: `/characters/${characterId}/factory`,
        active: activeSegment === "factory",
      },
      {
        label: "运行逻辑台",
        href: `/characters/${characterId}/runtime`,
        active: activeSegment === "runtime",
      },
    ],
  };
}
