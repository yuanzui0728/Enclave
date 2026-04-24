import type { CSSProperties } from "react";
import { msg } from "@lingui/macro";
import type { ChatBackgroundAsset } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";

const t = translateRuntimeMessage;

export function buildChatBackgroundStyle(
  background?: ChatBackgroundAsset | null,
): CSSProperties | undefined {
  if (!background?.url) {
    return undefined;
  }

  return {
    backgroundImage: `url("${background.url}")`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
  };
}

export function getChatBackgroundLabel(
  background?: ChatBackgroundAsset | null,
) {
  return background?.label?.trim() || t(msg`未设置`);
}
