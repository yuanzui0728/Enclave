import type { SystemStatus } from "@yinjie/contracts";

type DigitalHumanGateway = SystemStatus["digitalHumanGateway"];

export function resolveDigitalHumanGatewayStatusCopy(
  gateway?: DigitalHumanGateway,
) {
  if (!gateway) {
    return null;
  }

  if (gateway.mode === "external_iframe" && !gateway.ready) {
    if (!gateway.playerTemplateConfigured) {
      return {
        statusLabel: "数字人模板未配置",
        statusHint:
          "当前外部数字人播放器模板还没配好，视频页只能停留在占位态或回退到内置链路。",
        noticeTone: "warning" as const,
        noticeMessage:
          "外部数字人 `playerUrlTemplate` 未配置。先到 Admin 的数字人 Provider 配置里补播放器模板，再回来联调视频通话。",
      };
    }

    if (!gateway.callbackTokenConfigured) {
      return {
        statusLabel: "数字人回调未配置",
        statusHint:
          "当前外部播放器地址已经具备，但 provider 侧状态回写还没配齐，前端无法稳定拿到画面就绪结果。",
        noticeTone: "warning" as const,
        noticeMessage:
          "数字人 Provider 回调 token 未配置。建议先补 `callbackToken`，否则外部播放器很难把渲染状态稳定回写到当前会话。",
      };
    }

    if (!gateway.paramsValid) {
      return {
        statusLabel: "数字人参数无效",
        statusHint:
          "当前 provider 参数 JSON 解析失败，播放器模板虽然存在，但外部数字人实例参数没有成功注入。",
        noticeTone: "warning" as const,
        noticeMessage:
          "数字人 Provider 参数 JSON 无效。先回 Admin 修正 `providerParams`，确认 JSON 合法后再重试外部数字人视频通话。",
      };
    }

    return {
      statusLabel: "数字人待配置",
      statusHint:
        "当前外部数字人 Provider 还没进入可联调状态，视频页会先保持占位并等待上游配置完成。",
      noticeTone: "warning" as const,
      noticeMessage: gateway.message,
    };
  }

  if (gateway.mode === "external_iframe") {
    return {
      statusLabel: "外部数字人已就绪",
      statusHint:
        gateway.paramsCount > 0
          ? `当前外部数字人 Provider 已就绪，已注入 ${gateway.paramsCount} 个上游参数，后续会优先展示 provider 画面。`
          : "当前外部数字人 Provider 已就绪，后续会优先展示 provider 画面和回调状态。",
      noticeTone: "info" as const,
      noticeMessage:
        gateway.paramsKeys.length > 0
          ? `外部数字人 Provider 已接通，当前模板参数：${gateway.paramsKeys.join(" / ")}。`
          : gateway.message,
    };
  }

  if (gateway.mode === "mock_stage") {
    return {
      statusLabel: "数字人模拟模式",
      statusHint:
        "当前仍在内置数字人舞台模式，回复链路可用，但还没有切到真实外部视频流。",
      noticeTone: "info" as const,
      noticeMessage:
        "当前视频通话使用内置数字人舞台承载，适合先验证会话、语音和状态链路。",
    };
  }

  return {
    statusLabel: "数字人内置播放器",
    statusHint:
      "当前仍在内置数字人播放器模式，播放器壳已经接通，但尚未切到真实外部数字人 Provider。",
    noticeTone: "info" as const,
    noticeMessage:
      "当前视频通话使用内置数字人播放器协议，占位链路可用，但上游仍不是外部真实数字人服务。",
  };
}
