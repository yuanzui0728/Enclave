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
import { buildDigitalHumanAdminSummary } from "../lib/digital-human-admin-summary";

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
  const digitalHumanSummary = useMemo(
    () => buildDigitalHumanAdminSummary(statusQuery.data?.digitalHumanGateway),
    [statusQuery.data?.digitalHumanGateway],
  );
  const shellStatus = useMemo(() => {
    if (statusQuery.isError) {
      return {
        label: "实例状态待确认",
        tone: "warning" as const,
        detailLabel: "数字人与运行状态尚未同步",
      };
    }

    if (!statusQuery.data) {
      return {
        label: "正在读取实例状态",
        tone: "muted" as const,
        detailLabel: "正在同步数字人、推理和世界状态",
      };
    }

    const issues = [
      !statusQuery.data.coreApi.healthy ? "核心接口待恢复" : null,
      !statusQuery.data.inferenceGateway.activeProvider ? "推理服务待配置" : null,
      (statusQuery.data.worldSurface.ownerCount ?? 0) !== 1
        ? "世界主人数量异常"
        : null,
      !digitalHumanSummary.ready
        ? `数字人${digitalHumanSummary.statusLabel}`
        : null,
    ].filter((item): item is string => Boolean(item));

    const issueCount = issues.length;

    if (issueCount > 0) {
      return {
        label: `${issueCount} 项待处理`,
        tone: "warning" as const,
        detailLabel:
          issueCount === 1 ? issues[0] : `${issues[0]}，其中 ${issues[issues.length - 1]}`,
      };
    }

    return {
      label: "实例已就绪",
      tone: "healthy" as const,
      detailLabel: `数字人${digitalHumanSummary.statusLabel}`,
    };
  }, [digitalHumanSummary.ready, digitalHumanSummary.statusLabel, statusQuery.data, statusQuery.isError]);

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
            digitalHumanSummary={digitalHumanSummary}
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
            statusLabel={shellStatus.label}
            statusTone={shellStatus.tone}
            statusDetailLabel={shellStatus.detailLabel}
          />
        }
      >
        <Outlet />
      </AdminShell>
    </>
  );
}

const NAV_ITEMS = [
  { to: "/", label: "运行总览" },
  { to: "/setup", label: "实例设置" },
  { to: "/characters", label: "角色中心" },
  { to: "/reply-logic", label: "回复逻辑" },
  { to: "/evals", label: "评测分析" },
] as const;

function resolveRouteMeta(pathname: string) {
  if (pathname === "/") {
    return { eyebrow: "运行总览", title: "实例运营首页" };
  }

  if (pathname === "/setup") {
    return { eyebrow: "实例设置", title: "运行准备与模型配置" };
  }

  if (pathname === "/characters") {
    return { eyebrow: "角色中心", title: "角色名册与工作入口" };
  }

  if (pathname.startsWith("/characters/") && pathname.endsWith("/factory")) {
    return { eyebrow: "角色工厂", title: "角色制造与发布" };
  }

  if (pathname.startsWith("/characters/") && pathname.endsWith("/runtime")) {
    return { eyebrow: "角色运行逻辑台", title: "角色当前状态与可观测性" };
  }

  if (pathname.startsWith("/characters/")) {
    return { eyebrow: "角色编辑", title: "角色资料编辑" };
  }

  if (pathname === "/reply-logic") {
    return { eyebrow: "回复逻辑", title: "世界级回复调试台" };
  }

  if (pathname === "/evals") {
    return { eyebrow: "评测分析", title: "评测运行与 Trace 工作台" };
  }

  return { eyebrow: "管理后台", title: "运营工作台" };
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
