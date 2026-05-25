import type { ReactNode } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";

export type BreadcrumbItem = {
  label: ReactNode;
  to?: string;
};

type RouteMeta = {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  parent?: { label: ReactNode; to: string };
};

export function resolveRouteMeta(pathname: string): RouteMeta {
  const t = translateRuntimeMessage;

  if (pathname === "/") {
    return {
      eyebrow: t(msg`运营控制台`),
      title: t(msg`实例状态与配置`),
      description: t(msg`接入检查、推理配置、数字人设置和运维操作的统一入口。`),
    };
  }

  if (pathname === "/setup") {
    return {
      eyebrow: t(msg`运行设置`),
      title: t(msg`运行时与 Provider 初始化`),
      description: t(
        msg`补齐推理 Provider、实例连通性和运行前置条件，确保后台操作与真实生成链路可用。`,
      ),
    };
  }

  if (pathname === "/characters") {
    return {
      eyebrow: t(msg`角色中心`),
      title: t(msg`角色名册与工作入口`),
      description: t(msg`在一个工作区里完成角色筛选、摘要查看和快捷跳转。`),
    };
  }

  if (pathname === "/inference") {
    return {
      eyebrow: t(msg`模型与路由`),
      title: t(msg`多模型账户与角色路由`),
      description: t(
        msg`集中管理多个 Provider 账户、模型目录、默认模型路由，以及批量安装模型人格角色。`,
      ),
    };
  }

  if (pathname === "/games") {
    return {
      eyebrow: t(msg`游戏目录`),
      title: t(msg`AI 游戏中心目录与来源结构`),
      description: t(
        msg`先承接 AI 游戏中心的目录、来源、运行模式和审核状态，后续再补详情、发布与运营能力。`,
      ),
    };
  }

  if (pathname === "/need-discovery") {
    return {
      eyebrow: t(msg`需求发现`),
      title: t(msg`角色缺口识别与自动加友`),
      description: t(
        msg`配置短周期和每日节奏的提示词、频率、角色生成策略，并查看运行记录与候选结果。`,
      ),
    };
  }

  if (pathname === "/followup-runtime") {
    return {
      eyebrow: t(msg`主动跟进`),
      title: t(msg`我自己回捞未闭环事项`),
      description: t(
        msg`配置 open loop 提取、推荐候选打分、我自己主动消息文案，并查看推荐后的打开、加好友和开聊动作。`,
      ),
    };
  }

  if (pathname === "/self-agent") {
    return {
      eyebrow: t(msg`Self Agent`),
      title: t(msg`我自己的 workspace 与 heartbeat`),
      description: t(
        msg`把"我自己"升级成主代理后，在这里查看 standing orders、workspace 文件、巡检结果和近期待处理事项。`,
      ),
    };
  }

  if (pathname === "/reminder-runtime") {
    return {
      eyebrow: t(msg`提醒运行时`),
      title: t(msg`小盯的任务、触发与轻提醒发圈`),
      description: t(
        msg`查看提醒角色当前在盯哪些事项、最近有没有真正提醒出去，以及晨间 / 晚间的长期习惯提醒是否稳定落地。`,
      ),
    };
  }

  if (pathname.startsWith("/characters/") && pathname.endsWith("/factory")) {
    return {
      eyebrow: t(msg`角色工厂`),
      title: t(msg`角色制造与发布`),
      description: t(msg`整理配方、比对发布差异，并把草稿发布到运行时。`),
      parent: { label: t(msg`角色中心`), to: "/characters" },
    };
  }

  if (pathname.startsWith("/characters/") && pathname.endsWith("/runtime")) {
    return {
      eyebrow: t(msg`角色运行逻辑台`),
      title: t(msg`角色当前状态与可观测性`),
      description: t(msg`查看这个角色现在如何运行，并在同一页面完成人工干预。`),
      parent: { label: t(msg`角色中心`), to: "/characters" },
    };
  }

  if (pathname.startsWith("/characters/")) {
    return {
      eyebrow: t(msg`角色编辑`),
      title: t(msg`角色资料编辑`),
      description: t(
        msg`按模块整理基础资料、人格设定与行为约束，减少长表单迷路感。`,
      ),
      parent: { label: t(msg`角色中心`), to: "/characters" },
    };
  }

  if (pathname === "/chat-records") {
    return {
      eyebrow: t(msg`聊天记录`),
      title: t(msg`世界样本与会话档案`),
      description: t(
        msg`集中查看世界主人与各角色的真实单聊历史、搜索命中上下文和会话级 Token 成本。`,
      ),
    };
  }

  if (pathname === "/behavior-records") {
    return {
      eyebrow: t(msg`用户行为`),
      title: t(msg`互动行为收集与分析`),
      description: t(
        msg`集中查看世界主人在朋友圈、广场、视频号的评论、点赞、转发、收藏、浏览、关注等真实互动行为。`,
      ),
    };
  }

  if (pathname === "/token-usage") {
    return {
      eyebrow: t(msg`Token 用量`),
      title: t(msg`AI 成本与请求账本`),
      description: t(
        msg`集中查看 Token 消耗、时间趋势、角色分布、预算预警和价格配置。`,
      ),
    };
  }

  if (pathname === "/reply-logic") {
    return {
      eyebrow: t(msg`回复逻辑`),
      title: t(msg`世界级回复调试台`),
      description: t(
        msg`围绕角色、会话和全局规则排查回复链路，而不是在长页面里找模块。`,
      ),
    };
  }

  if (pathname === "/action-runtime") {
    return {
      eyebrow: t(msg`真实世界动作`),
      title: t(msg`行动助理动作运行时`),
      description: t(
        msg`围绕动作识别、澄清、确认、连接器和执行轨迹查看真实世界动作能力。`,
      ),
    };
  }

  if (pathname === "/cyber-avatar") {
    return {
      eyebrow: t(msg`赛博分身`),
      title: t(msg`用户行为建模与 Prompt 投影`),
      description: t(
        msg`集中查看赛博分身如何从行为信号收敛成画像，再投影成后续世界内外可消费的提示词。`,
      ),
    };
  }

  if (pathname === "/real-world-sync") {
    return {
      eyebrow: t(msg`现实联动`),
      title: t(msg`角色现实世界同步与日更`),
      description: t(
        msg`集中查看每日外部信号、摘要 digest、scene patch 和现实发圈锚点。`,
      ),
    };
  }

  if (pathname === "/evals") {
    return {
      eyebrow: t(msg`评测分析`),
      title: t(msg`评测运行与 Trace 工作台`),
      description: t(
        msg`集中查看 runs、compare 和 trace，逐步收口成更清晰的多视图结构。`,
      ),
    };
  }

  return {
    eyebrow: t(msg`管理后台`),
    title: t(msg`运营工作台`),
    description: t(msg`围绕实例运行、角色运营和回复分析组织后台操作。`),
  };
}

export function resolveBreadcrumb(pathname: string): BreadcrumbItem[] {
  const t = translateRuntimeMessage;
  const meta = resolveRouteMeta(pathname);
  const items: BreadcrumbItem[] = [{ label: t(msg`后台`), to: "/" }];
  if (meta.parent) items.push({ label: meta.parent.label, to: meta.parent.to });
  items.push({ label: meta.title });
  return items;
}
