import type { SystemStatus } from "@yinjie/contracts";

type DigitalHumanGateway = SystemStatus["digitalHumanGateway"];

export function resolveDigitalHumanEntryGuardCopy(
  gateway?: DigitalHumanGateway,
) {
  if (!gateway) {
    return null;
  }

  if (gateway.mode === "external_iframe" && !gateway.ready) {
    return {
      tone: "warning" as const,
      message: `当前数字人 Provider 未就绪。${gateway.message}。再次点击后仍可继续进入视频通话。`,
    };
  }

  if (gateway.mode === "mock_stage") {
    return {
      tone: "info" as const,
      message: "当前视频通话仍使用内置数字人模拟模式。再次点击后继续进入。",
    };
  }

  if (gateway.mode === "mock_iframe") {
    return {
      tone: "info" as const,
      message: "当前视频通话仍使用内置数字人播放器模式。再次点击后继续进入。",
    };
  }

  return null;
}
