import { useMemo, useState } from "react";
import { msg } from "@lingui/macro";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation } from "@tanstack/react-router";
import { getSystemStatus } from "@yinjie/contracts";
import { translateRuntimeMessage, useAppLocale } from "@yinjie/i18n";
import { AdminAutoTranslationBoundary } from "./admin-auto-translation-boundary";
import { AdminShell } from "./admin-shell";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";
import { DesktopRuntimeGuard } from "./desktop-runtime-guard";
import { getAdminSecret, setAdminSecret } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import { buildDigitalHumanAdminSummary } from "../lib/digital-human-admin-summary";
import { resolveBreadcrumb } from "../lib/route-breadcrumb";
import { useAdminDensity } from "../lib/use-density";

export function RootLayout() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { activationVersion, locale } = useAppLocale();
  const t = translateRuntimeMessage;
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const [secret, setSecret] = useState(getAdminSecret);
  const [editingSecret, setEditingSecret] = useState(!getAdminSecret());
  const [draft, setDraft] = useState(getAdminSecret);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { density, setDensity } = useAdminDensity();

  const statusQuery = useQuery({
    queryKey: ["admin-shell-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
    retry: false,
  });

  const breadcrumb = useMemo(
    () => resolveBreadcrumb(location.pathname),
    [activationVersion, locale, location.pathname],
  );
  const navGroups = useMemo(
    () => resolveNavItems(),
    [activationVersion, locale],
  );
  const activeGroupId = useMemo(
    () => findActiveGroupId(location.pathname, navGroups),
    [location.pathname, navGroups],
  );
  const digitalHumanSummary = useMemo(
    () => buildDigitalHumanAdminSummary(statusQuery.data?.digitalHumanGateway),
    [activationVersion, locale, statusQuery.data?.digitalHumanGateway],
  );
  const shellStatus = useMemo(() => {
    if (statusQuery.isError) {
      return {
        label: t(msg`实例状态待确认`),
        tone: "warning" as const,
        detailLabel: t(msg`数字人、推理服务或实例连通性还未同步成功。`),
      };
    }

    if (!statusQuery.data) {
      return {
        label: t(msg`正在读取实例状态`),
        tone: "muted" as const,
        detailLabel: t(msg`正在同步远程 API、推理网关和世界表面状态。`),
      };
    }

    const issues = [
      !statusQuery.data.coreApi.healthy ? t(msg`核心接口待恢复`) : null,
      !statusQuery.data.inferenceGateway.activeProvider
        ? t(msg`推理服务待配置`)
        : null,
      (statusQuery.data.worldSurface.ownerCount ?? 0) !== 1
        ? t(msg`世界主人数量异常`)
        : null,
      !digitalHumanSummary.ready
        ? t(msg`数字人${digitalHumanSummary.statusLabel}`)
        : null,
    ].filter((item): item is string => Boolean(item));

    if (issues.length > 0) {
      return {
        label: t(msg`${issues.length} 项待处理`),
        tone: "warning" as const,
        detailLabel:
          issues.length === 1
            ? issues[0]
            : t(msg`${issues[0]}，其余项也需要继续检查。`),
      };
    }

    return {
      label: t(msg`实例已就绪`),
      tone: "healthy" as const,
      detailLabel: t(msg`数字人${digitalHumanSummary.statusLabel}`),
    };
  }, [
    digitalHumanSummary.ready,
    digitalHumanSummary.statusLabel,
    activationVersion,
    locale,
    statusQuery.data,
    statusQuery.isError,
  ]);

  function saveSecret() {
    setAdminSecret(draft);
    setSecret(draft);
    setEditingSecret(false);
    void queryClient.invalidateQueries();
  }

  return (
    <>
      <DesktopRuntimeGuard />
      <AdminAutoTranslationBoundary>
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
              providerReady={Boolean(
                statusQuery.data?.inferenceGateway.activeProvider,
              )}
              digitalHumanSummary={digitalHumanSummary}
              ownerCount={statusQuery.data?.worldSurface.ownerCount ?? null}
              navGroups={navGroups}
              activeGroupId={activeGroupId}
            />
          }
          topbar={
            <AdminTopbar
              breadcrumb={breadcrumb}
              statusLabel={shellStatus.label}
              statusTone={shellStatus.tone}
              statusDetailLabel={shellStatus.detailLabel}
              density={density}
              onDensityChange={setDensity}
              onMobileNavOpen={() => setMobileNavOpen(true)}
            />
          }
          mobileNavOpen={mobileNavOpen}
          onCloseMobileNav={() => setMobileNavOpen(false)}
          pathname={location.pathname}
        >
          <Outlet />
        </AdminShell>
      </AdminAutoTranslationBoundary>
    </>
  );
}

