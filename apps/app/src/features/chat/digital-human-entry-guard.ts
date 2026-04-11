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
      key: "external_iframe_not_ready",
      tone: "warning" as const,
      message: `当前数字人 Provider 未就绪。${gateway.message}`,
      continueLabel: "仍然进入视频通话",
      voiceLabel: "先改用语音通话",
    };
  }

  if (gateway.mode === "mock_stage") {
    return {
      key: "mock_stage",
      tone: "info" as const,
      message: "当前视频通话仍使用内置数字人模拟模式，画面会先以内置数字人舞台承载。",
      continueLabel: "进入模拟视频通话",
      voiceLabel: "改用语音通话",
    };
  }

  if (gateway.mode === "mock_iframe") {
    return {
      key: "mock_iframe",
      tone: "info" as const,
      message: "当前视频通话仍使用内置数字人播放器模式，暂未切到真实外部数字人 Provider。",
      continueLabel: "进入内置播放器",
      voiceLabel: "改用语音通话",
    };
  }

  return null;
}
