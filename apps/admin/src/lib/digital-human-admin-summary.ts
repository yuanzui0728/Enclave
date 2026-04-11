import type { SystemStatus } from "@yinjie/contracts";

type DigitalHumanGateway = SystemStatus["digitalHumanGateway"];

export function buildDigitalHumanAdminSummary(
  digitalHumanGateway?: DigitalHumanGateway,
) {
  const gateway = digitalHumanGateway ?? {
    mode: "mock_iframe" as const,
    ready: false,
    playerTemplateConfigured: false,
    callbackTokenConfigured: false,
    paramsValid: true,
    paramsCount: 0,
    paramsKeys: [] as string[],
    message: "等待系统状态返回数字人 provider 配置。",
    healthy: false,
    provider: "mock_digital_human" as const,
  };

  const statusLabel =
    gateway.mode === "external_iframe"
      ? gateway.ready
        ? "可联调"
        : !gateway.playerTemplateConfigured
          ? "缺模板"
          : !gateway.callbackTokenConfigured
            ? "缺回调"
            : !gateway.paramsValid
              ? "参数无效"
              : "待配置"
      : "模拟";

  const description =
    gateway.mode === "external_iframe" && !gateway.playerTemplateConfigured
      ? "外部数字人播放器模板还没配好，当前视频页只能停留在占位链路。"
      : gateway.mode === "external_iframe" && !gateway.callbackTokenConfigured
        ? "外部播放器地址已具备，但 provider-state 回写鉴权还没配齐，画面就绪状态不稳定。"
        : gateway.mode === "external_iframe" && !gateway.paramsValid
          ? "扩展参数 JSON 当前无效，外部数字人实例参数没有成功注入到播放器模板。"
          : gateway.mode === "external_iframe" && gateway.ready
            ? gateway.paramsCount > 0
              ? `外部数字人 Provider 已就绪，当前模板会注入 ${gateway.paramsCount} 个上游参数。`
              : "外部数字人 Provider 已就绪，当前可以直接联调真实播放器和状态回写。"
            : gateway.mode === "mock_stage"
              ? "当前仍在内置数字人舞台模式，适合先验证会话、语音和状态链路。"
              : gateway.mode === "mock_iframe"
                ? "当前仍在内置数字人播放器模式，播放器壳已接通，但还不是真实外部数字人。"
                : gateway.message;

  const nextStep =
    gateway.mode === "external_iframe" && !gateway.playerTemplateConfigured
      ? "下一步先到设置页补 `playerUrlTemplate`。"
      : gateway.mode === "external_iframe" && !gateway.callbackTokenConfigured
        ? "下一步补 `callbackToken`，让 provider-state 回调进入可鉴权状态。"
        : gateway.mode === "external_iframe" && !gateway.paramsValid
          ? "下一步修正 `providerParams` JSON，再重试外部视频通话联调。"
          : gateway.mode === "external_iframe" && gateway.ready
            ? "下一步直接发起一次真实数字人视频通话，核对回调和画面切换。"
            : gateway.mode === "mock_stage"
              ? "下一步把模式切到 external_iframe，并补真实播放器模板。"
              : "下一步补外部 provider 模板和回调，把内置播放器替换成真实数字人服务。";

  return {
    ready: gateway.ready,
    statusLabel,
    modeLabel: formatDigitalHumanAdminMode(gateway.mode),
    description,
    nextStep,
    templateStatus: gateway.playerTemplateConfigured ? "已配置" : "未配置",
    templateDetail: gateway.playerTemplateConfigured
      ? gateway.mode === "external_iframe"
        ? "系统状态已检测到外部播放器模板。"
        : "当前模式不依赖外部播放器模板。"
      : "进入设置页补齐播放器 URL 模板",
    callbackTokenStatus: gateway.callbackTokenConfigured ? "已设置" : "未设置",
    callbackTokenDetail: gateway.callbackTokenConfigured
      ? "provider-state 回调可走鉴权。"
      : "未设置时，provider-state 回调不会附带保护 token。",
    paramsStatus: gateway.paramsValid ? String(gateway.paramsCount) : "无效",
    paramsDetail: gateway.paramsValid
      ? gateway.paramsCount
        ? `${gateway.paramsKeys.slice(0, 3).join(" / ")}${gateway.paramsCount > 3 ? " ..." : ""}`
        : "当前没有扩展参数 JSON。"
      : "扩展参数 JSON 解析失败。",
  };
}

export function formatDigitalHumanAdminMode(mode: string) {
  switch (mode) {
    case "mock_stage":
      return "内置舞台";
    case "mock_iframe":
      return "内置 iframe";
    case "external_iframe":
      return "外部 iframe";
    default:
      return mode || "未设置";
  }
}
