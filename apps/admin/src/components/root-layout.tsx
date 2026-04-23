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

  const routeMeta = useMemo(
    () => resolveRouteMeta(location.pathname),
    [location.pathname],
  );
  const digitalHumanSummary = useMemo(
    () => buildDigitalHumanAdminSummary(statusQuery.data?.digitalHumanGateway),
    [statusQuery.data?.digitalHumanGateway],
  );
  const shellStatus = useMemo(() => {
    if (statusQuery.isError) {
      return {
        label: "实例状态待确认",
        tone: "warning" as const,
        detailLabel: "数字人、推理服务或实例连通性还未同步成功。",
      };
    }

    if (!statusQuery.data) {
      return {
        label: "正在读取实例状态",
        tone: "muted" as const,
        detailLabel: "正在同步远程 API、推理网关和世界表面状态。",
      };
    }

    const issues = [
      !statusQuery.data.coreApi.healthy ? "核心接口待恢复" : null,
      !statusQuery.data.inferenceGateway.activeProvider
        ? "推理服务待配置"
        : null,
      (statusQuery.data.worldSurface.ownerCount ?? 0) !== 1
        ? "世界主人数量异常"
        : null,
      !digitalHumanSummary.ready
        ? `数字人${digitalHumanSummary.statusLabel}`
        : null,
    ].filter((item): item is string => Boolean(item));

    if (issues.length > 0) {
      return {
        label: `${issues.length} 项待处理`,
        tone: "warning" as const,
        detailLabel:
          issues.length === 1
            ? issues[0]
            : `${issues[0]}，其余项也需要继续检查。`,
      };
    }

    return {
      label: "实例已就绪",
      tone: "healthy" as const,
      detailLabel: `数字人${digitalHumanSummary.statusLabel}`,
    };
  }, [
    digitalHumanSummary.ready,
    digitalHumanSummary.statusLabel,
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
            navLinks={NAV_ITEMS}
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
  {
    to: "/",
    label: "运行总览",
    hint: "实例健康、Provider、诊断和运维动作的统一入口。",
  },
  {
    to: "/characters",
    label: "角色中心",
    hint: "查看角色名册、角色工厂和运行逻辑台。",
  },
  {
    to: "/inference",
    label: "模型与路由",
    hint: "管理 Provider 账户、模型目录、默认路由和模型角色批量安装。",
  },
  {
    to: "/games",
    label: "游戏目录",
    hint: "查看 AI 游戏中心目录、来源结构和当前审核状态。",
  },
  {
    to: "/chat-records",
    label: "聊天记录",
    hint: "回看世界主人与角色的真实单聊样本、搜索命中和会话成本。",
  },
  {
    to: "/need-discovery",
    label: "需求发现",
    hint: "配置短期/长期角色生成策略，并查看候选与运行记录。",
  },
  {
    to: "/followup-runtime",
    label: "主动跟进",
    hint: "配置我自己回捞未闭环事项的规则、Prompt 和推荐链路。",
  },
  {
    to: "/token-usage",
    label: "Token 用量",
    hint: "查看 AI 请求、Token 花费、预算预警和价格配置。",
  },
  {
    to: "/action-runtime",
    label: "真实世界动作",
    hint: "查看 self 角色的动作门控、连接器、规则和执行轨迹。",
  },
  {
    to: "/cyber-avatar",
    label: "赛博分身",
    hint: "查看行为信号、画像状态、投影提示词与建模运行记录。",
  },
  {
    to: "/real-world-sync",
    label: "现实联动",
    hint: "查看角色现实新闻同步、每日 digest、scene patch 和现实发圈锚点。",
  },
  {
    to: "/evals",
    label: "评测分析",
    hint: "集中查看 runs、compare 和 trace。",
  },
] as const;

function resolveRouteMeta(pathname: string) {
  if (pathname === "/") {
    return {
      eyebrow: "运营控制台",
      title: "实例状态与配置",
      description: "接入检查、推理配置、数字人设置和运维操作的统一入口。",
    };
  }

  if (pathname === "/setup") {
    return {
      eyebrow: "运行设置",
      title: "运行时与 Provider 初始化",
      description:
        "补齐推理 Provider、实例连通性和运行前置条件，确保后台操作与真实生成链路可用。",
    };
  }

  if (pathname === "/characters") {
    return {
      eyebrow: "角色中心",
      title: "角色名册与工作入口",
      description: "在一个工作区里完成角色筛选、摘要查看和快捷跳转。",
    };
  }

  if (pathname === "/inference") {
    return {
      eyebrow: "模型与路由",
      title: "多模型账户与角色路由",
      description:
        "集中管理多个 Provider 账户、模型目录、默认模型路由，以及批量安装模型人格角色。",
    };
  }

  if (pathname === "/games") {
    return {
      eyebrow: "游戏目录",
      title: "AI 游戏中心目录与来源结构",
      description:
        "先承接 AI 游戏中心的目录、来源、运行模式和审核状态，后续再补详情、发布与运营能力。",
    };
  }

  if (pathname === "/need-discovery") {
    return {
      eyebrow: "需求发现",
      title: "角色缺口识别与自动加友",
      description:
        "配置短周期和每日节奏的提示词、频率、角色生成策略，并查看运行记录与候选结果。",
    };
  }

  if (pathname === "/followup-runtime") {
    return {
      eyebrow: "主动跟进",
      title: "我自己回捞未闭环事项",
      description:
        "配置 open loop 提取、推荐候选打分、我自己主动消息文案，并查看推荐后的打开、加好友和开聊动作。",
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

  if (pathname === "/chat-records") {
    return {
      eyebrow: "聊天记录",
      title: "世界样本与会话档案",
      description:
        "集中查看世界主人与各角色的真实单聊历史、搜索命中上下文和会话级 Token 成本。",
    };
  }

  if (pathname === "/token-usage") {
    return {
      eyebrow: "Token 用量",
      title: "AI 成本与请求账本",
      description:
        "集中查看 Token 消耗、时间趋势、角色分布、预算预警和价格配置。",
    };
  }

  if (pathname === "/reply-logic") {
    return {
      eyebrow: "回复逻辑",
      title: "世界级回复调试台",
      description:
        "围绕角色、会话和全局规则排查回复链路，而不是在长页面里找模块。",
    };
  }

  if (pathname === "/action-runtime") {
    return {
      eyebrow: "真实世界动作",
      title: "self 角色动作运行时",
      description:
        "围绕动作识别、澄清、确认、连接器和执行轨迹查看真实世界动作能力。",
    };
  }

  if (pathname === "/cyber-avatar") {
    return {
      eyebrow: "赛博分身",
      title: "用户行为建模与 Prompt 投影",
      description:
        "集中查看赛博分身如何从行为信号收敛成画像，再投影成后续世界内外可消费的提示词。",
    };
  }

  if (pathname === "/real-world-sync") {
    return {
      eyebrow: "现实联动",
      title: "角色现实世界同步与日更",
      description:
        "集中查看每日外部信号、摘要 digest、scene patch 和现实发圈锚点。",
    };
  }

  if (pathname === "/evals") {
    return {
      eyebrow: "评测分析",
      title: "评测运行与 Trace 工作台",
      description:
        "集中查看 runs、compare 和 trace，逐步收口成更清晰的多视图结构。",
    };
  }

  return {
    eyebrow: "管理后台",
    title: "运营工作台",
    description: "围绕实例运行、角色运营和回复分析组织后台操作。",
  };
}
