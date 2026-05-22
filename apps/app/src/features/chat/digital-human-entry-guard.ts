import { msg } from "@lingui/macro";
import type { SystemStatus } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";

const t = translateRuntimeMessage;

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
      message: t(msg`视频通话暂不可用`),
      continueLabel: t(msg`仍然进入`),
      voiceLabel: t(msg`改用语音`),
    };
  }

  if (gateway.mode === "mock_stage") {
    return {
      key: "mock_stage",
      tone: "info" as const,
      message: t(msg`视频画面暂用内置模拟`),
      continueLabel: t(msg`继续进入`),
      voiceLabel: t(msg`改用语音`),
    };
  }

  if (gateway.mode === "mock_iframe") {
    return {
      key: "mock_iframe",
      tone: "info" as const,
      message: t(msg`视频画面暂用内置播放`),
      continueLabel: t(msg`继续进入`),
      voiceLabel: t(msg`改用语音`),
    };
  }

  return null;
}
