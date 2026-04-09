import type { CSSProperties } from "react";
import type { ChatBackgroundAsset } from "@yinjie/contracts";

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
  return background?.label?.trim() || "未设置";
}