function resolveNavItems() {
  const t = translateRuntimeMessage;

  return [
    {
      id: "ops",
      label: t(msg`运营`),
      iconName: "gauge" as const,
      items: [
        {
          to: "/" as const,
          label: t(msg`运行总览`),
          hint: t(msg`实例健康、Provider、诊断和运维动作的统一入口。`),
        },
        {
          to: "/setup" as const,
          label: t(msg`运行设置`),
          hint: t(msg`补齐推理 Provider、实例连通性和运行前置条件。`),
        },
        {
          to: "/token-usage" as const,
          label: t(msg`Token 用量`),
          hint: t(msg`查看 AI 请求、Token 花费、预算预警和价格配置。`),
        },
        {
          to: "/evals" as const,
          label: t(msg`评测分析`),
          hint: t(msg`集中查看 runs、compare 和 trace。`),
        },
      ],
    },
    {
      id: "characters",
      label: t(msg`角色与内容`),
      iconName: "users" as const,
      items: [
        {
          to: "/characters" as const,
          label: t(msg`角色中心`),
          hint: t(msg`查看角色名册、角色工厂和运行逻辑台。`),
        },
        {
          to: "/games" as const,
          label: t(msg`游戏目录`),
          hint: t(msg`查看 AI 游戏中心目录、来源结构和当前审核状态。`),
        },
        {
          to: "/chat-records" as const,
          label: t(msg`聊天记录`),
          hint: t(
            msg`回看世界主人与角色的真实单聊样本、搜索命中和会话成本。`,
          ),
        },
        {
          to: "/behavior-records" as const,
          label: t(msg`用户行为`),
          hint: t(
            msg`回看世界主人在朋友圈、广场、视频号的真实互动行为与分析。`,
          ),
        },
        {
          to: "/real-world-sync" as const,
          label: t(msg`现实联动`),
          roleBadge: t(msg`承接：界闻/联动角色`),
          hint: t(
            msg`查看角色现实新闻同步、每日 digest、scene patch 和现实发圈锚点。`,
          ),
        },
      ],
    },
    {
      id: "models",
      label: t(msg`智能与模型`),
      iconName: "sparkles" as const,
      items: [
        {
          to: "/inference" as const,
          label: t(msg`模型与路由`),
          hint: t(
            msg`管理 Provider 账户、模型目录、默认路由和模型角色批量安装。`,
          ),
        },
        {
          to: "/digital-human" as const,
          label: t(msg`数字人 Provider`),
          hint: t(
            msg`配置外部数字人播放器模板、回调 token 和扩展参数，把内置播放器替换成真实数字人服务。`,
          ),
        },
        {
          to: "/reply-logic" as const,
          label: t(msg`回复逻辑`),
          hint: t(msg`围绕角色、会话和全局规则排查回复链路。`),
        },
        {
          to: "/need-discovery" as const,
          label: t(msg`需求发现`),
          hint: t(msg`配置短期/长期角色生成策略，并查看候选与运行记录。`),
        },
        {
          to: "/cyber-avatar" as const,
          label: t(msg`赛博分身`),
          hint: t(msg`查看行为信号、画像状态、投影提示词与建模运行记录。`),
        },
      ],
    },
    {
      id: "runtimes",
      label: t(msg`运行时`),
      iconName: "cpu" as const,
      items: [
        {
          to: "/followup-runtime" as const,
          label: t(msg`主动跟进`),
          roleBadge: t(msg`承接：我自己`),
          hint: t(msg`配置我自己回捞未闭环事项的规则、Prompt 和推荐链路。`),
        },
        {
          to: "/self-agent" as const,
          label: t(msg`主代理`),
          roleBadge: t(msg`承接：我自己主代理`),
          hint: t(
            msg`查看 self-agent workspace、heartbeat、standing orders 和近期巡检记录。`,
          ),
        },
        {
          to: "/reminder-runtime" as const,
          label: t(msg`提醒运行时`),
          roleBadge: t(msg`承接：小盯`),
          hint: t(
            msg`查看小盯的活跃提醒、最近触发 / 完成、私聊出站与轻提醒发圈记录。`,
          ),
        },
        {
          to: "/action-runtime" as const,
          label: t(msg`真实世界动作`),
          roleBadge: t(msg`承接：行动助理`),
          hint: t(msg`查看行动助理的动作门控、连接器、规则和执行轨迹。`),
        },
      ],
    },
  ] as const;
}

export function findActiveGroupId(
  pathname: string,
  groups: ReturnType<typeof resolveNavItems>,
): string | null {
  for (const group of groups) {
    for (const item of group.items) {
      if (
        item.to === pathname ||
        (item.to !== "/" && pathname.startsWith(item.to + "/"))
      ) {
        return group.id;
      }
    }
  }
  if (pathname.startsWith("/characters/")) return "characters";
  return null;
}
