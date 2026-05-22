import { msg } from "@lingui/macro";
import type { SystemStatus } from "@yinjie/contracts";
import type { useRuntimeTranslator } from "@yinjie/i18n";

type DigitalHumanGateway = SystemStatus["digitalHumanGateway"];
type Translator = ReturnType<typeof useRuntimeTranslator>;

export function resolveDigitalHumanGatewayStatusCopy(
  t: Translator,
  gateway?: DigitalHumanGateway,
) {
  if (!gateway) {
    return null;
  }

  if (gateway.mode === "external_iframe" && !gateway.ready) {
    if (!gateway.playerTemplateConfigured) {
      return {
        statusLabel: t(msg`数字人模板未配置`),
        statusHint: t(
          msg`外部数字人的播放地址还没配好，视频通话会先用占位画面，或切回内置模式。`,
        ),
        noticeTone: "warning" as const,
        noticeMessage: t(
          msg`外部数字人 \`playerUrlTemplate\` 没填。请到 Admin 的数字人服务配置里补上播放地址，再回来测试视频通话。`,
        ),
      };
    }

    if (!gateway.callbackTokenConfigured) {
      return {
        statusLabel: t(msg`数字人回调未配置`),
        statusHint: t(
          msg`播放地址已经填好了，但外部服务那边的状态回传还没配，画面就绪通知拿不到。`,
        ),
        noticeTone: "warning" as const,
        noticeMessage: t(
          msg`数字人服务的回调 token 没填。建议先补 \`callbackToken\`，否则外部播放器没法把画面状态回传到当前会话。`,
        ),
      };
    }

    if (!gateway.paramsValid) {
      return {
        statusLabel: t(msg`数字人参数无效`),
        statusHint: t(
          msg`外部服务的参数 JSON 解析失败了，播放地址虽然填了，但外部数字人需要的参数没传进去。`,
        ),
        noticeTone: "warning" as const,
        noticeMessage: t(
          msg`数字人服务的参数 JSON 不合法。请到 Admin 修正 \`providerParams\`，确认 JSON 没问题后再试一次视频通话。`,
        ),
      };
    }

    return {
      statusLabel: t(msg`数字人待配置`),
      statusHint: t(
        msg`外部数字人服务还没准备好，视频通话会先用占位画面，等配置好再切过去。`,
      ),
      noticeTone: "warning" as const,
      noticeMessage: gateway.message,
    };
  }

  if (gateway.mode === "external_iframe") {
    return {
      statusLabel: t(msg`外部数字人已就绪`),
      statusHint:
        gateway.paramsCount > 0
          ? t(
              msg`外部数字人服务已就绪，已传入 ${gateway.paramsCount} 个参数，接下来会优先用外部画面。`,
            )
          : t(
              msg`外部数字人服务已就绪，接下来会优先用外部画面。`,
            ),
      noticeTone: "info" as const,
      noticeMessage:
        gateway.paramsKeys.length > 0
          ? t(
              msg`外部数字人服务已接通，当前参数：${gateway.paramsKeys.join(" / ")}。`,
            )
          : gateway.message,
    };
  }

  if (gateway.mode === "mock_stage") {
    return {
      statusLabel: t(msg`数字人模拟模式`),
      statusHint: t(
        msg`当前用的是内置数字人画面，可以正常对话，只是还没切到外部真实视频。`,
      ),
      noticeTone: "info" as const,
      noticeMessage: t(
        msg`当前视频通话用内置数字人画面承载，可以先验证会话、语音和状态。`,
      ),
    };
  }

  return {
    statusLabel: t(msg`数字人内置播放器`),
    statusHint: t(
      msg`当前用的是内置数字人播放器，播放框架已经联通，但还没切到外部真实服务。`,
    ),
    noticeTone: "info" as const,
    noticeMessage: t(
      msg`当前视频通话用内置播放器，占位通话可用，但还不是外部真实数字人服务。`,
    ),
  };
}
